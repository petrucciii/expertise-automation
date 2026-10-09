import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  ArtifactStatus,
  CaseArtifactType,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CasesService } from './cases.service.js';
import {
  CaseArtifactsService,
  toStructuredCase,
} from './case-artifacts.service.js';

describe('toStructuredCase', () => {
  it('exports material details only through evidence with source references', () => {
    const record = {
      id: 'case-1',
      internalReference: null,
      publicReference: 'REF-1',
      caseFamily: 'CARGO_DAMAGE',
      status: 'INTAKE',
      revision: 2,
      title: 'Cargo case',
      assignment: {
        client: 'Client A',
        requestedScope: ['Condition survey'],
        limitations: [],
      },
      shipment: { origin: 'UNSOURCED_ORIGIN' },
      parties: { carrier: 'UNSOURCED_CARRIER' },
      damageAssessment: { cause: 'UNSOURCED_CAUSE' },
      documents: [
        {
          documentId: 'document-1',
          sourceCode: 'DOC-001',
          documentType: 'bill_of_lading',
          displayName: 'bill.pdf',
          documentDate: null,
          senderOrAuthor: null,
          availability: 'ORIGINAL_ACCESSIBLE',
          excerptText: null,
          document: {
            fileName: 'bill.pdf',
            extractionStatus: 'EXTRACTED',
            extractionTruncated: false,
            extractionReviewedAt: null,
            hash: 'a'.repeat(64),
            sourceMetadata: null,
          },
        },
      ],
      events: [],
      evidence: [
        {
          id: 'evidence-1',
          fieldKey: 'shipment.carton_count',
          value: 1080,
          unit: 'cartons',
          comparisonGroup: 'load-1',
          epistemicStatus: 'STATED_IN_DOCUMENT',
          attribution: null,
          sourceLinks: [
            {
              caseDocument: { sourceCode: 'DOC-001' },
              pageNumber: 2,
              excerpt: '1,080 cartons',
            },
          ],
        },
        {
          id: 'evidence-2',
          fieldKey: 'damage.condition',
          value: 'Crushed cartons',
          unit: null,
          comparisonGroup: null,
          epistemicStatus: 'OBSERVED',
          attribution: null,
          sourceLinks: [
            {
              caseDocument: { sourceCode: 'DOC-002' },
              pageNumber: 4,
              excerpt: 'Several cartons were crushed.',
            },
          ],
        },
      ],
      issues: [],
      openQuestions: ['Obtain the temperature record.'],
      reportTemplateId: 'cargo_damage_general_it_v1',
      clicheSetVersion: null,
    } as unknown as Parameters<typeof toStructuredCase>[0];

    const result = toStructuredCase(record);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      schema_version: '1.0',
      assignment: {
        source_status: 'user_entered_scope_not_case_evidence',
        source_refs: [],
      },
      shipment: {
        containers: [
          {
            field: 'shipment.carton_count',
            epistemic_status: 'stated_in_document',
            source_refs: [
              {
                source_code: 'DOC-001',
                page_number: 2,
                excerpt: '1,080 cartons',
              },
            ],
          },
        ],
        transport_document_refs: ['DOC-001'],
      },
      damage_assessment: {
        direct_observations_by_surveyor: [
          {
            field: 'damage.condition',
            source_refs: [
              {
                source_code: 'DOC-002',
                page_number: 4,
                excerpt: 'Several cartons were crushed.',
              },
            ],
          },
        ],
      },
    });
    expect(serialized).not.toContain('UNSOURCED_');
  });
});

