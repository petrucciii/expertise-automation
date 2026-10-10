import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { DocumentContent, DocumentRecord } from '../../lib/types';
import { DocumentReader } from './DocumentReader';

const document: DocumentRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  fileName: 'synthetic-scan.pdf',
  mimeType: 'application/pdf',
  extractionStatus: 'NEEDS_REVIEW',
  extractionTruncated: false,
  extractionReviewedAt: null,
  created_at: '2026-10-10T10:00:00Z',
};
const content: DocumentContent = {
  documentId: document.id,
  content: 'Warehouse states 24 pallets; scope unknown.',
  pages: null,
  sourceMetadata: {},
  extractionStatus: 'NEEDS_REVIEW',
  extractionTruncated: false,
  extractionReviewedAt: null,
};
function read(values: Partial<DocumentContent> = {}) {
  vi.spyOn(api, 'content').mockResolvedValue({ ...content, ...values });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DocumentReader document={document} open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('human OCR review', () => {
  it('requires explicit confirmation before accepting OCR text', async () => {
    vi.spyOn(api, 'reviewContent').mockResolvedValue(content);
    const user = read();
    const confirm = await screen.findByRole('button', {
      name: 'Conferma il testo controllato',
    });
    expect(confirm).toBeDisabled();
    expect(api.reviewContent).not.toHaveBeenCalled();
    await user.click(
      screen.getByLabelText(
        'Ho confrontato il testo estratto con l’originale.',
      ),
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(api.reviewContent).toHaveBeenCalledWith(document.id),
    );
  });
  it.each([{ extractionTruncated: true }, { content: '' }])(
    'never offers confirmation for incomplete or empty text',
    async (values) => {
      vi.spyOn(api, 'reviewContent');
      read(values);
      await screen.findByText('Testo da controllare');
      expect(
        screen.queryByRole('button', { name: 'Conferma il testo controllato' }),
      ).not.toBeInTheDocument();
      expect(api.reviewContent).not.toHaveBeenCalled();
    },
  );
});
