import { readFile } from 'node:fs/promises';
import { test, expect } from './workspace';
import type { CaseRecord } from '../src/lib/types';

test('proposal rejection, original download, answer copy and conversation deletion preserve the workflow', async ({
  workspace,
  page,
  context,
}) => {
  await workspace.source();
  await workspace.open('/sources');
  await page
    .getByRole('button', { name: 'Proponi fatti ed eventi', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Apri le proposte da rivedere', exact: true })
    .click();
  await expect(page.getByText('cargo.documented_statement')).toBeVisible();
  await page.getByRole('button', { name: 'Rifiuta proposta' }).click();
  const rejection = page.getByRole('dialog', {
    name: 'Rifiutare questa proposta?',
    exact: true,
  });
  await rejection.getByRole('button', { name: 'Rifiuta proposta' }).click();
  await expect(
    page.getByText('Rifiutato', { exact: true }).first(),
  ).toBeVisible();
  expect(
    (await workspace.json<CaseRecord>(`/cases/${workspace.caseId}`)).evidence,
  ).toEqual([]);

  await page
    .getByRole('link', { name: 'Libreria documenti', exact: true })
    .click();
  const original = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica reefer-log.csv' }).click();
  const download = await original;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('reefer-log.csv');
  expect(await readFile((await download.path())!, 'utf8')).toBe(
    'Time;Temperature\n10:00;-18,5\n11:00;-17,5\n12:00;-18,0\n',
  );

  await workspace.open();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Verifica le fonti del logger');
  await page.getByRole('button', { name: 'Invia messaggio' }).click();
  const answer = page.getByRole('article', {
    name: 'Risposta dell’assistente',
  });
  await expect(answer).toContainText('Le quantità restano distinte per ambito');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await answer.getByRole('button', { name: 'Copia risposta' }).click();
  await expect(
    answer.getByRole('button', { name: 'Risposta copiata' }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Le quantità restano distinte per ambito',
  );
  await page.getByRole('button', { name: /^Elimina conversazione / }).click();
  await page
    .getByRole('dialog', { name: 'Eliminare la conversazione?' })
    .getByRole('button', { name: 'Elimina conversazione', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/cases/${workspace.caseId}$`));
  await expect(answer).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Elimina conversazione / }),
  ).toHaveCount(0);
});

test('single result generation, manual editing, targeted AI and section chat use the current report', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  await workspace.open('/results');
  const report = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Relazione', exact: true }),
  });
  await report.getByRole('button', { name: 'Genera', exact: true }).click();
  await expect(report).toContainText('Versione 1');
  await expect(
    page.getByText('Non ancora generato', { exact: true }),
  ).toHaveCount(3);
  await report.getByRole('button', { name: 'Apri', exact: true }).click();
  const initial = page.getByRole('dialog', {
    name: 'Relazione · v1',
    exact: true,
  });
  await initial.getByRole('button', { name: 'Modifica testo' }).click();
  await initial
    .getByLabel('Paragrafi', { exact: true })
    .first()
    .fill(
      'Limite manuale: il tally originale non è disponibile; causa non accertata.',
    );
  await initial.getByRole('button', { name: 'Salva nuova versione' }).click();
  const revised = page.getByRole('dialog', {
    name: 'Relazione · v2',
    exact: true,
  });
  await expect(revised).toContainText(
    'Limite manuale: il tally originale non è disponibile',
  );
  await revised.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await report.getByRole('button', { name: 'Con suggerimenti AI' }).click();
  const enhancement = page.getByRole('dialog', {
    name: 'Nuova versione · Relazione',
  });
  await enhancement
    .getByLabel('Sezione per i suggerimenti')
    .selectOption('scope-and-limitations');
  const generation = page.waitForRequest(
    (request) =>
      request.url().endsWith('/artifacts/SURVEY_REPORT_DRAFT/generate') &&
      request.method() === 'POST',
  );
  await enhancement
    .getByRole('button', { name: 'Genera con suggerimenti AI' })
    .click();
  expect((await generation).postDataJSON() as unknown).toEqual({
    enhanced: true,
    targetSection: 'scope-and-limitations',
  });
  await expect(report).toContainText('Versione 3');
  await expect(
    report.getByRole('button', { name: 'Esporta DOCX' }),
  ).toBeDisabled();
  await report.getByRole('button', { name: 'Apri', exact: true }).click();
  const current = page.getByRole('dialog', {
    name: 'Relazione · v3',
    exact: true,
  });
  await expect(current).toContainText(
    'Limite manuale: il tally originale non è disponibile',
  );
  await current.getByRole('link', { name: 'Lavora in chat' }).click();
  await expect(page).toHaveURL(/section=scope-and-limitations/);
  await page.getByRole('button', { name: 'Sezione', exact: true }).click();
  const options = page.getByRole('dialog', {
    name: 'Contesto della conversazione',
  });
  await expect(options.getByLabel('Sezione della relazione')).toHaveValue(
    'scope-and-limitations',
  );
  await options.getByRole('button', { name: 'Usa questo contesto' }).click();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Quali limiti mancano in questa sezione?');
  const message = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/chats') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Invia messaggio' }).click();
  expect(
    (await message).postDataJSON() as { targetSection: string },
  ).toMatchObject({
    targetSection: 'scope-and-limitations',
  });
  await expect(
    page.getByRole('article', { name: 'Risposta dell’assistente' }),
  ).toBeVisible();
});
