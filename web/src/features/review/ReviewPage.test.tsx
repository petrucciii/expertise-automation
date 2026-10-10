import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { caseRecord, source } from '../../test/records';
import type { Proposal } from '../../lib/types';
import { CaseContext } from '../cases/case-context';
import ReviewPage from './ReviewPage';

describe('proposal review limits', () => {
  it('shows the backend proposal values before the surveyor accepts them, including zero', async () => {
    const proposal: Proposal = {
      id: 'proposal',
      caseDocumentId: 'source',
      caseDocument: source(),
      documentType: 'sea_waybill',
      status: 'PENDING',
      openQuestions: [],
      createdAt: '2026-10-10T10:00:00Z',
      reviewedAt: null,
      model: 'synthetic',
      suggestions: [
        {
          id: 'zero',
          kind: 'FACT',
          status: 'PENDING',
          content: {
            fieldKey: 'cargo.damaged_cartons',
            valueText: 'zero cartons',
            numericValue: 0,
            unit: 'cartoni',
          },
        },
        {
          id: 'quantity',
          kind: 'FACT',
          status: 'PENDING',
          content: {
            fieldKey: 'cargo.pallets',
            valueText: '29 pallets',
            numericValue: 29,
            unit: 'pallet',
          },
        },
        {
          id: 'text',
          kind: 'FACT',
          status: 'PENDING',
          content: {
            fieldKey: 'shipment.vessel',
            valueText: 'M/V Test Horizon',
            numericValue: null,
          },
        },
      ],
    };
    vi.spyOn(api, 'proposals').mockResolvedValue([proposal]);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CaseContext.Provider value={caseRecord}>
            <ReviewPage />
          </CaseContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('0 cartoni')).toBeVisible();
    expect(screen.getByText('29 pallet')).toBeVisible();
    expect(screen.getByText('M/V Test Horizon')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Accetta selezionati' }),
    ).toBeDisabled();
  });
  it('accepts a large proposal in bounded batches and leaves undecided suggestions available', async () => {
    let proposal: Proposal = {
      id: 'proposal',
      caseDocumentId: 'source',
      caseDocument: source(),
      documentType: 'other',
      status: 'PENDING',
      openQuestions: [],
      createdAt: '2026-10-10T10:00:00Z',
      reviewedAt: null,
      model: 'synthetic',
      suggestions: Array.from({ length: 103 }, (_, index) => ({
        id: `suggestion-${index}`,
        kind: 'FACT',
        status: 'PENDING',
        content: {
          fieldKey: `cargo.statement_${index}`,
          valueText: 'Literal source statement',
          numericValue: null,
        },
      })),
    };
    vi.spyOn(api, 'proposals').mockImplementation(async () => [proposal]);
    vi.spyOn(api, 'accept').mockImplementation(
      async (_caseId, _proposalId, ids) => {
        proposal = {
          ...proposal,
          suggestions: proposal.suggestions.map((item) =>
            ids.includes(item.id) ? { ...item, status: 'ACCEPTED' } : item,
          ),
        };
        return proposal;
      },
    );
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CaseContext.Provider value={caseRecord}>
            <ReviewPage />
          </CaseContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Seleziona primi 100' }),
    );
    expect(
      screen
        .getAllByRole('checkbox')
        .filter((element) => (element as HTMLInputElement).checked),
    ).toHaveLength(100);
    expect(
      screen.getByRole('checkbox', { name: 'Seleziona cargo.statement_100' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Accetta selezionati' }),
    );
    await waitFor(() => expect(api.accept).toHaveBeenCalledOnce());
    expect(vi.mocked(api.accept).mock.calls[0]?.[2]).toHaveLength(100);
    await user.click(
      await screen.findByRole('button', { name: 'Seleziona tutti' }),
    );
    expect(
      screen
        .getAllByRole('checkbox')
        .filter((element) => (element as HTMLInputElement).checked),
    ).toHaveLength(3);
    await user.click(
      screen.getByRole('button', { name: 'Accetta selezionati' }),
    );
    await waitFor(() => expect(api.accept).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.accept).mock.calls[1]?.[2]).toHaveLength(3);
  });
});
