import { test as base, expect, type Page } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Proposal } from '../src/lib/types';
import {
  cargoDocx,
  cargoLabelImage,
  cargoPdf,
  claimEmail,
  europeanTemperatureCsv,
  sectorExamples,
  temperatureWorkbook,
} from '../../api/test/fixtures/cargo-documents';

interface LiveSession {
  page: Page;
  inputDir: string;
  email: string;
  caseIds: string[];
  failures: Array<{ route: string; status: number }>;
}
const baseURL = process.env.LIVE_UI_BASE_URL || 'http://localhost:5173';
const test = base.extend<{}, { live: LiveSession }>({
  live: [
    async ({ browser }, runWithSession, workerInfo) => {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 960 },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const email = `qa-live-ui-${randomUUID()}@example.test`;
      // Generate a fresh QA-only credential in memory; no password is embedded in the repository.
      const password = randomBytes(24).toString('base64url');
      const inputDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'expertise-live-ui-inputs-'),
      );
      const live: LiveSession = {
        page,
        inputDir,
        email,
        caseIds: [],
        failures: [],
      };
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (
          url.origin === new URL(baseURL).origin &&
          url.pathname.startsWith('/api/') &&
          response.status() >= 400 &&
          url.pathname !== '/api/auth/refresh'
        )
          live.failures.push({
            route: url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id'),
            status: response.status(),
          });
      });
      try {
        await page.goto('/');
        await page
          .getByRole('button', { name: 'Registrati', exact: true })
          .click();
        await page
          .getByRole('textbox', { name: 'Email', exact: true })
          .fill(email);
        await page.getByLabel(/^Password/).fill(password);
        await page
          .getByLabel('Ripeti la password')
          .fill(`${password}-different`);
        await page
          .getByRole('button', { name: 'Crea account', exact: true })
          .click();
        await expect(page.getByRole('alert')).toContainText(
          'Le password non coincidono',
        );
        await page.getByLabel('Ripeti la password').fill(password);
        await page
          .getByRole('button', { name: 'Crea account', exact: true })
          .click();
        await expect(
          page
            .getByRole('complementary', { name: 'Navigazione principale' })
            .getByRole('button', { name: 'Nuova pratica', exact: true }),
        ).toBeVisible();
        await runWithSession(live);
      } finally {
        await fs.mkdir(workerInfo.project.outputDir, { recursive: true });
        await fs.writeFile(
          path.join(
            workerInfo.project.outputDir,
            `qa-session-${email.slice(0, 47)}.json`,
          ),
          JSON.stringify(
            { email, caseIds: live.caseIds, failures: live.failures, inputDir },
            null,
            2,
          ),
        );
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
});

