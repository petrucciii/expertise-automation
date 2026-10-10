import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { caseRecord, source } from '../../test/records';
import type { CaseSource } from '../../lib/types';
import { CaseContext } from '../cases/case-context';
import SourcesPage from './SourcesPage';

function show(row: CaseSource) {
  vi.spyOn(api, 'registerSources').mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <CaseContext.Provider value={{ ...caseRecord, documents: [row] }}>
          <SourcesPage />
        </CaseContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function QueriedCase({ row }: { row: CaseSource }) {
  const query = useQuery({
    queryKey: ['case', caseRecord.id],
    queryFn: () => api.case(caseRecord.id),
    initialData: { ...caseRecord, documents: [row] },
    staleTime: Infinity,
  });
  return (
    <CaseContext.Provider value={query.data}>
      <SourcesPage />
    </CaseContext.Provider>
  );
}

describe('automatic extraction eligibility', () => {
  it('offers OCR review when parsing persisted text but automatic extraction failed', async () => {
    const row = source({
      availability: 'ORIGINAL_ACCESSIBLE',
      documentId: 'document',
      document: {
        id: 'document',
        fileName: 'synthetic-scan.pdf',
        mimeType: 'application/pdf',
        extractionStatus: 'PENDING',
        extractionTruncated: false,
        extractionReviewedAt: null,
        created_at: '2026-10-10T10:00:00Z',
      },
    });
    vi.spyOn(api, 'registerSources').mockResolvedValue([]);
    vi.spyOn(api, 'extract').mockRejectedValue(
      new ApiError(400, 'Document extraction requires human review'),
    );
    vi.spyOn(api, 'case').mockResolvedValue({
      ...caseRecord,
      documents: [
        {
          ...row,
          document: { ...row.document!, extractionStatus: 'NEEDS_REVIEW' },
        },
      ],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <QueriedCase row={row} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Proponi fatti ed eventi' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Controlla prima il testo' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Proponi fatti ed eventi' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Document extraction requires human review',
    );
  });

  it.each(['EXCERPT_ONLY', 'NOT_PROVIDED'] as const)(
    'keeps %s sources available for manual work without offering automatic extraction',
    (availability) => {
      show(
        source({
          availability,
          excerptText:
            availability === 'EXCERPT_ONLY' ? 'Registered cargo excerpt' : null,
        }),
      );
      expect(
        screen.queryByRole('button', { name: 'Proponi fatti ed eventi' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Apri DOC-001' }),
      ).toBeEnabled();
    },
  );

  it.each([
    { mimeType: 'image/png', disabled: false },
    { mimeType: 'image/jpeg', disabled: false },
    { mimeType: 'application/pdf', disabled: true },
  ])(
    'uses the vision capability independently of OCR review for $mimeType',
    ({ mimeType, disabled }) => {
      show(
        source({
          availability: 'ORIGINAL_ACCESSIBLE',
          documentId: 'document',
          document: {
            id: 'document',
            fileName: 'synthetic',
            mimeType,
            extractionStatus: 'NEEDS_REVIEW',
            extractionTruncated: false,
            extractionReviewedAt: null,
            created_at: '2026-10-10T10:00:00Z',
          },
        }),
      );
      const button = screen.getByRole('button', {
        name: 'Proponi fatti ed eventi',
      });
      if (disabled) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    },
  );
});
