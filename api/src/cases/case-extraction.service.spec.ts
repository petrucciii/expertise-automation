import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  ExtractionSuggestionKind,
  ExtractionSuggestionStatus,
  EvidenceStatus,
} from '../generated/prisma/client.js';
import type { GeminiGenerateContentService } from '../ai/gemini-generate-content.service.js';
import type { DocumentExtractService } from '../documents/document-extract.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CasesService } from './cases.service.js';
import { parseExtractionResponse } from './case-extraction.service.js';
import { CaseExtractionService } from './case-extraction.service.js';

describe('parseExtractionResponse', () => {
  it('keeps only suggestions with exact cited source text and valid dates', () => {
    const result = parseExtractionResponse(
      {
        documentType: 'warehouse_tally',
        facts: [
          {
            fieldKey: 'shipment.pallet_count',
            valueText: '24 wrapped pallets',
            numericValue: 24,
            unit: 'pallets',
            epistemicStatus: 'STATED_IN_DOCUMENT',
            attribution: null,
            pageNumber: 2,
            excerpt: 'Received 24 wrapped pallets.',
          },
          {
            fieldKey: 'shipment.carton_count',
            valueText: '894 cartons',
            numericValue: 894,
            unit: 'cartons',
            epistemicStatus: 'STATED_IN_DOCUMENT',
            attribution: null,
            pageNumber: 2,
            excerpt: 'The source actually says 894 cases.',
          },
        ],
        events: [
          {
            event: 'The tally was signed.',
            date: '2026-10-08',
            dateType: 'DOCUMENT',
            epistemicStatus: 'STATED_IN_DOCUMENT',
            attribution: null,
            pageNumber: 2,
            excerpt: 'Signed at 2026-10-08.',
          },
          {
            event: 'The load was delivered.',
            date: 'not-a-date',
            dateType: 'EVENT',
            epistemicStatus: 'REPORTED',
            attribution: 'Warehouse',
            pageNumber: 2,
            excerpt: 'The load was delivered.',
          },
        ],
        openQuestions: ['Does the tally cover the whole shipment?'],
      },
      [
        {
          pageNumber: 2,
          text: 'Received 24 wrapped pallets. Signed at 2026-10-08.',
        },
      ],
      'Received 24 wrapped pallets. Signed at 2026-10-08.',
    );

    expect(result.documentType).toBe('warehouse_tally');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      numericValue: 24,
      unit: 'pallets',
      epistemicStatus: 'STATED_IN_DOCUMENT',
      pageNumber: 2,
    });
    expect(result.events).toHaveLength(1);
    expect(result.openQuestions).toEqual([
      'Does the tally cover the whole shipment?',
    ]);
  });

  it('writes selected suggestions as sourced facts only after explicit acceptance', async () => {
    const acceptedEvidence = { id: 'evidence-1' };
    const suggestion = {
      id: 'suggestion-1',
      kind: ExtractionSuggestionKind.FACT,
      status: ExtractionSuggestionStatus.PENDING,
      content: {
        fieldKey: 'shipment.carton_count',
        valueText: '1080 cartons',
        numericValue: 1080,
        unit: 'cartons',
        epistemicStatus: EvidenceStatus.STATED_IN_DOCUMENT,
        attribution: null,
        pageNumber: null,
        excerpt: 'The shipment contained 1080 cartons.',
      },
    };
    const tx = {
      caseExtractionSuggestion: {
        findMany: vi.fn().mockResolvedValue([suggestion]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      caseEvidence: { create: vi.fn().mockResolvedValue(acceptedEvidence) },
      caseExtractionProposal: {
        update: vi
          .fn()
          .mockResolvedValue({ id: 'proposal-1', status: 'REVIEWED' }),
      },
      case: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
    };
    const proposal = {
      id: 'proposal-1',
      status: 'PENDING',
      caseDocumentId: 'case-document-1',
      caseDocument: {
        availability: 'ORIGINAL_ACCESSIBLE',
        document: {
          id: 'document-1',
          deleted_at: null,
          extractedText: 'The shipment contained 1080 cartons.',
          extractedPages: null,
        },
      },
    };
    const prisma = {
      caseExtractionProposal: {
        findFirst: vi.fn().mockResolvedValue(proposal),
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const cases = {
      requireOwnedCase: vi.fn().mockResolvedValue({ id: 'case-1' }),
    };
    const service = new CaseExtractionService(
      prisma as unknown as PrismaService,
      cases as unknown as CasesService,
      {} as DocumentExtractService,
      {} as GeminiGenerateContentService,
    );

    await service.acceptSuggestions('case-1', 'proposal-1', 7, {
      suggestionIds: ['suggestion-1'],
    });

    expect(tx.caseEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          caseId: 'case-1',
          fieldKey: 'shipment.carton_count',
          value: 1080,
          epistemicStatus: EvidenceStatus.STATED_IN_DOCUMENT,
          caseDocumentId: 'case-document-1',
        }),
      }),
    );
    expect(tx.caseExtractionSuggestion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: expect.objectContaining({
          status: ExtractionSuggestionStatus.ACCEPTED,
          caseEvidenceId: 'evidence-1',
          reviewedById: 7,
        }),
      }),
    );
  });
});
