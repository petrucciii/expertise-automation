import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { ChatRecord } from '../../lib/types';
import { caseRecord } from '../../test/records';
import { CaseContext } from '../cases/case-context';
import ChatPage from './ChatPage';

const chatId = '00000000-0000-4000-8000-000000000001';
function openConversation(count: number) {
  const chat: ChatRecord = {
    id: chatId,
    caseId: caseRecord.id,
    title: 'Synthetic history boundary',
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
    _count: { messages: count },
    messages: [],
  };
  vi.spyOn(api, 'chat').mockResolvedValue(chat);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CaseContext.Provider value={caseRecord}>
        <MemoryRouter initialEntries={[`/chat/${chatId}`]}>
          <Routes>
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </CaseContext.Provider>
    </QueryClientProvider>,
  );
}

describe('conversation history limits', () => {
  beforeEach(() => {
    vi.spyOn(api, 'chatDocuments').mockResolvedValue([]);
    vi.spyOn(api, 'artifacts').mockResolvedValue([]);
    vi.spyOn(api, 'sendMessage');
  });

  it('allows input while the pageable history still fits a user message and its reply', async () => {
    openConversation(100048);
    await waitFor(() =>
      expect(screen.getByLabelText('Messaggio per l’assistente')).toBeEnabled(),
    );
    expect(screen.queryByText(/limite dello storico consultabile/)).toBeNull();
    expect(api.chat).toHaveBeenLastCalledWith(chatId, 100000);
  });

  it('keeps an exhausted conversation readable and directs the user to a new conversation', async () => {
    openConversation(100049);
    const next = await screen.findByRole('link', {
      name: 'Apri una nuova conversazione',
    });
    expect(next).toHaveAttribute('href', `/cases/${caseRecord.id}`);
    expect(screen.getByLabelText('Messaggio per l’assistente')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Invia messaggio' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Carica messaggi precedenti' }),
    ).toBeEnabled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
