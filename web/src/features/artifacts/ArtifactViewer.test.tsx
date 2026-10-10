import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CaseContext } from '../cases/case-context';
import { caseRecord } from '../../test/records';
import { ArtifactViewer } from './ArtifactViewer';

it('explains receipt, document and unknown date meanings instead of displaying protocol enums', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CaseContext.Provider value={caseRecord}>
        <ArtifactViewer
          content={{
            chronology: [
              { dateType: 'RECEIVED' },
              { date_type: 'document' },
              { dateType: 'UNKNOWN' },
            ],
          }}
        />
      </CaseContext.Provider>
    </QueryClientProvider>,
  );
  expect(screen.getByText('Data di ricezione')).toBeVisible();
  expect(screen.getByText('Data del documento')).toBeVisible();
  expect(screen.getByText('Tipo di data non verificato')).toBeVisible();
  expect(screen.queryByText('RECEIVED')).not.toBeInTheDocument();
});