async function createCase(
  live: LiveSession,
  title: string,
  family = 'CARGO_DAMAGE',
) {
  const { page } = live;
  await page
    .getByRole('complementary', { name: 'Navigazione principale' })
    .getByRole('button', { name: 'Nuova pratica', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Nuova pratica',
    exact: true,
  });
  await dialog
    .getByRole('textbox', { name: 'Titolo della pratica', exact: true })
    .fill(title);
  await dialog.getByLabel('Famiglia della pratica').selectOption(family);
  await dialog
    .getByLabel('Riferimento interno')
    .fill(`QA-LIVE-${randomUUID().slice(0, 8)}`);
  await dialog
    .getByLabel('Committente')
    .fill('Committente sintetico del collaudo');
  await dialog
    .getByLabel('Attività richieste')
    .fill(
      'Verificare le fonti\nSeparare i carichi e le unità\nPreparare i quattro risultati',
    );
  await dialog
    .getByLabel('Limiti dell’incarico')
    .fill(
      'Tutti i documenti e le persone sono sintetici. Causa non accertata.',
    );
  await dialog
    .getByLabel('Domande aperte')
    .fill('Ottenere il verbale di scarico originale');
  await dialog
    .getByRole('button', { name: 'Crea pratica', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  const caseId = new URL(page.url()).pathname.split('/')[2]!;
  live.caseIds.push(caseId);
  return caseId;
}
async function screen(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Funzionalità della pratica' })
    .getByRole('link', { name: new RegExp(`^${name}(?:\\d+)?$`) })
    .click();
}
async function upload(
  live: LiveSession,
  name: string,
  bytes: Buffer,
  type = 'other',
  expected = '',
  requireOcrReview = false,
) {
  const { page } = live;
  const inputPath = path.join(live.inputDir, name);
  await fs.writeFile(inputPath, bytes);
  await page.getByRole('button', { name: 'Carica file', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Carica un documento',
    exact: true,
  });
  await dialog.locator('input[type="file"]').setInputFiles(inputPath);
  await dialog
    .getByRole('button', { name: 'Carica documento', exact: true })
    .click();
  const attach = page.getByRole('dialog', {
    name: 'Aggiungi una fonte',
    exact: true,
  });
  await expect(attach).toBeVisible();
  await attach.getByLabel('Nome nel registro').fill(name);
  await attach.getByLabel('Tipo di documento').selectOption(type);
  await attach.getByLabel('Autore o mittente').fill('Autore sintetico');
  await attach
    .getByLabel('Finalità della verifica')
    .fill('Collaudo reale del parser e della tracciabilità');
  await attach
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  const source = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    }),
  });
  await expect(source).toBeVisible();
  const sourceCode = (await source.getByRole('heading').innerText()).match(
    /DOC-\d+/,
  )![0];
  await source
    .getByRole('button', { name: `Apri ${sourceCode}`, exact: true })
    .click();
  const reader = page.getByRole('dialog');
  if (expected)
    await expect(reader).toContainText(expected, { timeout: 90_000 });
  const confirmation = reader.getByRole('checkbox', { name: /Ho confrontato/ });
  if (requireOcrReview) {
    await expect(confirmation).toBeVisible();
    await expect(
      reader.getByRole('button', {
        name: 'Conferma il testo controllato',
        exact: true,
      }),
    ).toBeDisabled();
  }
  if (await confirmation.count()) {
    await confirmation.check();
    await reader
      .getByRole('button', {
        name: 'Conferma il testo controllato',
        exact: true,
      })
      .click();
    await expect(reader).toContainText('Testo controllato il');
  }
  await reader.getByRole('button', { name: 'Chiudi', exact: true }).click();
  return { sourceCode, inputPath };
}
async function excerpt(
  page: Page,
  name: string,
  text: string,
  availability = 'EXCERPT_ONLY',
) {
  await page
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Aggiungi una fonte',
    exact: true,
  });
  await dialog
    .getByLabel('Disponibilità della fonte')
    .selectOption(availability);
  await dialog
    .getByRole('textbox', { name: 'Nome nel registro', exact: true })
    .fill(name);
  if (availability === 'EXCERPT_ONLY')
    await dialog.getByLabel('Testo dell’estratto').fill(text);
  await dialog
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}

test.beforeEach(async ({ live }) => {
  await live.page.goto('/');
  await expect(
    live.page
      .getByRole('complementary', { name: 'Navigazione principale' })
      .getByRole('button', { name: 'Nuova pratica', exact: true }),
  ).toBeVisible();
});

