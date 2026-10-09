import { describe, expect, it, vi } from 'vitest';
import type { CasesService } from './cases.service.js';
import { CaseReportService } from './case-report.service.js';

function record(evidence: unknown[] = [], events: unknown[] = []) {
  return {
    id: 'case-test',
    title: 'Cargo declaration',
    reportTemplateId: 'cargo_damage_general_it_v1',
    clicheSetVersion: null,
    documents: [
      {
        sourceCode: 'DOC-001',
        availability: 'EXCERPT_ONLY',
        displayName: 'Court order excerpt',
      },
    ],
    evidence,
    events,
    openQuestions: ['Obtain the original survey records.'],
  };
}
function evidence(status: string, value: unknown = 'wet cartons') {
  return {
    id: `fact-${status}`,
    fieldKey: 'damage.condition',
    value,
    unit: null,
    epistemicStatus: status,
    attribution: 'The consignee',
    calculationMetadata: null,
    sourceLinks: [
      {
        caseDocument: { sourceCode: 'DOC-001' },
        pageNumber: 2,
        excerpt: 'The consignee reports wet cartons.',
      },
    ],
  };
}
function service(value: unknown) {
  return new CaseReportService({
    get: vi.fn().mockResolvedValue(value),
  } as unknown as CasesService);
}

describe('Report wording and epistemic boundaries', () => {
  it.each([
    ['OBSERVED', 'La pratica registra un rilievo del perito'],
    ['REPORTED', 'The consignee riferisce'],
    ['STATED_IN_DOCUMENT', 'Il documento DOC-001, p. 2 riporta'],
    ['CALCULATED', 'calcolato dal backend con il metodo'],
    ['DISPUTED', 'contestazione'],
  ])('preserves the distinction for %s', async (status, wording) => {
    const output = await service(record([evidence(status)])).generate(
      'case-test',
      1,
    );
    expect(output.evidenceLedger[0].text).toContain(wording);
    expect(output.evidenceLedger[0].sources).toEqual([
      {
        sourceCode: 'DOC-001',
        pageNumber: 2,
        excerpt: 'The consignee reports wet cartons.',
      },
    ]);
  });

  it('does not turn unknown values, an inaccessible original or a claimed carrier limit into assessed loss', async () => {
    const limit = {
      ...evidence('REPORTED', 31500),
      fieldKey: 'claim.carrier_limit_position',
      unit: 'USD',
    };
    const output = await service(
      record([evidence('UNKNOWN', 'Unverified cause'), limit]),
    ).generate('case-test', 1);
    expect(output.evidenceLedger).toHaveLength(1);
    const economic = output.sections.find(
      (section) => section.id === 'economic-assessment',
    )!;
    expect(economic.paragraphs[0]).toContain('The consignee riferisce');
    expect(economic.paragraphs[0]).toContain('31500 USD');
    expect(JSON.stringify(output)).not.toContain('Unverified cause');
    expect(output.sections[0].paragraphs.join(' ')).toContain('EXCERPT_ONLY');
  });

  it('keeps the sender and declaration date semantics for reported events', async () => {
    const event = {
      event: 'The consignee reported damaged cartons',
      date: new Date('2026-09-08T10:30:00Z'),
      dateType: 'DECLARATION_DATE',
      epistemicStatus: 'REPORTED',
      attribution: 'consignee@example.test',
      sourceLinks: [
        {
          caseDocument: { sourceCode: 'DOC-001' },
          pageNumber: null,
          excerpt: 'Reported damaged cartons',
        },
      ],
    };
    const output = await service(record([], [event])).generate('case-test', 1);
    expect(output.chronology[0].text).toContain(
      'consignee@example.test riferisce',
    );
    expect(output.chronology[0].dateType).toBe('DECLARATION_DATE');
    expect(output.chronology[0].epistemicStatus).toBe('REPORTED');
  });

  it('does not label a generic template with an unsupported version', async () => {
    await expect(
      service({
        ...record(),
        reportTemplateId: 'custom-unimplemented',
      }).generate('case-test', 1),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service({ ...record(), clicheSetVersion: '99.0' }).generate(
        'case-test',
        1,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
