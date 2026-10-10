import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { CaseRecord, CaseSource, DocumentRecord } from '../src/lib/types';

export const origin = 'http://127.0.0.1:5174';
export const password = 'Cargo-surveyor-42!';

export interface Workspace {
  page: Page;
  caseId: string;
  email: string;
  json: <T>(path: string, method?: string, data?: unknown) => Promise<T>;
  source: (name?: string, text?: string) => Promise<CaseSource>;
  open: (path?: string) => Promise<void>;
}

/** Real cookies, database, storage and API; only the external Gemini transport is synthetic. */
export async function createWorkspace(page: Page): Promise<Workspace> {
  const email = `browser-${randomUUID()}@example.test`;
  const register = await page.request.post(`${origin}/api/auth/register`, {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(register.status()).toBe(201);
  const login = await page.request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const json = async <T>(path: string, method = 'GET', data?: unknown) => {
    const response = await page.request.fetch(`${origin}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Origin: origin },
      ...(data === undefined ? {} : { data }),
    });
    expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
    return (response.status() === 204 ? undefined : await response.json()) as T;
  };
  const record = await json<CaseRecord>('/cases', 'POST', {
    title: 'Merce refrigerata · pratica sintetica',
    caseFamily: 'TEMPERATURE_EXCURSION',
    internalReference: `TEST-${randomUUID().slice(0, 8)}`,
    assignment: {
      client: 'Committente sintetico',
      requestedScope: ['Verificare temperatura e ambito delle quantità'],
      limitations: ['Causa non accertata'],
    },
    openQuestions: ['Ottenere l’originale del tally report'],
  });
  return {
    page,
    email,
    caseId: record.id,
    json,
    source: async (
      name = 'reefer-log.csv',
      text = 'Time;Temperature\n10:00;-18,5\n11:00;-17,5\n',
    ) => {
      const upload = await page.request.post(`${origin}/api/documents/upload`, {
        headers: { Authorization: `Bearer ${accessToken}`, Origin: origin },
        multipart: {
          file: {
            name,
            mimeType: name.endsWith('.eml') ? 'message/rfc822' : 'text/csv',
            buffer: Buffer.from(
              `${text}${name.endsWith('.csv') ? `12:00;-18,0\n` : ''}`,
            ),
          },
        },
      });
      expect(upload.status()).toBe(201);
      const document = (await upload.json()) as DocumentRecord;
      const source = await json<CaseSource>(
        `/cases/${record.id}/documents`,
        'POST',
        {
          documentId: document.id,
          displayName: name,
          documentType: name.endsWith('.eml') ? 'email' : 'temperature_log',
          availability: 'ORIGINAL_ACCESSIBLE',
        },
      );
      await json(`/documents/${document.id}/content`);
      return source;
    },
    open: async (path = '') => {
      await page.goto(`/cases/${record.id}${path}`);
      await expect(
        page.getByRole('heading', { name: record.title, exact: true }),
      ).toBeVisible();
    },
  };
}

export const test = base.extend<{ workspace: Workspace }>({
  workspace: async ({ page }, runWithWorkspace) => {
    await runWithWorkspace(await createWorkspace(page));
  },
});
export { expect };
