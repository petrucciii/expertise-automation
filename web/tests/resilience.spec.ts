import { test, expect, createWorkspace } from './workspace';
import type { Artifact, CaseRecord, ChatReply } from '../src/lib/types';

test('an excerpt and missing documents remain explicit and never offer automatic extraction', async ({
  workspace,
  page,
}) => {
  await workspace.open('/sources');
  for (const [availability, name, excerpt] of [
    [
      'EXCERPT_ONLY',
      'Estratto del tally · 24 pallet',
      'Il magazzino dichiara 24 pallet; l’ambito non è verificato.',
    ],
    ['REFERENCED_NOT_ACCESSIBLE', 'Ordine giudiziario citato', ''],
    ['NOT_PROVIDED', 'Originale sea waybill da ottenere', ''],
  ]) {
    await page
      .getByRole('button', { name: 'Aggiungi fonte', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aggiungi una fonte',
      exact: true,
    });
    await dialog
      .getByLabel('Disponibilità della fonte')
      .selectOption(availability!);
    await dialog.getByLabel('Nome nel registro').fill(name!);
    if (excerpt) await dialog.getByLabel('Testo dell’estratto').fill(excerpt);
    await dialog
      .getByRole('button', { name: 'Aggiungi fonte', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(
    page.getByRole('button', { name: 'Proponi fatti ed eventi', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Apri DOC-002', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /DOC-002/ })).toContainText(
    'Non è disponibile un originale o un estratto',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Chiudi', exact: true })
    .click();
  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Qual è il limite dell’estratto del tally?');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await page.getByRole('button', { name: 'DOC-001', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Citazione · DOC-001', exact: true }),
  ).toContainText('l’ambito non è verificato');
  await page
    .getByRole('button', { name: 'Apri il contenuto della fonte', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: /DOC-001/ })).toContainText(
    'Estratto registrato',
  );
});

test('a failed AI response keeps the user message without inventing an assistant answer', async ({
  workspace,
  page,
}) => {
  await workspace.open();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('SIMULATE_OVERLOAD · controlla questo incarico');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'L’assistente non è disponibile',
  );
  await expect(page).toHaveURL(new RegExp(`/cases/${workspace.caseId}/chat/`));
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }),
  ).toContainText('SIMULATE_OVERLOAD');
  await expect(
    page.getByRole('article', { name: 'Risposta dell’assistente' }),
  ).toHaveCount(0);
  const savedChats = await workspace.json<Array<{ id: string }>>(
    `/chats?caseId=${workspace.caseId}`,
  );
  expect(savedChats).toHaveLength(1);
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Riprova senza simulare il sovraccarico');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: 'Risposta dell’assistente' }),
  ).toHaveCount(1);
  expect(
    await workspace.json(`/chats?caseId=${workspace.caseId}`),
  ).toHaveLength(1);
});

test('the empty conversation links to sources in the current case', async ({
  workspace,
  page,
}) => {
  await workspace.open();
  await page
    .getByRole('link', { name: 'Aggiungi una fonte', exact: true })
    .click();
  await expect(page).toHaveURL(`/cases/${workspace.caseId}/sources`);
  await expect(
    page.getByRole('heading', { name: 'Fonti della pratica', exact: true }),
  ).toBeVisible();
});

