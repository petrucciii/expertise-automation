import { test, expect } from './workspace';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

test('verification HTML cannot reload an unsaved message or be served from the Vite origin', async ({
  workspace,
  page,
}) => {
  await workspace.open();
  const input = page.getByLabel('Messaggio per l’assistente');
  const draft = 'Bozza non inviata: distinguere quantità e unità del tally.';
  await input.fill(draft);
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  const probes: string[] = [];
  try {
    for (const directory of [
      'test-results-live',
      'playwright-report-live',
      'coverage',
    ]) {
      const name = `watcher-probe-${randomUUID()}.html`;
      const target = path.resolve(directory, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      probes.push(target);
      await fs.writeFile(
        target,
        '<!doctype html><title>Synthetic verification artifact</title>',
      );
      expect((await page.request.get(`/${directory}/${name}`)).status()).toBe(
        403,
      );
    }
    // Observe past the filesystem debounce: an unintended reload would lose the draft.
    await page.waitForTimeout(1500);
    expect(navigations).toBe(0);
    await expect(input).toHaveValue(draft);
  } finally {
    for (const probe of probes) await fs.unlink(probe);
  }
});

test('untrusted assistant HTML, scripts, links and remote images stay inert', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  let remoteRequests = 0;
  await page.route('https://untrusted.example.test/**', async (route) => {
    remoteRequests += 1;
    await route.abort();
  });
  await workspace.open();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('SIMULATE_HOSTILE · analizza il documento');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  const answer = page.getByRole('article', {
    name: 'Risposta dell’assistente',
  });
  await expect(answer).toContainText('Immagine citata: Immagine remota');
  await expect(answer.locator('img, script, iframe')).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, '__sourceXss')),
  ).toBeUndefined();
  expect(
    await answer
      .getByRole('link', { name: 'Link non sicuro', exact: true })
      .getAttribute('href'),
  ).not.toMatch(/^javascript:/i);
  expect(remoteRequests).toBe(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    'expertise-theme',
  ]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test('file size, empty upload and duplicate original errors keep the form usable', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  await workspace.open();
  await page
    .getByRole('link', { name: 'Libreria documenti', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Carica documento', exact: true })
    .click();
  const upload = page.getByRole('dialog', {
    name: 'Carica un documento',
    exact: true,
  });
  for (const size of [0, 10 * 1024 * 1024 + 1]) {
    await upload.getByLabel(/^File/).setInputFiles({
      name: 'empty-or-large.csv',
      mimeType: 'text/csv',
      buffer: Buffer.alloc(size),
    });
    await upload
      .getByRole('button', { name: 'Carica documento', exact: true })
      .click();
    await expect(upload.getByRole('alert')).toContainText(
      'non superare 10 MiB',
    );
  }
  await upload.getByLabel(/^File/).setInputFiles({
    name: 'reefer-copy.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Time;Temperature\n10:00;-18,5\n11:00;-17,5\n12:00;-18,0\n',
    ),
  });
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith('/api/documents/upload') &&
      value.request().method() === 'POST',
  );
  await upload
    .getByRole('button', { name: 'Carica documento', exact: true })
    .click();
  expect((await response).status()).toBe(409);
  await expect(upload.getByRole('alert')).toContainText('esiste già');
  await expect(upload.getByLabel(/^File/)).toBeEnabled();
});

test('429 and expired sessions show an actionable state without retaining private screens', async ({
  workspace,
  page,
}) => {
  await workspace.open();
  await page.route('**/api/documents?*', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Rate limited' }),
    });
  });
  await page
    .getByRole('link', { name: 'Libreria documenti', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Attendi un minuto');
  await page.unroute('**/api/documents?*');
  await page.route('**/api/cases/*', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });
  await page.goto(`/cases/${workspace.caseId}`);
  await expect(page).toHaveURL('/login');
  await expect(
    page.getByRole('heading', { name: 'Bentornato.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Merce refrigerata · pratica sintetica', { exact: true }),
  ).toHaveCount(0);
});

test('logout is propagated to a second tab and refresh cookies are inaccessible to JavaScript', async ({
  workspace,
  page,
  context,
}) => {
  await workspace.open();
  const second = await context.newPage();
  await second.goto(`/cases/${workspace.caseId}`);
  await expect(
    second.getByRole('heading', {
      name: 'Merce refrigerata · pratica sintetica',
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain('refresh');
  const refresh = (await context.cookies()).find(
    (cookie) => cookie.name === 'refresh_token',
  );
  expect(refresh?.httpOnly).toBe(true);
  await page.getByRole('button', { name: /Il tuo workspace/ }).click();
  await page.getByRole('menuitem', { name: 'Esci', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(second).toHaveURL('/login');
  await expect(
    second.getByRole('heading', {
      name: 'Merce refrigerata · pratica sintetica',
      exact: true,
    }),
  ).toHaveCount(0);
});
