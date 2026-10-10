import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, password } from './workspace';

test('source upload, proposal review, ledger, calculations, timeline, checks and all four exports', async ({
  workspace,
  page,
}) => {
  test.setTimeout(180_000);
  await workspace.open('/sources');
  await page.getByRole('button', { name: 'Carica file', exact: true }).click();
  const upload = page.getByRole('dialog', {
    name: 'Carica un documento',
    exact: true,
  });
  await upload.getByLabel(/^File/).setInputFiles({
    name: 'reefer-log.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Time;Temperature\n10:00;-18,5\n11:00;-17,5\n12:00;-18,0\n',
    ),
  });
  await upload
    .getByRole('button', { name: 'Carica documento', exact: true })
    .click();
  const attach = page.getByRole('dialog', {
    name: 'Aggiungi una fonte',
    exact: true,
  });
  await attach.getByLabel('Tipo di documento').selectOption('temperature_log');
  await attach
    .getByRole('button', { name: 'Aggiungi fonte', exact: true })
    .click();
  const source = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /DOC-001/ }) });
  await source
    .getByRole('button', { name: 'Apri DOC-001', exact: true })
    .click();
  const reader = page.getByRole('dialog', { name: /DOC-001/ });
  await expect(reader).toContainText('-18,5');
  await reader.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await source
    .getByRole('button', { name: 'Proponi fatti ed eventi', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Apri le proposte da rivedere', exact: true })
    .click();
  await expect(
    page.getByText('cargo.documented_statement', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Seleziona tutti', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Accetta selezionati', exact: true })
    .click();
  await expect(page.getByText('1 suggerimenti selezionati')).not.toBeVisible();
  await page.getByRole('link', { name: 'Evidenze', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'cargo.documented_statement',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Aggiungi evidenza', exact: true })
    .click();
  const evidence = page.getByRole('dialog', {
    name: 'Aggiungi un’evidenza',
    exact: true,
  });
  await evidence.getByLabel(/^Campo/).fill('damage.cause');
  await evidence.getByLabel('Stato della prova').selectOption('UNKNOWN');
  await evidence
    .getByLabel('Valore', { exact: true })
    .fill('Causa non accertata');
  await evidence
    .getByRole('button', { name: 'Registra evidenza', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'damage.cause', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Calcola da tabella', exact: true })
    .click();
  const calculate = page.getByRole('dialog', {
    name: 'Calcola da una tabella',
    exact: true,
  });
  await calculate.getByLabel('Campo del risultato').fill('temperature.mean');
  await calculate.getByLabel('Intestazione della colonna').fill('Temperature');
  await calculate
    .getByLabel('Operazione', { exact: true })
    .selectOption('MEAN');
  await calculate.getByLabel('Unità').fill('°C');
  await calculate
    .getByRole('button', { name: 'Calcola e registra', exact: true })
    .click();
  const result = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'temperature.mean', exact: true }),
  });
  await expect(result).toContainText('-18 °C');
  await expect(result).toContainText('Calcolato');
  await result.getByText('Metodo e dati del calcolo', { exact: true }).click();
  await expect(result.locator('pre')).toContainText('MEAN');
  await page.getByRole('link', { name: 'Cronologia', exact: true }).click();
  await page
    .getByRole('button', { name: 'Aggiungi evento', exact: true })
    .click();
  const event = page.getByRole('dialog', {
    name: 'Aggiungi un evento',
    exact: true,
  });
  await event
    .getByLabel(/^Evento/)
    .fill('Ricezione del logger da parte del perito');
  await event.getByLabel('Data', { exact: true }).fill('2026-10-10');
  await event.getByLabel('Significato della data').selectOption('RECEIVED');
  await event
    .getByRole('button', { name: 'Aggiungi riferimento', exact: true })
    .click();
  await event.getByLabel('Fonte registrata').selectOption('DOC-001');
  await event
    .getByRole('button', { name: 'Registra evento', exact: true })
    .click();
  await expect(
    page.getByText('Ricezione del logger da parte del perito', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Verifiche', exact: true }).click();
  await page
    .getByRole('button', { name: 'Aggiungi verifica', exact: true })
    .click();
  const check = page.getByRole('dialog', {
    name: 'Aggiungi una verifica',
    exact: true,
  });
  await check.getByLabel('Titolo della verifica').fill('Ambito del tally');
  await check
    .getByLabel('Spiegazione')
    .fill(
      'Manca la fonte originale per attribuire le 24 unità al singolo carico.',
    );
  await check.getByLabel('Riferimento della regola').fill('MANUAL-SCOPE');
  await check.getByLabel('Versione della regola').fill('1.0');
  await check
    .getByRole('button', { name: 'Registra verifica', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Modifica verifica Ambito del tally',
      exact: true,
    })
    .click();
  const editCheck = page.getByRole('dialog', {
    name: 'Modifica la verifica',
    exact: true,
  });
  await editCheck
    .getByLabel('Esito', { exact: true })
    .selectOption('ISSUE_FOUND');
  await editCheck
    .getByLabel('Spiegazione')
    .fill('Ambito non confrontabile: tenere separati 1080/29 e 894/34.');
  await editCheck
    .getByRole('button', { name: 'Salva verifica', exact: true })
    .click();
  await expect(
    page.getByText(
      'Ambito non confrontabile: tenere separati 1080/29 e 894/34.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Risultati', exact: true }).click();
  await page
    .getByRole('button', { name: 'Genera i quattro risultati', exact: true })
    .click();
  await expect(
    page.locator('.artifact-status').filter({ hasText: 'Versione 1' }),
  ).toHaveCount(4);
  for (const name of ['Revisione preliminare', 'Relazione']) {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(
      card.getByRole('button', { name: 'Esporta DOCX', exact: true }),
    ).toBeDisabled();
    await card.getByRole('button', { name: 'Apri', exact: true }).click();
    const narrative = page.getByRole('dialog', {
      name: new RegExp(`^${name} · v1$`),
    });
    await expect(narrative).toContainText(
      'Ricezione del logger da parte del perito',
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
    await expect(
      card.getByRole('button', { name: 'Esporta DOCX', exact: true }),
    ).toBeEnabled();
  }
  for (const [name, format] of [
    ['Scheda strutturata', 'JSON'],
    ['Registro documenti', 'XLSX'],
    ['Revisione preliminare', 'DOCX'],
    ['Relazione', 'DOCX'],
  ]) {
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    const downloadPromise = page.waitForEvent('download');
    await card
      .getByRole('button', { name: `Esporta ${format}`, exact: true })
      .click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`\\.${format!.toLowerCase()}$`),
    );
    const file = await download.path();
    expect(file).not.toBeNull();
    const bytes = await readFile(file!);
    if (format === 'JSON') {
      expect(() => JSON.parse(bytes.toString('utf8')) as unknown).not.toThrow();
      expect(bytes.toString('utf8')).toContain('temperature.mean');
    } else expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  }
});

test('registration, case creation and assignment editing work through the UI', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Registrati', exact: true }).click();
  await page
    .getByLabel(/^Email/)
    .fill(`registration-${randomUUID()}@example.test`);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel('Ripeti la password').fill(password);
  await page.getByRole('button', { name: 'Crea account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Da quale pratica/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Nuova pratica', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Nuova pratica',
    exact: true,
  });
  await dialog
    .getByLabel('Titolo della pratica')
    .fill('Container MSC · due carichi distinti');
  await dialog.getByLabel('Riferimento interno').fill('SYNTHETIC-MSC-001');
  await dialog.getByLabel('Committente').fill('Cliente sintetico');
  await dialog
    .getByRole('button', { name: 'Crea pratica', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Container MSC · due carichi distinti',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Pratica', exact: true }).click();
  await page
    .getByRole('button', { name: 'Modifica pratica', exact: true })
    .click();
  const edit = page.getByRole('dialog', {
    name: 'Modifica la pratica',
    exact: true,
  });
  await edit
    .getByLabel('Limiti dell’incarico')
    .fill(
      'Non confrontare il tally 24 con i carichi senza chiarirne l’ambito.',
    );
  await edit
    .getByRole('button', { name: 'Salva le modifiche', exact: true })
    .click();
  await expect(
    page.getByText(
      'Non confrontare il tally 24 con i carichi senza chiarirne l’ambito.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('the real API restores the cookie session and replies with a traceable source', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  await workspace.open();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Quali temperature risultano dalla fonte?');
  await page.getByRole('button', { name: 'Invia messaggio' }).click();
  await expect(
    page.getByRole('article', { name: 'Risposta dell’assistente' }),
  ).toContainText('Le quantità restano distinte per ambito');
  await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+$/);
  await page.getByRole('button', { name: 'DOC-001', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Citazione/ })).toContainText(
    'Temperature',
  );
  await page
    .getByRole('button', { name: 'Apri il contenuto della fonte', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: /DOC-001/ })).toContainText(
    '-18,5',
  );
});
