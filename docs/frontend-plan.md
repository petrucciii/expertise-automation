# Piano frontend — React e Vite

Piano scritto prima dell'implementazione, il 10 ottobre 2026. Il backend è stato verificato con 135 test unitari/browser, 109 test HTTP, copertura delle linee 87,37% e audit npm senza vulnerabilità note.

## Obiettivo e riferimento

Il perito deve poter completare una pratica di trasporto dal documento alla relazione usando le funzionalità reali del backend. L'interazione principale è una conversazione dentro la pratica; registri e risultati rimangono raggiungibili con navigazione esplicita.

Il riferimento richiesto è [ChatGPT](https://chatgpt.com): sidebar persistente, area di conversazione centrata, ampio spazio libero, messaggi sobri e composer arrotondato. Il nome e l'identità del prodotto sono Expertise. I controlli aggiunti servono al lavoro del perito, senza introdurre funzioni AI che l'API non offre.

## Passi di implementazione

1. **Fondazione.** Creare `web` con Vite, React, TypeScript strict, routing e query cache. Separare contratti API, autenticazione, componenti condivisi e funzionalità. Proxy `/api` in sviluppo; nessun segreto nel bundle. Access token in memoria, refresh cookie HttpOnly, rinnovo concorrente coordinato, cache cancellata al cambio sessione. Login, registrazione e uscita corrente/globale.
2. **Shell e navigazione.** Sidebar richiudibile con nuova pratica, ricerca locale delle pratiche caricate, libreria, elenco pratiche e conversazioni. URL per ogni pagina/pratica/conversazione. Area centrale con titolo e navigazione della pratica, menu account/tema. Layout responsive e focus accessibile.
3. **Pratiche e fonti.** Creazione/modifica di titolo, riferimenti, famiglia, incarico, stato e domande aperte. Libreria paginata con upload/download/rimozione. Collegamento originale o registrazione estratto/fonte mancante. Registro con metadati, disponibilità e hash. Lettore di testo/pagine/metadati, revisione OCR, gestione dei risultati troncati.
4. **Revisione e registri.** Lista paginata di proposte e selezione dei singoli suggerimenti, citazioni, accettazione/rifiuto. Evidenze manuali con tipo del valore, gruppo/unità/stato/attribuzione/fonti. Cronologia manuale con significato della data. Calcoli CSV/XLSX con tutte le operazioni/separatori. Checklist creabile e modificabile con evidenze collegate.
5. **Assistente.** Nuova chat e storico paginato, invio e gestione di errori/loading. Scelta fino a dieci documenti, contesto della sezione della relazione, citazioni apribili. Rendering di testo non fidato senza HTML attivo. Gestione delle conversazioni rimaste senza risposta dopo un errore AI.
6. **Risultati.** Generazione atomica delle quattro uscite e aggiornamento singolo, versione corrente e indicazione di obsolescenza. Suggerimenti AI delle narrative, editor delle sezioni della relazione e dei dati del preliminare, storico consultabile, nuova versione manuale, approvazione dell'ultima versione aggiornata. Download autenticati JSON/XLSX/DOCX. Nessuna anteprima PDF simulata.
7. **Verifica e consegna.** Test significativi di sessione, errori, rendering ostile, selezioni e workflow. Browser test contro backend/PostgreSQL temporanei; Gemini simulato solo per test ripetibili. Verifica visuale desktop, mobile 375 px e tema scuro; tastiera, focus, contrasto e reduced motion. Build/lint/tipi/formato/test/audit, documentazione di setup, mappa delle funzionalità e commit per fasi, poi push.

## Scelte visive

| Token   | Tema chiaro | Tema scuro | Uso                         |
| ------- | ----------- | ---------- | --------------------------- |
| Canvas  | `#FFFFFF`   | `#212121`  | Area centrale               |
| Sidebar | `#F9F9F9`   | `#171717`  | Navigazione persistente     |
| Surface | `#F4F4F4`   | `#303030`  | Composer e messaggi utente  |
| Text    | `#202020`   | `#ECECEC`  | Titoli e contenuti          |
| Muted   | `#636363`   | `#B4B4B4`  | Metadati e testo secondario |
| Border  | `#E5E5E5`   | `#454545`  | Divisori e campi            |

Tipografia: stack sans-serif di sistema per titoli e contenuti, con pesi e spaziatura distinti; monospace di sistema soltanto per codici fonte, hash e valori strutturati. Questa scelta mantiene la fedeltà al riferimento e non carica font o script di terzi. Spaziatura a multipli di 4/8 px, sidebar 260 px, conversazione circa 760 px, aree dei registri fino a 1100 px. Icone Lucide, azioni nere/chiare, colori semantici limitati agli stati.

```text
┌─────────────────────┬────────────────────────────────────────────┐
│ Expertise           │ Titolo pratica               Tema / conto │
│ Nuova pratica       │ Chat · Fonti · Evidenze · ... · Risultati  │
│ Libreria / Guida    ├────────────────────────────────────────────┤
│                     │                                            │
│ Le tue pratiche     │    Conversazione / registro / editor       │
│   Pratica attiva    │    Citazioni apribili e stato delle fonti  │
│   Altre pratiche    │                                            │
│                     │    ┌──────────────────────────────────┐    │
│ Conversazioni       │    │ Scrivi sulla pratica...         │    │
│   Storico           │    │ Fonti  ·  Sezione          Invia │    │
│                     │    └──────────────────────────────────┘    │
│ Account             │                                            │
└─────────────────────┴────────────────────────────────────────────┘
```

Il tratto specifico di Expertise è il riferimento alla fonte: un codice apribile accompagna evidenze, eventi, suggerimenti e risposte. Disponibilità, stato della prova e obsolescenza sono visibili dove influiscono su una decisione.

## Revisione del piano rispetto alla richiesta

Le raccomandazioni automatiche della skill UI suggerivano un'impostazione editoriale con serif e titoli molto grandi. Sono state scartate perché il riferimento esplicito è l'interfaccia ChatGPT. Si conservano invece i criteri di accessibilità, contrasto, feedback degli errori e controllo del carico visivo. Le schermate vuote invitano a usare una funzione reale; nessun dato dimostrativo viene presentato come una pratica dell'utente.

Riferimenti tecnici primari: [React](https://react.dev/learn/creating-a-react-app), [Vite](https://vite.dev/guide/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview). La mappa funzionale è descritta nel [flusso completo](app-flow.md).

## Completamento

Tutti e sette i passi sono implementati. Le verifiche comprendono build, tipi strict, lint, formato, 32 test unitari/frontend e 19 scenari browser contro backend e PostgreSQL temporanei. La [verifica frontend](frontend-verification.md) riporta la matrice delle funzionalità, gli screenshot ispezionati, i risultati effettivi e i limiti delle prove. L'[audit backend](../api/docs/audit-2026-10-09.md) mantiene separati test mock, OCR reale e chiamate Gemini live.
