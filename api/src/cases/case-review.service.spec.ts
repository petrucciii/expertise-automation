import { describe, expect, it, vi } from 'vitest';
import type { CasesService } from './cases.service.js';
import {
  CaseReviewService,
  findComparableConflicts,
} from './case-review.service.js';

describe('CaseReviewService', () => {
  it('does not compare different cargo scopes without a shared comparison group', async () => {
    const record = {
      id: 'case-1',
      events: [],
      issues: [],
      openQuestions: [],
      documents: [],
      evidence: [
        evidence('container-1', 1080, 'container-1'),
        evidence('container-2', 894, 'container-2'),
        evidence('receipt-tally', 24, null),
      ],
    };
    const getMock = vi.fn().mockResolvedValue(record);
    const cases = { get: getMock } as unknown as CasesService;
    const service = new CaseReviewService(cases);

    const review = await service.generate('case-1', 1);

    expect(review.computedChecks.comparableValueDifferences).toEqual([]);
    expect(getMock).toHaveBeenCalledWith('case-1', 1);
  });

  it('flags different values only inside a surveyor-defined comparison group', () => {
    const conflicts = findComparableConflicts([
      evidence('one', 29, 'same-container', 'pallets'),
      evidence('two', 30, 'same-container', 'pallets'),
      evidence('other-scope', 24, 'warehouse-receipt', 'pallets'),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].values).toHaveLength(2);
    expect(conflicts[0].explanation).toContain('No value has been selected');
  });
});

function evidence(
  id: string,
  value: number,
  comparisonGroup: string | null,
  unit: string | null = 'cartons',
) {
  return {
    id,
    fieldKey: 'shipment.carton_count',
    value,
    unit,
    comparisonGroup,
    sourceLinks: [],
  };
}
