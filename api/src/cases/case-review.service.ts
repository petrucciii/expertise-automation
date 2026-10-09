import { Injectable } from '@nestjs/common';
import { CasesService } from './cases.service.js';

@Injectable()
export class CaseReviewService {
  constructor(private readonly cases: CasesService) {}

  async generate(caseId: string, ownerId: number) {
    const record = await this.cases.get(caseId, ownerId);
    const conflicts = findComparableConflicts(record.evidence);
    const unavailableSources = record.documents
      .filter((document) => document.availability !== 'ORIGINAL_ACCESSIBLE')
      .map((document) => ({
        sourceCode: document.sourceCode,
        document: document.displayName ?? document.document?.fileName ?? null,
        availability: document.availability,
        status: 'NOT_VERIFIABLE' as const,
        explanation: availabilityExplanation(document.availability),
      }));

    return {
      schemaVersion: '1.0',
      status: 'PRELIMINARY_DRAFT',
      caseId: record.id,
      generatedAt: new Date().toISOString(),
      chronology: record.events.map((event) => ({
        event: event.event,
        date: event.date,
        dateType: event.dateType,
        epistemicStatus: event.epistemicStatus,
        sources: event.sourceLinks.map((source) => ({
          sourceCode: source.caseDocument.sourceCode,
          pageNumber: source.pageNumber,
          excerpt: source.excerpt,
        })),
      })),
      computedChecks: {
        comparableValueDifferences: conflicts,
        unavailableSources,
      },
      surveyorChecklist: record.issues.map((issue) => ({
        id: issue.id,
        ruleId: issue.ruleId,
        ruleVersion: issue.ruleVersion,
        status: issue.status,
        severity: issue.severity,
        title: issue.title,
        explanation: issue.explanation,
        suggestedCheck: issue.suggestedCheck,
        evidenceIds: issue.evidence.map((link) => link.evidence.id),
      })),
      openQuestions: record.openQuestions,
      limitations: [
        'This is a working review and requires a surveyor to verify each finding.',
        'The system compares values only when the surveyor has assigned the same comparison group and unit.',
        'A source marked unavailable in this record is not proof that it is absent from the underlying case file.',
        'No contractual or legal deadline is evaluated unless an approved rule is explicitly configured.',
      ],
    };
  }
}

export function findComparableConflicts(
  evidence: Array<{
    id: string;
    fieldKey: string;
    value: unknown;
    unit: string | null;
    comparisonGroup: string | null;
    sourceLinks: Array<{
      caseDocument: { sourceCode: string };
      pageNumber: number | null;
    }>;
  }>,
) {
  const groups = new Map<string, typeof evidence>();
  for (const item of evidence) {
    if (!item.comparisonGroup) {
      continue;
    }
    const key = `${item.fieldKey}\u0000${item.unit ?? ''}\u0000${item.comparisonGroup}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.values()]
    .filter(
      (group) => new Set(group.map((item) => stableJson(item.value))).size > 1,
    )
    .map((group) => ({
      status: 'ISSUE_FOUND' as const,
      fieldKey: group[0].fieldKey,
      unit: group[0].unit,
      comparisonGroup: group[0].comparisonGroup,
      explanation:
        'The surveyor marked these entries as comparable, but their recorded values differ. No value has been selected or overwritten.',
      suggestedCheck:
        'Verify the source, scope, unit, and transport stage for each entry before resolving the difference.',
      values: group.map((item) => ({
        evidenceId: item.id,
        value: item.value,
        sources: item.sourceLinks.map((source) => ({
          sourceCode: source.caseDocument.sourceCode,
          pageNumber: source.pageNumber,
        })),
      })),
    }));
}

function availabilityExplanation(availability: string): string {
  switch (availability) {
    case 'EXCERPT_ONLY':
      return 'Only an excerpt is registered; the full original was not accessible to the software.';
    case 'REFERENCED_NOT_ACCESSIBLE':
      return 'The source is referenced but not accessible in the registered materials. This does not establish whether it exists elsewhere in the actual case file.';
    case 'NOT_PROVIDED':
      return 'No file or excerpt is registered for this source. This does not establish whether it exists outside the materials reviewed.';
    default:
      return 'The source availability requires surveyor review.';
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