test('empty document selection prevents sending and an ineligible observation remains editable', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  await workspace.open();
  await page.getByRole('button', { name: 'Fonti', exact: true }).click();
  const options = page.getByRole('dialog', {
    name: 'Contesto della conversazione',
  });
  await options.getByLabel(/Usa soltanto i documenti selezionati/).check();
  await options
    .getByRole('button', { name: 'Usa questo contesto', exact: true })
    .click();
  await page
    .getByLabel('Messaggio per l’assistente')
    .fill('Domanda con selezione vuota');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await expect(options).toBeVisible();
  await options.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Scegli almeno un documento',
  );
  expect(await workspace.json(`/chats?caseId=${workspace.caseId}`)).toEqual([]);
  await page.getByRole('link', { name: 'Evidenze', exact: true }).click();
  await page
    .getByRole('button', { name: 'Aggiungi evidenza', exact: true })
    .click();
  const evidence = page.getByRole('dialog', { name: 'Aggiungi un’evidenza' });
  await evidence.getByLabel(/^Campo/).fill('survey.direct_observation');
  await evidence
    .getByLabel(/^Valore/)
    .fill('Dichiarazione del mittente che non costituisce un rilievo diretto');
  await evidence.getByLabel('Stato della prova').selectOption('OBSERVED');
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
  await expect(evidence.getByLabel(/^Valore/)).toHaveValue(
    'Dichiarazione del mittente che non costituisce un rilievo diretto',
  );
  const record = await workspace.json<CaseRecord>(`/cases/${workspace.caseId}`);
  expect(record.evidence).toHaveLength(0);
});

test('a concurrent narrative update preserves unsaved text and immutable versions', async ({
  workspace,
  page,
}) => {
  const source = await workspace.source();
  await workspace.json(`/cases/${workspace.caseId}/events`, 'POST', {
    event: 'Ricezione documentata',
    dateType: 'RECEIVED',
    epistemicStatus: 'STATED_IN_DOCUMENT',
    sources: [{ sourceCode: source.sourceCode }],
  });
  await workspace.json(`/cases/${workspace.caseId}/artifacts/generate`, 'POST');
  await workspace.open('/results');
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: 'Revisione preliminare',
      exact: true,
    }),
  });
  await card.getByRole('button', { name: 'Apri', exact: true }).click();
  const modal = page.getByRole('dialog', {
    name: 'Revisione preliminare · v1',
    exact: true,
  });
  await modal
    .getByRole('button', { name: 'Modifica testo', exact: true })
    .click();
  await modal.getByLabel(/Editor del contenuto completo/).check();
  const area = modal.getByLabel('Contenuto della revisione (JSON)');
  const content = JSON.parse(await area.inputValue()) as Record<
    string,
    unknown
  >;
  content.chronology = [
    {
      event: 'Cronologia modificata dal perito',
      sources: [{ sourceCode: source.sourceCode }],
    },
  ];
  await area.fill(JSON.stringify(content));
  await modal.getByLabel(/Editor del contenuto completo/).uncheck();
  await modal
    .getByLabel('Questioni aperte')
    .fill('Il testo non deve essere perso durante il salvataggio.');
  await modal
    .getByRole('button', { name: 'Salva nuova versione', exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await page
    .getByRole('dialog', { name: 'Revisione preliminare · v2', exact: true })
    .getByRole('button', { name: 'Chiudi', exact: true })
    .click();
  await expect(card).toContainText('Versione 2');
  const saved = await workspace.json<Artifact>(
    `/cases/${workspace.caseId}/artifacts/PRELIMINARY_REVIEW/latest`,
  );
  expect(saved.content.chronology).toEqual(content.chronology);
  await card.getByRole('button', { name: 'Apri', exact: true }).click();
  const editor = page.getByRole('dialog', {
    name: 'Revisione preliminare · v2',
    exact: true,
  });
  await editor
    .getByRole('button', { name: 'Modifica testo', exact: true })
    .click();
  await editor
    .getByLabel('Questioni aperte')
    .fill('Modifica locale ancora non salvata');
  await workspace.json(
    `/cases/${workspace.caseId}/artifacts/PRELIMINARY_REVIEW/generate`,
    'POST',
  );
  await editor
    .getByRole('button', { name: 'Salva nuova versione', exact: true })
    .click();
  await expect(editor.getByRole('alert')).toContainText('non è più corrente');
  await expect(editor.getByLabel('Questioni aperte')).toHaveValue(
    'Modifica locale ancora non salvata',
  );
  const versions = await workspace.json<Artifact[]>(
    `/cases/${workspace.caseId}/artifacts/PRELIMINARY_REVIEW/versions`,
  );
  expect(versions.map((version) => version.version)).toEqual([3, 2, 1]);
  expect(versions[1]?.content.openQuestions).toEqual([
    'Il testo non deve essere perso durante il salvataggio.',
  ]);
});

