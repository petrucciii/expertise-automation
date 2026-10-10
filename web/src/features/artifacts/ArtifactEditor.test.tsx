import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseContext } from '../cases/case-context';
import { caseRecord, preliminary } from '../../test/records';
import { api } from '../../lib/api';
import { ArtifactEditor } from './ArtifactEditor';

function openEditor() {
  const onSaved = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CaseContext.Provider value={caseRecord}>
        <ArtifactEditor
          artifact={preliminary}
          onSaved={onSaved}
          onCancel={vi.fn()}
        />
      </CaseContext.Provider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('manual narrative revisions', () => {
  beforeEach(() => {
    vi.spyOn(api, 'latestArtifact').mockResolvedValue(preliminary);
    vi.spyOn(api, 'saveRevision').mockResolvedValue({
      ...preliminary,
      version: 2,
    });
  });

  it('preserves advanced chronology edits when the surveyor returns to the structured editor', async () => {
    const { user, onSaved } = openEditor();
    await user.click(screen.getByLabelText(/Editor del contenuto completo/));
    const revised = {
      ...preliminary.content,
      chronology: [
        { event: 'Receipt date corrected by the surveyor', sources: [] },
      ],
    };
    await user.clear(screen.getByLabelText(/Contenuto della revisione/));
    await user.click(screen.getByLabelText(/Contenuto della revisione/));
    await user.paste(JSON.stringify(revised));
    await user.click(screen.getByLabelText(/Editor del contenuto completo/));
    await user.clear(screen.getByLabelText(/Questioni aperte/));
    await user.type(
      screen.getByLabelText(/Questioni aperte/),
      'Clarify the scope of 24 units',
    );
    await user.click(
      screen.getByRole('button', { name: 'Salva nuova versione' }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(api.saveRevision).toHaveBeenCalledWith(
      caseRecord.id,
      preliminary.type,
      expect.objectContaining({
        chronology: revised.chronology,
        openQuestions: ['Clarify the scope of 24 units'],
      }),
      preliminary.id,
    );
  });

  it.each([
    { ...preliminary, isStale: true },
    { ...preliminary, id: '00000000-0000-4000-8000-000000000004' },
  ])(
    'retains the unsaved draft when the latest artifact changes',
    async (latest) => {
      vi.mocked(api.latestArtifact).mockResolvedValue(latest);
      const { user, onSaved } = openEditor();
      await user.clear(screen.getByLabelText(/Questioni aperte/));
      await user.type(
        screen.getByLabelText(/Questioni aperte/),
        'Unsaved work that must remain visible',
      );
      await user.click(
        screen.getByRole('button', { name: 'Salva nuova versione' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'non è più corrente',
      );
      expect(screen.getByLabelText(/Questioni aperte/)).toHaveValue(
        'Unsaved work that must remain visible',
      );
      expect(api.saveRevision).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it('keeps invalid JSON editable and prevents a malformed revision', async () => {
    const { user } = openEditor();
    await user.click(screen.getByLabelText(/Editor del contenuto completo/));
    await user.clear(screen.getByLabelText(/Contenuto della revisione/));
    await user.type(
      screen.getByLabelText(/Contenuto della revisione/),
      'invalid JSON',
    );
    await user.click(screen.getByLabelText(/Editor del contenuto completo/));
    expect(
      screen.getByLabelText(/Editor del contenuto completo/),
    ).toBeChecked();
    await user.click(
      screen.getByRole('button', { name: 'Salva nuova versione' }),
    );
    expect(api.saveRevision).not.toHaveBeenCalled();
  });
});
