import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AttachCaseDocumentDto,
  CreateCaseDto,
  CreateCaseEventDto,
  CreateCaseEvidenceDto,
  CreateCaseIssueDto,
  EvidenceReferenceDto,
  UpdateCaseDto,
  UpdateCaseIssueDto,
} from './dto/case.dto.js';

const DOCUMENT_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  hash: true,
  sourceMetadata: true,
  extractionStatus: true,
  extractionTruncated: true,
  extractionReviewedAt: true,
  created_at: true,
} satisfies Prisma.DocumentSelect;

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: number, dto: CreateCaseDto) {
    return this.prisma.case.create({
      data: {
        ownerId,
        title: dto.title.trim(),
        internalReference: dto.internalReference?.trim() || null,
        publicReference: dto.publicReference?.trim() || null,
        caseFamily: dto.caseFamily,
        assignment: toJson(assignmentMetadata(dto.assignment)),
        shipment: Prisma.JsonNull,
        parties: Prisma.JsonNull,
        damageAssessment: Prisma.JsonNull,
        openQuestions: dto.openQuestions ?? [],
      },
    });
  }

  async list(ownerId: number) {
    return this.prisma.case.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        internalReference: true,
        publicReference: true,
        caseFamily: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(caseId: string, ownerId: number) {
    const record = await this.prisma.case.findFirst({
      where: { id: caseId, ownerId, deletedAt: null },
      include: {
        documents: {
          orderBy: { attachedAt: 'asc' },
          include: { document: { select: DOCUMENT_SELECT } },
        },
        events: {
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          include: {
            sourceLinks: {
              include: {
                caseDocument: { select: { id: true, sourceCode: true } },
              },
            },
          },
        },
        evidence: {
          orderBy: { createdAt: 'asc' },
          include: {
            sourceLinks: {
              include: {
                caseDocument: { select: { id: true, sourceCode: true } },
              },
            },
          },
        },
        issues: {
          orderBy: { createdAt: 'asc' },
          include: {
            evidence: {
              include: { evidence: { include: { sourceLinks: true } } },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Case not found');
    }

    return {
      ...record,
      assignment: assignmentMetadata(record.assignment),
      shipment: null,
      parties: null,
      damageAssessment: null,
    };
  }

  async update(caseId: string, ownerId: number, dto: UpdateCaseDto) {
    const current = await this.requireOwnedCase(caseId, ownerId);
    if (dto.status === 'APPROVED') {
      throw new BadRequestException(
        'Approve a generated report artifact to complete the case',
      );
    }
    const hasContentChanges = Object.keys(dto).some((key) => key !== 'status');

    const data: Prisma.CaseUpdateInput = {
      ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
      ...(dto.internalReference === undefined
        ? {}
        : { internalReference: dto.internalReference?.trim() || null }),
      ...(dto.publicReference === undefined
        ? {}
        : { publicReference: dto.publicReference?.trim() || null }),
      ...(dto.caseFamily === undefined ? {} : { caseFamily: dto.caseFamily }),
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(hasContentChanges ? { revision: { increment: 1 } } : {}),
      ...(hasContentChanges &&
      current.status === 'APPROVED' &&
      dto.status === undefined
        ? { status: 'DRAFT' }
        : {}),
      ...(dto.assignment === undefined
        ? {}
        : { assignment: toJson(assignmentMetadata(dto.assignment)) }),
      ...(dto.openQuestions === undefined
        ? {}
        : { openQuestions: dto.openQuestions }),
      ...(dto.reportTemplateId === undefined
        ? {}
        : { reportTemplateId: dto.reportTemplateId }),
      ...(dto.clicheSetVersion === undefined
        ? {}
        : { clicheSetVersion: dto.clicheSetVersion }),
    };

    const updated = await this.prisma.case.update({
      where: { id: caseId },
      data,
    });
    return {
      ...updated,
      assignment: assignmentMetadata(updated.assignment),
      shipment: null,
      parties: null,
      damageAssessment: null,
    };
  }

  async attachDocument(
    caseId: string,
    ownerId: number,
    dto: AttachCaseDocumentDto,
  ) {
    const current = await this.requireOwnedCase(caseId, ownerId);
    const availability = dto.availability ?? 'ORIGINAL_ACCESSIBLE';
    const excerptText = dto.excerptText?.trim() || null;

    if (availability === 'ORIGINAL_ACCESSIBLE' && !dto.documentId) {
      throw new BadRequestException(
        'An accessible original must refer to an uploaded document',
      );
    }
    if (availability === 'EXCERPT_ONLY' && !dto.documentId && !excerptText) {
      throw new BadRequestException(
        'An excerpt-only source must include an uploaded excerpt or excerpt text',
      );
    }
    if (availability !== 'EXCERPT_ONLY' && excerptText) {
      throw new BadRequestException(
        'Excerpt text can only be attached to an excerpt-only source',
      );
    }
    if (
      ['REFERENCED_NOT_ACCESSIBLE', 'NOT_PROVIDED'].includes(availability) &&
      dto.documentId
    ) {
      throw new BadRequestException(
        'An unavailable source cannot refer to an uploaded document',
      );
    }

    if (dto.documentId) {
      const document = await this.prisma.document.findFirst({
        where: { id: dto.documentId, ownerId, deleted_at: null },
        select: { id: true },
      });
      if (!document) {
        throw new NotFoundException('Document not found');
      }
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const counter = await transaction.case.update({
          where: { id: caseId },
          data: {
            nextDocumentNumber: { increment: 1 },
            revision: { increment: 1 },
            ...(current.status === 'APPROVED' ? { status: 'DRAFT' } : {}),
          },
          select: { nextDocumentNumber: true },
        });
        const sourceCode = `DOC-${String(counter.nextDocumentNumber - 1).padStart(3, '0')}`;

        return transaction.caseDocument.create({
          data: {
            caseId,
            sourceCode,
            documentId: dto.documentId,
            displayName: dto.displayName?.trim() || null,
            documentType: dto.documentType?.trim() || null,
            verificationPurpose: dto.verificationPurpose?.trim() || null,
            excerptText,
            documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
            senderOrAuthor: dto.senderOrAuthor?.trim() || null,
            availability,
            metadata: dto.metadata ? toJson(dto.metadata) : Prisma.JsonNull,
          },
          include: { document: { select: DOCUMENT_SELECT } },
        });
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Document is already linked to this case');
      }
      throw error;
    }
  }

  async addEvent(caseId: string, ownerId: number, dto: CreateCaseEventDto) {
    await this.requireOwnedCase(caseId, ownerId);
    const references = await this.resolveSources(
      caseId,
      dto.epistemicStatus,
      dto.sources ?? [],
    );

    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.caseEvent.create({
        data: {
          caseId,
          event: dto.event.trim(),
          date: dto.date ? new Date(dto.date) : null,
          dateType: dto.dateType ?? 'UNKNOWN',
          epistemicStatus: dto.epistemicStatus,
          caseDocumentId: references[0]?.caseDocumentId ?? null,
          pageNumber: references[0]?.pageNumber ?? null,
          excerpt: references[0]?.excerpt ?? null,
          sourceLinks: { create: references },
        },
        include: {
          sourceLinks: {
            include: { caseDocument: { select: { sourceCode: true } } },
          },
        },
      });
      await bumpRevision(transaction, caseId);
      return event;
    });
  }

  async addEvidence(
    caseId: string,
    ownerId: number,
    dto: CreateCaseEvidenceDto,
    calculationMetadata?: Prisma.InputJsonObject,
  ) {
    await this.requireOwnedCase(caseId, ownerId);
    ensureJsonValue(dto.value);
    if (
      (dto.epistemicStatus === 'CALCULATED') !==
      Boolean(calculationMetadata)
    ) {
      throw new BadRequestException(
        'Calculated evidence must come from a deterministic backend calculation',
      );
    }
    if (calculationMetadata) {
      ensureJsonValue(calculationMetadata);
    }
    const references = await this.resolveSources(
      caseId,
      dto.epistemicStatus,
      dto.sources ?? [],
    );

    return this.prisma.$transaction(async (transaction) => {
      const evidence = await transaction.caseEvidence.create({
        data: {
          caseId,
          fieldKey: dto.fieldKey.trim(),
          value: toJson(dto.value),
          unit: dto.unit?.trim() || null,
          comparisonGroup: dto.comparisonGroup?.trim() || null,
          epistemicStatus: dto.epistemicStatus,
          calculationMetadata: calculationMetadata
            ? toJson(calculationMetadata)
            : Prisma.DbNull,
          attribution: dto.attribution?.trim() || null,
          caseDocumentId: references[0]?.caseDocumentId ?? null,
          pageNumber: references[0]?.pageNumber ?? null,
          excerpt: references[0]?.excerpt ?? null,
          sourceLinks: { create: references },
        },
        include: {
          sourceLinks: {
            include: { caseDocument: { select: { sourceCode: true } } },
          },
        },
      });
      await bumpRevision(transaction, caseId);
      return evidence;
    });
  }

  async addIssue(caseId: string, ownerId: number, dto: CreateCaseIssueDto) {
    await this.requireOwnedCase(caseId, ownerId);
    const evidenceIds = [...new Set(dto.evidenceIds ?? [])];
    await this.assertEvidenceBelongsToCase(caseId, evidenceIds);

    return this.prisma.$transaction(async (transaction) => {
      const issue = await transaction.caseIssue.create({
        data: {
          caseId,
          ruleId: dto.ruleId,
          ruleVersion: dto.ruleVersion,
          status: dto.status,
          severity: dto.severity,
          title: dto.title.trim(),
          explanation: dto.explanation.trim(),
          suggestedCheck: dto.suggestedCheck?.trim() || null,
          evidence: {
            create: evidenceIds.map((evidenceId) => ({ evidenceId })),
          },
        },
        include: { evidence: true },
      });
      await bumpRevision(transaction, caseId);
      return issue;
    });
  }

  async updateIssue(
    caseId: string,
    ownerId: number,
    issueId: string,
    dto: UpdateCaseIssueDto,
  ) {
    await this.requireOwnedCase(caseId, ownerId);
    const existing = await this.prisma.caseIssue.findFirst({
      where: { id: issueId, caseId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Case issue not found');
    }

    const evidenceIds =
      dto.evidenceIds === undefined ? undefined : [...new Set(dto.evidenceIds)];
    if (evidenceIds) {
      await this.assertEvidenceBelongsToCase(caseId, evidenceIds);
    }

    return this.prisma.$transaction(async (transaction) => {
      const issue = await transaction.caseIssue.update({
        where: { id: issueId },
        data: {
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.severity === undefined ? {} : { severity: dto.severity }),
          ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
          ...(dto.explanation === undefined
            ? {}
            : { explanation: dto.explanation.trim() }),
          ...(dto.suggestedCheck === undefined
            ? {}
            : { suggestedCheck: dto.suggestedCheck?.trim() || null }),
        },
      });

      if (evidenceIds) {
        await transaction.caseIssueEvidence.deleteMany({ where: { issueId } });
        if (evidenceIds.length) {
          await transaction.caseIssueEvidence.createMany({
            data: evidenceIds.map((evidenceId) => ({ issueId, evidenceId })),
          });
        }
      }

      await bumpRevision(transaction, caseId);

      return transaction.caseIssue.findUniqueOrThrow({
        where: { id: issue.id },
        include: { evidence: true },
      });
    });
  }

  async documentRegister(caseId: string, ownerId: number) {
    await this.requireOwnedCase(caseId, ownerId);
    const rows = await this.prisma.caseDocument.findMany({
      where: { caseId },
      orderBy: { attachedAt: 'asc' },
      include: { document: { select: DOCUMENT_SELECT } },
    });

    return rows.map((row) => ({
      id: row.id,
      sourceCode: row.sourceCode,
      document: row.displayName ?? row.document?.fileName ?? null,
      documentType: row.documentType,
      verificationPurpose: row.verificationPurpose,
      excerptText: row.excerptText,
      availability: row.availability,
      extractionStatus: row.document?.extractionStatus ?? null,
      extractionTruncated: row.document?.extractionTruncated ?? false,
      extractionReviewedAt: row.document?.extractionReviewedAt ?? null,
      sha256: row.document?.hash ?? null,
      documentDate: row.documentDate,
      senderOrAuthor: row.senderOrAuthor,
      metadata: row.metadata,
      emailMetadata: row.document?.sourceMetadata ?? null,
      attachedAt: row.attachedAt,
    }));
  }

  async requireOwnedCase(caseId: string, ownerId: number) {
    const record = await this.prisma.case.findFirst({
      where: { id: caseId, ownerId, deletedAt: null },
      select: { id: true, status: true, revision: true },
    });
    if (!record) {
      throw new NotFoundException('Case not found');
    }
    return record;
  }

  private async resolveSources(
    caseId: string,
    status: string,
    sources: EvidenceReferenceDto[],
  ) {
    const uniqueCodes = new Set(sources.map((source) => source.sourceCode));
    if (uniqueCodes.size !== sources.length) {
      throw new BadRequestException('Source codes must be unique');
    }
    if (status !== 'UNKNOWN' && sources.length === 0) {
      throw new BadRequestException(
        'Every non-unknown event or fact must cite at least one source',
      );
    }

    if (!sources.length) {
      return [];
    }

    const attached = await this.prisma.caseDocument.findMany({
      where: {
        caseId,
        sourceCode: { in: sources.map((source) => source.sourceCode) },
      },
      include: { document: { select: { extractedText: true } } },
    });
    const byCode = new Map(attached.map((row) => [row.sourceCode, row]));
    if (attached.length !== sources.length) {
      throw new BadRequestException(
        'Every source must be registered on the same case before it can be cited',
      );
    }

    return sources.map((source) => {
      const row = byCode.get(source.sourceCode)!;
      const availableText = row.document?.extractedText || row.excerptText;
      if (
        source.excerpt &&
        availableText &&
        !containsNormalized(availableText, source.excerpt)
      ) {
        throw new BadRequestException(
          `The excerpt does not match the extracted text for ${source.sourceCode}`,
        );
      }

      return {
        caseDocumentId: row.id,
        pageNumber: source.pageNumber,
        excerpt: source.excerpt?.trim() || null,
      };
    });
  }

  private async assertEvidenceBelongsToCase(
    caseId: string,
    evidenceIds: string[],
  ) {
    if (!evidenceIds.length) {
      return;
    }
    const rows = await this.prisma.caseEvidence.findMany({
      where: { caseId, id: { in: evidenceIds } },
      select: { id: true },
    });
    if (rows.length !== evidenceIds.length) {
      throw new BadRequestException(
        'Evidence references must belong to the same case',
      );
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  ensureJsonValue(value);
  return value as Prisma.InputJsonValue;
}

function assignmentMetadata(value: unknown): Record<string, unknown> {
  const assignment = isRecord(value) ? value : {};
  const client = assignment.client;
  const requestedScope = assignment.requestedScope;
  const limitations = assignment.limitations;
  return {
    client: typeof client === 'string' ? client : null,
    requestedScope: Array.isArray(requestedScope)
      ? requestedScope.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    limitations: Array.isArray(limitations)
      ? limitations.filter((item): item is string => typeof item === 'string')
      : [],
    sourceStatus: 'USER_ENTERED_SCOPE_NOT_CASE_EVIDENCE',
    sourceRefs: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureJsonValue(value: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new BadRequestException('Value must be valid JSON data');
  }
  if (!serialized || serialized.length > 20_000) {
    throw new BadRequestException('Value must not exceed 20 KB');
  }
}

function containsNormalized(text: string, excerpt: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  return normalize(text).includes(normalize(excerpt));
}

async function bumpRevision(
  transaction: Prisma.TransactionClient,
  caseId: string,
): Promise<void> {
  const approved = await transaction.case.updateMany({
    where: { id: caseId, status: 'APPROVED' },
    data: { revision: { increment: 1 }, status: 'DRAFT' },
  });
  if (!approved.count) {
    await transaction.case.update({
      where: { id: caseId },
      data: { revision: { increment: 1 } },
    });
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