test('long conversations open at the latest page, load earlier messages and refresh across page boundaries', async ({
  workspace,
  page,
}) => {
  test.setTimeout(180_000);
  const first = await workspace.json<ChatReply>('/chats', 'POST', {
    caseId: workspace.caseId,
    message: 'History 00',
  });
  for (let index = 1; index < 50; index += 1)
    await workspace.json(`/chats/${first.chatId}/messages`, 'POST', {
      message: `History ${String(index).padStart(2, '0')}`,
    });
  await workspace.open(`/chat/${first.chatId}`);
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }).last(),
  ).toHaveText('History 49');
  await expect(
    page.locator('.chat-scroll').getByText('History 00', { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Messaggio per l’assistente').fill('History 50');
  await page
    .getByRole('button', { name: 'Invia messaggio', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }).last(),
  ).toHaveText('History 50');
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Carica messaggi precedenti', exact: true })
    .click();
  await expect(page.getByText('History 25', { exact: true })).toBeInViewport();
  const position = await page.locator('#main-content').evaluate((element) => ({
    top: element.scrollTop,
    height: element.clientHeight,
    total: element.scrollHeight,
  }));
  expect(position.top + position.height).toBeLessThan(position.total - 100);
  await page
    .getByRole('button', { name: 'Carica messaggi precedenti', exact: true })
    .click();
  await expect(
    page.locator('.chat-scroll').getByText('History 00', { exact: true }),
  ).toBeVisible();
});

test('a chat URL from another case is rejected and a foreign owner sees no private case content', async ({
  workspace,
  page,
  browser,
}) => {
  const other = await workspace.json<CaseRecord>('/cases', 'POST', {
    title: 'Altra pratica dello stesso perito',
    caseFamily: 'OTHER',
  });
  const chat = await workspace.json<ChatReply>('/chats', 'POST', {
    caseId: other.id,
    message: 'Conversazione che appartiene alla seconda pratica',
  });
  await workspace.open(`/chat/${chat.chatId}`);
  await expect(page.getByRole('alert')).toContainText(
    'La risorsa non è disponibile',
  );
  await expect(
    page.getByRole('article', { name: 'Il tuo messaggio' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Messaggio per l’assistente')).toBeDisabled();
  const secondContext = await browser.newContext();
  try {
    const second = await createWorkspace(await secondContext.newPage());
    await second.json(`/cases/${second.caseId}`, 'PATCH', {
      title: 'Contenuto riservato del secondo proprietario',
    });
    await page.goto(`/cases/${second.caseId}`);
    await expect(page.getByRole('alert')).toContainText(
      'La risorsa non è disponibile per questo account',
    );
    await expect(
      page.getByText('Contenuto riservato del secondo proprietario', {
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
});

test('source deletion makes generated outputs stale and retains the document register', async ({
  workspace,
  page,
}) => {
  await workspace.source();
  await workspace.json(`/cases/${workspace.caseId}/artifacts/generate`, 'POST');
  await workspace.open('/results');
  await page
    .getByRole('link', { name: 'Libreria documenti', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Rimuovi reefer-log.csv', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: /Rimuovere/ })
    .getByRole('button', { name: 'Rimuovi documento', exact: true })
    .click();
  await workspace.open('/results');
  await expect(page.getByText('Obsoleto', { exact: true })).toHaveCount(4);
  for (const button of await page
    .getByRole('button', { name: /^Esporta / })
    .all())
    await expect(button).toBeDisabled();
  await page.getByRole('link', { name: /^Fonti/ }).click();
  await expect(
    page.getByText('Citato, non accessibile', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /DOC-001/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Proponi fatti ed eventi', exact: true }),
  ).toHaveCount(0);
});