describe('CaseArtifactsService manual revisions', () => {
  it('includes registered excerpts in the context sent to the AI', async () => {
    const prisma = {
      caseDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceCode: 'DOC-002',
            displayName: 'Survey report excerpt',
            documentType: 'surveyor_report',
            availability: 'EXCERPT_ONLY',
            documentDate: null,
            senderOrAuthor: null,
            excerptText: 'The survey report records damaged cartons.',
            document: null,
          },
        ]),
      },
    } as unknown as PrismaService;
    const cases = {
      requireOwnedCase: vi.fn().mockResolvedValue({ id: 'case-1' }),
    } as unknown as CasesService;
    const service = new CaseArtifactsService(
      prisma,
      cases,
      {} as never,
      {} as never,
      {} as never,
    );
    const contextBuilder = Reflect.get(service, 'aiContext') as (
      caseId: string,
      ownerId: number,
      record: Awaited<ReturnType<CasesService['get']>>,
    ) => Promise<{ documents: Array<Record<string, unknown>> }>;
    const record = {
      id: 'case-1',
      title: 'Cargo case',
      publicReference: null,
      caseFamily: 'CARGO_DAMAGE',
      status: 'INTAKE',
      assignment: null,
      openQuestions: [],
      events: [],
      evidence: [],
      issues: [],
    } as unknown as Awaited<ReturnType<CasesService['get']>>;

    const context = await contextBuilder.call(service, 'case-1', 1, record);

    expect(context.documents[0]).toMatchObject({
      sourceCode: 'DOC-002',
      sourceTextType: 'REGISTERED_EXCERPT',
      registeredExcerpt: 'The survey report records damaged cartons.',
      extractedText: null,
      contextTruncated: false,
    });
  });

  it('stores a source-checked surveyor edit as the next immutable version', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'artifact-2', version: 2 });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ caseRevision: 4 })
      .mockResolvedValueOnce({ version: 1 });
    const prisma = {
      caseArtifact: { findFirst, create },
      case: { update: vi.fn() },
    } as unknown as PrismaService;
    const cases = {
      requireOwnedCase: vi.fn().mockResolvedValue({
        revision: 4,
        status: 'DRAFT',
      }),
      get: vi.fn().mockResolvedValue({
        documents: [{ sourceCode: 'DOC-001' }],
        evidence: [{ id: 'evidence-1' }],
      }),
    } as unknown as CasesService;
    const service = new CaseArtifactsService(
      prisma,
      cases,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.saveManualRevision(
      'case-1',
      1,
      CaseArtifactType.SURVEY_REPORT_DRAFT,
      {
        content: {
          sections: [
            {
              id: 'shipment-and-cargo',
              paragraphs: ['The order records frozen cargo.'],
              sourceCodes: ['DOC-001'],
            },
          ],
        },
      },
    );

    expect(result).toMatchObject({ id: 'artifact-2', version: 2 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ArtifactStatus.DRAFT,
          caseRevision: 4,
          promptVersion: 'manual-edit-1.0',
          content: {
            sections: [
              {
                id: 'shipment-and-cargo',
                paragraphs: ['The order records frozen cargo.'],
                sourceCodes: ['DOC-001'],
              },
            ],
          },
        }),
      }),
    );
  });

  it('rejects a manual report revision that invents a source code', async () => {
    const create = vi.fn();
    const prisma = {
      caseArtifact: {
        findFirst: vi.fn().mockResolvedValue({ caseRevision: 4 }),
        create,
      },
      case: { update: vi.fn() },
    } as unknown as PrismaService;
    const cases = {
      requireOwnedCase: vi.fn().mockResolvedValue({
        revision: 4,
        status: 'DRAFT',
      }),
      get: vi.fn().mockResolvedValue({
        documents: [{ sourceCode: 'DOC-001' }],
        evidence: [],
      }),
    } as unknown as CasesService;
    const service = new CaseArtifactsService(
      prisma,
      cases,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.saveManualRevision(
        'case-1',
        1,
        CaseArtifactType.SURVEY_REPORT_DRAFT,
        {
          content: {
            sections: [
              {
                id: 'shipment-and-cargo',
                paragraphs: ['Unsupported statement.'],
                sourceCodes: ['DOC-999'],
              },
            ],
          },
        },
      ),
    ).rejects.toThrow('Artifact revision contains an unknown source reference');
    expect(create).not.toHaveBeenCalled();
  });
});