test('real intake covers all case families, blank titles and case metadata', async ({
  live,
}) => {
  const { page } = live;
  for (const [family, title] of [
    ['CARGO_DAMAGE', 'Danno stradale'],
    ['CARGO_CONTAMINATION', 'Contaminazione marittima'],
    ['SHORTAGE', 'Ammanco ferroviario'],
    ['TEMPERATURE_EXCURSION', 'Temperatura farmaci aerei'],
    ['OTHER', 'Altro incarico'],
  ] as const) {
    await createCase(live, `QA LIVE UI · ${title}`, family);
    await screen(page, 'Pratica');
    await expect(
      page.getByText('Committente sintetico del collaudo', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Causa non accertata', { exact: false }),
    ).toBeVisible();
    await screen(page, 'Chat');
    await expect(
      page.getByRole('link', { name: 'Aggiungi una fonte', exact: true }),
    ).toHaveAttribute('href', `/cases/${live.caseIds.at(-1)}/sources`);
  }
  await page
    .getByRole('button', { name: 'Nuova pratica', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Titolo della pratica', exact: true })
    .fill('   ');
  await dialog
    .getByRole('button', { name: 'Crea pratica', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect(
    await dialog
      .getByRole('textbox', { name: 'Titolo della pratica', exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.patternMismatch),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
});

test('real sources upload and parse PDF, DOCX, XLSX, CSV and EML sector documents', async ({
  live,
}) => {
  await createCase(
    live,
    'QA LIVE UI · originali multimodali',
    'TEMPERATURE_EXCURSION',
  );
  await screen(live.page, 'Fonti');
  for (const [name, bytes, type, expected] of [
    [
      'sea-waybill.pdf',
      cargoPdf(sectorExamples.seaWaybill),
      'sea_waybill',
      '1080 cartons on 29 pallets',
    ],
    [
      'road-survey.docx',
      await cargoDocx(sectorExamples.roadSurvey),
      'survey_report',
      'five wet cartons',
    ],
    [
      'air-claim.docx',
      await cargoDocx(sectorExamples.airClaim),
      'other',
      'claimed amount, not an assessed loss',
    ],
    [
      'rail-shortage.pdf',
      cargoPdf(sectorExamples.railShortage),
      'rail_consignment',
      'Net and gross weights',
    ],
    [
      'temperature.xlsx',
      await temperatureWorkbook(),
      'temperature_log',
      'sensor offline',
    ],
    [
      'temperature.csv',
      Buffer.from(europeanTemperatureCsv),
      'temperature_log',
      '-18,5',
    ],
    [
      'claim.eml',
      Buffer.from(claimEmail),
      'claim_email',
      '12 cartons arrived crushed',
    ],
  ] as const)
    await upload(live, name, bytes, type, expected);
  await live.page
    .getByRole('link', { name: 'Libreria documenti', exact: true })
    .click();
  await expect(
    live.page.getByRole('heading', { name: 'Libreria documenti', exact: true }),
  ).toBeVisible();
  await expect(
    live.page.getByRole('button', { name: /^Scarica / }),
  ).toHaveCount(7);
});

test('real PNG, JPEG and single-page TIFF display OCR text and record explicit review', async ({
  live,
}) => {
  await createCase(live, 'QA LIVE UI · etichette e OCR reali');
  await screen(live.page, 'Fonti');
  for (const [format, suffix] of [
    ['png', 'png'],
    ['jpeg', 'jpg'],
    ['tiff', 'tiff'],
  ] as const) {
    await upload(
      live,
      `cargo-label.${suffix}`,
      await cargoLabelImage(format),
      'photograph',
      'TEST000003',
      true,
    );
  }
  await expect(
    live.page.getByRole('button', {
      name: 'Proponi fatti ed eventi',
      exact: true,
    }),
  ).toHaveCount(3);
});

test('real upload failures preserve the form and reject empty, oversized, fake and duplicate files', async ({
  live,
}) => {
  const { page } = live;
  await createCase(live, 'QA LIVE UI · limiti dei caricamenti');
  await screen(page, 'Fonti');
  const bytes = Buffer.from(
    `time;temperature C\n00:00;-18.5\n01:00;-12.5\n02:00;-4\n03:00;-5\n# ${randomUUID()}\n`,
  );
  const valid = await upload(
    live,
    'boundary-valid.csv',
    bytes,
    'temperature_log',
    '-18.5',
  );
  for (const [name, data, message] of [
    ['empty.csv', Buffer.alloc(0), 'non superare 10 MiB'],
    [
      'oversized.csv',
      Buffer.alloc(10 * 1024 * 1024 + 1, 65),
      'non superare 10 MiB',
    ],
    [
      'fake.pdf',
      Buffer.from('This is not a PDF document'),
      'Controlla i campi',
    ],
    ['duplicate.csv', bytes, 'risorsa esiste già'],
  ] as const) {
    await fs.writeFile(path.join(live.inputDir, name), data);
    await page
      .getByRole('button', { name: 'Carica file', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Carica un documento',
      exact: true,
    });
    await dialog
      .locator('input[type="file"]')
      .setInputFiles(path.join(live.inputDir, name));
    await dialog
      .getByRole('button', { name: 'Carica documento', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(message);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  }
  await page
    .getByRole('button', { name: `Apri ${valid.sourceCode}`, exact: true })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Scarica originale', exact: true })
    .click();
  const original = await downloadPromise;
  expect(await fs.readFile((await original.path())!)).toEqual(bytes);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Chiudi', exact: true })
    .click();
});

test('real perito workflow calculates all operations, checks attribution and exports all four reviewed outputs', async ({
  live,
}, info) => {
  const { page } = live;
  await createCase(
    live,
    'QA LIVE UI · perizia reefer completa',
    'TEMPERATURE_EXCURSION',
  );
  await screen(page, 'Fonti');
  const csv = Buffer.from(
    `time;temperature C\n00:00;-18,5\n01:00;-12,5\n02:00;-4,0\n03:00;sensor offline\n04:00;-5,0\n# ${randomUUID()}\n`,
  );
  const source = await upload(
    live,
    'complete-reefer.csv',
    csv,
    'temperature_log',
    'sensor offline',
  );
  await excerpt(
    page,
    'Estratto tally primo lotto',
    'Il magazzino dichiara 24 pallet per il solo primo lotto. Non è disponibile un conteggio dei cartoni.',
  );
  await excerpt(page, 'Verbale di scarico da ottenere', '', 'NOT_PROVIDED');
  await excerpt(page, 'Sea waybill citato', '', 'REFERENCED_NOT_ACCESSIBLE');
  await expect(
    page.getByRole('button', { name: 'Proponi fatti ed eventi', exact: true }),
  ).toHaveCount(1);
  await screen(page, 'Evidenze');
  for (const [operation, expected] of [
    ['SUM', '-40 °C'],
    ['MIN', '-18,5 °C'],
    ['MAX', '-4 °C'],
    ['MEAN', '-10 °C'],
    ['COUNT', '4'],
    ['RANGE', '14,5 °C'],
  ] as const) {
    await page
      .getByRole('button', { name: 'Calcola da tabella', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Calcola da una tabella',
      exact: true,
    });
    await dialog.getByLabel('Fonte CSV o XLSX').selectOption(source.sourceCode);
    await dialog
      .getByLabel('Campo del risultato')
      .fill(`temperature.${operation.toLowerCase()}`);
    await dialog.getByLabel('Intestazione della colonna').fill('temperature C');
    await dialog
      .getByLabel('Operazione', { exact: true })
      .selectOption(operation);
    if (operation !== 'COUNT')
      await dialog
        .getByRole('textbox', { name: 'Unità', exact: true })
        .fill('°C');
    await dialog
      .getByRole('button', { name: 'Calcola e registra', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const card = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: `temperature.${operation.toLowerCase()}`,
        exact: true,
      }),
    });
    await expect(card).toContainText(expected);
    await card.getByText('Metodo e dati del calcolo', { exact: true }).click();
    await expect(card.locator('pre')).toContainText(operation);
    await expect(card.locator('pre')).toContainText('sourceSha256');
  }
  await page
    .getByRole('button', { name: 'Aggiungi evidenza', exact: true })
    .click();
  const evidence = page.getByRole('dialog', {
    name: 'Aggiungi un’evidenza',
    exact: true,
  });
  await evidence.getByLabel(/^Campo/).fill('damage.cause');
  await evidence
    .getByRole('textbox', { name: 'Valore', exact: true })
    .fill('Causa non accertata');
  await evidence.getByLabel('Stato della prova').selectOption('UNKNOWN');
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'damage.cause', exact: true }),
  ).toBeVisible();
  await screen(page, 'Cronologia');
  await page
    .getByRole('button', { name: 'Aggiungi evento', exact: true })
    .click();
  const event = page.getByRole('dialog', {
    name: 'Aggiungi un evento',
    exact: true,
  });
  await event
    .getByLabel(/^Evento/)
    .fill('Ricezione documentata del logger da parte del perito');
  await event.getByLabel('Data', { exact: true }).fill('2026-10-10');
  await event.getByLabel('Significato della data').selectOption('RECEIVED');
  await event.getByLabel('Attribuzione').fill('Perito del collaudo sintetico');
  await event
    .getByRole('button', { name: 'Aggiungi riferimento', exact: true })
    .click();
  await event.getByLabel('Fonte registrata').selectOption(source.sourceCode);
  await event
    .getByRole('button', { name: 'Registra evento', exact: true })
    .click();
  await expect(
    page.getByText('Perito del collaudo sintetico', { exact: false }),
  ).toBeVisible();
  await screen(page, 'Verifiche');
  for (const status of [
    'COMPLIANT',
    'ISSUE_FOUND',
    'NOT_VERIFIABLE',
    'NOT_APPLICABLE',
  ]) {
    await page
      .getByRole('button', { name: 'Aggiungi verifica', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aggiungi una verifica',
      exact: true,
    });
    await dialog
      .getByLabel('Titolo della verifica')
      .fill(`Verifica sintetica ${status}`);
    await dialog.getByLabel('Esito', { exact: true }).selectOption(status);
    await dialog
      .getByLabel('Spiegazione')
      .fill(
        'Separare ambito dei conteggi e unità. Nessuna valutazione automatica di responsabilità.',
      );
    await dialog
      .getByRole('button', { name: 'Registra verifica', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await screen(page, 'Risultati');
  await page
    .getByRole('button', { name: 'Genera i quattro risultati', exact: true })
    .click();
  await expect(
    page.locator('.artifact-status').filter({ hasText: 'Versione 1' }),
  ).toHaveCount(4);
  const reportCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Relazione', exact: true }),
  });
  await reportCard.getByRole('button', { name: 'Apri', exact: true }).click();
  const report = page.getByRole('dialog', {
    name: 'Relazione · v1',
    exact: true,
  });
  await report
    .getByRole('button', { name: 'Modifica testo', exact: true })
    .click();
  const paragraph = report
    .getByRole('textbox', { name: 'Paragrafi', exact: true })
    .first();
  const manualNote =
    'Nota manuale del perito: mantenere separati i lotti e non attribuire una causa non verificata.';
  await paragraph.fill(`${await paragraph.inputValue()}\n\n${manualNote}`);
  await report
    .getByRole('button', { name: 'Salva nuova versione', exact: true })
    .click();
  const revised = page.getByRole('dialog', {
    name: 'Relazione · v2',
    exact: true,
  });
  await expect(revised).toContainText(manualNote);
  await revised.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await reportCard
    .getByRole('button', { name: 'Versioni', exact: true })
    .click();
  const history = page.getByRole('dialog', {
    name: 'Versioni · Relazione',
    exact: true,
  });
  await expect(history.locator('.version-row')).toHaveCount(2);
  await history
    .locator('.version-row')
    .filter({ hasText: /^Versione 1/ })
    .click();
  await expect(history).toContainText('Versione 1 · sola lettura');
  await expect(history).not.toContainText(manualNote);
  await history.getByRole('button', { name: 'Chiudi', exact: true }).click();
  for (const name of ['Revisione preliminare', 'Relazione']) {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(
      card.getByRole('button', { name: 'Esporta DOCX', exact: true }),
    ).toBeDisabled();
    await card.getByRole('button', { name: 'Apri', exact: true }).click();
    const narrative = page.getByRole('dialog', {
      name: `${name} · v${name === 'Relazione' ? 2 : 1}`,
      exact: true,
    });
    await expect(narrative).toContainText('Ricezione documentata del logger');
    await expect(narrative).toContainText('Perito del collaudo sintetico');
    await expect(narrative).toContainText(
      name === 'Relazione'
        ? 'Data di ricezione: 2026-10-10'
        : 'Data di ricezione',
    );
    await narrative
      .getByRole('button', { name: 'Approva questa versione', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: /^Approvare / })
      .getByRole('button', { name: 'Approva versione', exact: true })
      .click();
    await narrative
      .getByRole('button', { name: 'Chiudi', exact: true })
      .click();
  }
  for (const [name, format] of [
    ['Scheda strutturata', 'JSON'],
    ['Registro documenti', 'XLSX'],
    ['Revisione preliminare', 'DOCX'],
    ['Relazione', 'DOCX'],
  ] as const) {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    const promise = page.waitForEvent('download');
    await card
      .getByRole('button', { name: `Esporta ${format}`, exact: true })
      .click();
    const download = await promise;
    expect(await download.failure()).toBeNull();
    await download.saveAs(
      info.outputPath(`result-${name}.${format.toLowerCase()}`),
    );
    const bytes = await fs.readFile((await download.path())!);
    if (format === 'JSON') {
      expect(bytes.toString()).toContain('temperature.mean');
      expect(bytes.toString()).toContain('"epistemic_status": "calculated"');
      expect(bytes.toString()).toContain('"epistemic_status": "unknown"');
    } else expect(bytes.subarray(0, 2).toString()).toBe('PK');
  }
  await page.screenshot({
    path: info.outputPath('live-results-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Attiva tema scuro', exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath('live-results-dark.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Attiva tema chiaro', exact: true })
    .click();
  await screen(page, 'Fonti');
  await excerpt(page, 'Nuova fonte dopo approvazione', '', 'NOT_PROVIDED');
  await screen(page, 'Risultati');
  await expect(
    page.getByText('La pratica è cambiata.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Esporta / })).toHaveCount(4);
  for (const button of await page
    .getByRole('button', { name: /^Esporta / })
    .all())
    await expect(button).toBeDisabled();
});

test('real Gemini source review, cited chat and targeted narrative preserve the perito draft', async ({
  live,
}, info) => {
  const { page } = live;
  const caseId = await createCase(live, 'QA LIVE UI · AI e fonti marittime');
  await screen(page, 'Fonti');
  const lines = [
    ...sectorExamples.seaWaybill,
    `Synthetic QA batch ${randomUUID()}`,
  ];
  const source = await upload(
    live,
    'ai-sea-waybill.pdf',
    cargoPdf(lines),
    'sea_waybill',
    '1080 cartons on 29 pallets',
  );
  const extractionPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/documents/${source.sourceCode}/extract`,
      ),
    { timeout: 85_000 },
  );
  await page
    .getByRole('button', { name: 'Proponi fatti ed eventi', exact: true })
    .click();
  const extracted = await extractionPromise;
  expect([201, 503]).toContain(extracted.status());
  let reviewedFacts = 0;
  if (extracted.status() === 503) {
    await expect(page.getByRole('alert')).toContainText(
      'L’assistente non è disponibile',
    );
  } else {
    await page
      .getByRole('link', { name: 'Apri le proposte da rivedere', exact: true })
      .click();
    const proposal = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: new RegExp(`^${source.sourceCode} ·`),
      }),
    });
    await expect(proposal).toBeVisible();
    const suggestions = ((await extracted.json()) as Proposal).suggestions;
    // Review only a scalar quantity whose literal quotation occurs in this synthetic original.
    const verified = suggestions.find(
      (item) =>
        item.kind === 'FACT' &&
        [1080, 894, 29, 34].includes(item.content.numericValue ?? -1) &&
        item.content.excerpt &&
        lines.join(' ').includes(item.content.excerpt),
    );
    expect(
      verified,
      'The live source must yield a reviewable quoted quantity',
    ).toBeDefined();
    const reviewedRow = proposal.locator('.suggestion').filter({
      has: page.getByRole('checkbox', {
        name: `Seleziona ${verified!.content.fieldKey}`,
        exact: true,
      }),
    });
    await expect(reviewedRow.locator('.suggestion-value')).not.toContainText(
      'Non verificato',
    );
    await page.screenshot({
      path: info.outputPath('live-proposal-review.png'),
      fullPage: true,
    });
    await proposal
      .getByRole('button', { name: 'Apri la fonte', exact: true })
      .click();
    const reader = page.getByRole('dialog');
    await expect(reader).toContainText(verified!.content.excerpt!);
    await reader.getByRole('button', { name: 'Chiudi', exact: true }).click();
    await proposal
      .getByRole('checkbox', {
        name: `Seleziona ${verified!.content.fieldKey}`,
        exact: true,
      })
      .check();
    await proposal
      .getByRole('button', { name: 'Accetta selezionati', exact: true })
      .click();
    await screen(page, 'Evidenze');
    await expect(
      page.getByRole('heading', {
        name: verified!.content.fieldKey!,
        exact: true,
      }),
    ).toBeVisible();
    reviewedFacts = 1;
  }
  await screen(page, 'Chat');
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill(
      'Cita la riga originale di DOC-001 per il container TEST000001 e distingui cartoni e pallet. Non sommare container diversi e non dedurre un danno o una causa.',
    );
  const chatPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/chats' &&
      response.request().method() === 'POST',
    { timeout: 85_000 },
  );
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  const chat = await chatPromise;
  expect([201, 503]).toContain(chat.status());
  await expect(page).toHaveURL(new RegExp(`/cases/${caseId}/chat/`));
  let citationVerified = false;
  if (chat.status() === 201) {
    const answer = page.getByRole('article', {
      name: 'Risposta dell’assistente',
    });
    await expect(answer).toContainText('1080');
    await expect(answer).toContainText('29');
    await answer
      .getByRole('button', { name: /^DOC-001/ })
      .first()
      .click();
    const citation = page.getByRole('dialog', {
      name: 'Citazione · DOC-001',
      exact: true,
    });
    const quotation = await citation.locator('blockquote').innerText();
    expect(lines.join(' ').replace(/\s+/g, ' ')).toContain(
      quotation.replace(/\s+/g, ' '),
    );
    await citation
      .getByRole('button', {
        name: 'Apri il contenuto della fonte',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toContainText(
      '1080 cartons on 29 pallets',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Chiudi', exact: true })
      .click();
    citationVerified = true;
  } else
    await expect(page.getByRole('alert')).toContainText(
      'L’assistente non è disponibile',
    );
  await page.screenshot({
    path: info.outputPath('live-cited-chat.png'),
    fullPage: true,
  });
  await screen(page, 'Risultati');
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Relazione', exact: true }),
  });
  await card.getByRole('button', { name: 'Genera', exact: true }).click();
  await card.getByRole('button', { name: 'Apri', exact: true }).click();
  const draft = page.getByRole('dialog', {
    name: 'Relazione · v1',
    exact: true,
  });
  await draft
    .getByRole('button', { name: 'Modifica testo', exact: true })
    .click();
  const paragraphs = draft
    .getByRole('textbox', { name: 'Paragrafi', exact: true })
    .first();
  const manual =
    'Testo verificato manualmente: nessuna equivalenza automatica tra pallet, cartoni e danno.';
  await paragraphs.fill(`${await paragraphs.inputValue()}\n\n${manual}`);
  await draft
    .getByRole('button', { name: 'Salva nuova versione', exact: true })
    .click();
  const revised = page.getByRole('dialog', {
    name: 'Relazione · v2',
    exact: true,
  });
  await expect(revised).toContainText(manual);
  await revised.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await card
    .getByRole('button', { name: 'Con suggerimenti AI', exact: true })
    .click();
  const enhance = page.getByRole('dialog', {
    name: 'Nuova versione · Relazione',
    exact: true,
  });
  await enhance
    .getByLabel('Sezione per i suggerimenti')
    .selectOption('scope-and-limitations');
  const enhancedPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        '/artifacts/SURVEY_REPORT_DRAFT/generate',
      ),
    { timeout: 85_000 },
  );
  await enhance
    .getByRole('button', { name: 'Genera con suggerimenti AI', exact: true })
    .click();
  const enhanced = await enhancedPromise;
  expect([201, 503]).toContain(enhanced.status());
  if (enhanced.status() === 503) {
    await expect(enhance.getByRole('alert')).toContainText(
      'L’assistente non è disponibile',
    );
    await enhance.getByRole('button', { name: 'Annulla', exact: true }).click();
  } else await expect(enhance).not.toBeVisible();
  await card.getByRole('button', { name: 'Apri', exact: true }).click();
  const latest = page.getByRole('dialog', {
    name: `Relazione · v${enhanced.status() === 201 ? 3 : 2}`,
    exact: true,
  });
  await expect(latest).toContainText(manual);
  if (enhanced.status() === 201)
    await expect(latest).toContainText('Suggerimenti dell’assistente');
  await page.screenshot({
    path: info.outputPath('live-targeted-narrative.png'),
    fullPage: true,
  });
  await latest.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await fs.writeFile(
    info.outputPath('provider-source-observation.json'),
    JSON.stringify(
      {
        extractionStatus: extracted.status(),
        reviewedFacts,
        chatStatus: chat.status(),
        citationVerified,
        enhancedStatus: enhanced.status(),
        manualTextPreserved: true,
      },
      null,
      2,
    ),
  );
});

test('real forms retain invalid JSON and observed evidence, and preserve zero and false when corrected', async ({
  live,
}) => {
  const { page } = live;
  const caseId = await createCase(
    live,
    'QA LIVE UI · valori e limiti',
    'SHORTAGE',
  );
  await screen(page, 'Fonti');
  await page
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  const attach = page.getByRole('dialog', {
    name: 'Aggiungi una fonte',
    exact: true,
  });
  await attach
    .getByLabel('Disponibilità della fonte')
    .selectOption('EXCERPT_ONLY');
  await attach
    .getByLabel('Nome nel registro')
    .fill('Dichiarazione del magazzino sintetico');
  await attach
    .getByLabel('Tipo di documento')
    .selectOption('warehouse_receipt');
  await attach
    .getByLabel('Testo dell’estratto')
    .fill('Il magazzino dichiara 24 pallet per il solo primo lotto.');
  await attach.getByText('Metadati aggiuntivi', { exact: true }).click();
  await attach.getByLabel('Metadati JSON').fill('{"weight":1e400}');
  await attach
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  await expect(attach.getByRole('alert')).toContainText('numero troppo grande');
  await expect(attach.getByLabel('Metadati JSON')).toHaveValue(
    '{"weight":1e400}',
  );
  await attach
    .getByLabel('Metadati JSON')
    .fill('{"received":0,"complete":false}');
  await attach
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  await expect(attach).not.toBeVisible();
  await screen(page, 'Evidenze');
  await page
    .getByRole('button', { name: 'Aggiungi evidenza', exact: true })
    .click();
  const evidence = page.getByRole('dialog', {
    name: 'Aggiungi un’evidenza',
    exact: true,
  });
  await evidence
    .getByRole('textbox', { name: 'Campo', exact: true })
    .fill('cargo.input_limits');
  await evidence.getByLabel('Tipo del valore').selectOption('json');
  await evidence
    .getByRole('textbox', { name: 'Valore', exact: true })
    .fill('{"weight":1e400}');
  await evidence.getByLabel('Stato della prova').selectOption('UNKNOWN');
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(evidence.getByRole('alert')).toContainText(
    'numero troppo grande',
  );
  await expect(
    evidence.getByRole('textbox', { name: 'Valore', exact: true }),
  ).toHaveValue('{"weight":1e400}');
  const excessiveNesting = '['.repeat(33) + '0' + ']'.repeat(33);
  await evidence
    .getByRole('textbox', { name: 'Valore', exact: true })
    .fill(excessiveNesting);
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(evidence.getByRole('alert')).toContainText('troppo annidato');
  await expect(
    evidence.getByRole('textbox', { name: 'Valore', exact: true }),
  ).toHaveValue(excessiveNesting);
  await evidence
    .getByRole('textbox', { name: 'Valore', exact: true })
    .fill('{"weight":0,"complete":false,"cause":null}');
  const savedPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/cases/${caseId}/evidence` &&
      response.request().method() === 'POST',
  );
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  const saved = await savedPromise;
  expect(saved.status()).toBe(201);
  expect((await saved.json()).value).toEqual({
    weight: 0,
    complete: false,
    cause: null,
  });
  await expect(evidence).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Aggiungi evidenza', exact: true })
    .click();
  await evidence
    .getByRole('textbox', { name: 'Campo', exact: true })
    .fill('warehouse.received_pallets');
  await evidence.getByLabel('Tipo del valore').selectOption('number');
  await evidence
    .getByRole('textbox', { name: 'Valore', exact: true })
    .fill('24');
  await evidence.getByLabel('Stato della prova').selectOption('OBSERVED');
  await evidence.getByLabel('Attribuzione').fill('Magazzino sintetico');
  await evidence
    .getByRole('button', { name: 'Aggiungi riferimento', exact: true })
    .click();
  await evidence.getByLabel('Fonte registrata').selectOption('DOC-001');
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(evidence.getByRole('alert')).toContainText(
    'Per registrare un rilievo osservato',
  );
  await expect(
    evidence.getByRole('textbox', { name: 'Campo', exact: true }),
  ).toHaveValue('warehouse.received_pallets');
  await expect(
    evidence.getByRole('textbox', { name: 'Valore', exact: true }),
  ).toHaveValue('24');
  await expect(evidence.getByLabel('Fonte registrata')).toHaveValue('DOC-001');
  await evidence.getByLabel('Stato della prova').selectOption('REPORTED');
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(evidence).not.toBeVisible();
  await expect(
    page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: 'warehouse.received_pallets',
        exact: true,
      }),
    }),
  ).toContainText('Riportato');
});

test('real first-chat outage is recoverable in place and never creates an unexplained server error', async ({
  live,
}, info) => {
  const { page } = live;
  const caseId = await createCase(
    live,
    'QA LIVE UI · chat reale senza documenti',
  );
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill(
      'Per questa pratica sintetica non sono disponibili fonti: indica quali documenti richiedere, senza inventare quantità, danno o causa.',
    );
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/chats' &&
      response.request().method() === 'POST',
    { timeout: 85_000 },
  );
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  const response = await responsePromise;
  expect([201, 503]).toContain(response.status());
  await expect(page).toHaveURL(new RegExp(`/cases/${caseId}/chat/`), {
    timeout: 90_000,
  });
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }),
  ).toHaveCount(1);
  if (response.status() === 503) {
    await expect(page.getByRole('alert')).toContainText(
      'L’assistente non è disponibile',
    );
    await expect(
      page.getByRole('article', { name: 'Risposta dell’assistente' }),
    ).toHaveCount(0);
  } else
    await expect(
      page.getByRole('article', { name: 'Risposta dell’assistente' }),
    ).toHaveCount(1);
  await fs.writeFile(
    info.outputPath('provider-observation.json'),
    JSON.stringify({
      status: response.status(),
      assistantAnswerVerified: response.status() === 201,
    }),
  );
  await page.screenshot({
    path: info.outputPath('live-chat-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole('textbox', { name: 'Messaggio per l’assistente' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('live-chat-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
});
