import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EvidenceStatus, Prisma } from '../generated/prisma/client.js';
import { DocumentExtractService } from '../documents/document-extract.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CasesService } from './cases.service.js';
import type { CalculateNumericColumnDto } from '../documents/dto/calculate-numeric-column.dto.js';

const CALCULATION_METHOD_VERSION = 'numeric-column-summary-1.0';

@Injectable()
export class CaseTabularAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly documents: DocumentExtractService,
  ) {}

  async calculateColumn(
    caseId: string,
    sourceCode: string,
    ownerId: number,
    dto: CalculateNumericColumnDto,
  ) {
    await this.cases.requireOwnedCase(caseId, ownerId);
    const source = await this.prisma.caseDocument.findFirst({
      where: { caseId, sourceCode },
      include: {
        document: {
          select: { id: true, ownerId: true, deleted_at: true },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('Case source not found');
    }
    if (
      source.availability !== 'ORIGINAL_ACCESSIBLE' ||
      !source.document ||
      source.document.ownerId !== ownerId ||
      source.document.deleted_at !== null
    ) {
      throw new BadRequestException(
        'Numeric calculations require an accessible original document',
      );
    }

    const calculation = await this.documents.calculateNumericColumn(
      source.document.id,
      ownerId,
      {
        worksheetName: dto.worksheetName,
        columnHeader: dto.columnHeader,
        headerRow: dto.headerRow ?? 1,
        operation: dto.operation,
        decimalSeparator: dto.decimalSeparator,
        thousandsSeparator: dto.thousandsSeparator,
      },
    );
    const unit = dto.unit?.trim() || (dto.operation === 'COUNT' ? 'rows' : '');
    if (!unit) {
      throw new BadRequestException(
        'Specify the measurement unit for a numeric calculation',
      );
    }

    const metadata: Prisma.InputJsonObject = {
      methodVersion: CALCULATION_METHOD_VERSION,
      operation: calculation.operation,
      formula: calculation.formula,
      worksheetName: calculation.worksheetName,
      columnHeader: calculation.columnHeader,
      headerRow: calculation.headerRow,
      firstDataRow: calculation.firstDataRow,
      lastDataRow: calculation.lastDataRow,
      includedCount: calculation.includedCount,
      blankCellCount: calculation.blankCellCount,
      nonNumericCellCount: calculation.nonNumericCellCount,
      formulaCellsExcluded: calculation.formulaCellsExcluded,
      sourceSha256: calculation.sourceSha256,
    };

    const evidence = await this.cases.addEvidence(
      caseId,
      ownerId,
      {
        fieldKey: dto.fieldKey,
        value: calculation.result,
        unit,
        comparisonGroup: dto.comparisonGroup,
        epistemicStatus: EvidenceStatus.CALCULATED,
        sources: [{ sourceCode }],
      },
      metadata,
    );

    return {
      evidence,
      calculation: {
        ...calculation,
        sourceCode,
        methodVersion: CALCULATION_METHOD_VERSION,
      },
    };
  }
}
