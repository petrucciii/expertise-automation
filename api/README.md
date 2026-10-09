# Expertise Automation API

This repository contains the backend for a cargo and transport surveyor workspace. It provides authenticated case records, source documents, evidence and event tracking, extraction proposals, case-scoped chat, review suggestions, and versioned report artifacts. It does not treat AI output as an approved fact or a final survey determination.

## Backend setup

1. Copy the repository-root `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, and `GEMINI_API_KEY`. Generate the JWT secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
2. From this directory, install dependencies and generate the Prisma client:

   ```bash
   npm install
   npx prisma generate
   ```

3. Apply database migrations to the configured PostgreSQL database:

   ```bash
   npx prisma migrate deploy
   ```

4. Start the development server:

   ```bash
   npm run start:dev
   ```

The API uses the `api` prefix. Browser origins must be listed explicitly in `FRONTEND_ORIGINS`. Uploaded files are stored under `api/documents/uploads` by default; set `DOCUMENT_STORAGE_DIR` to use another private storage location.

## AI provider

AI calls use the Gemini `generateContent` REST API and read the key only from `GEMINI_API_KEY`. On an HTTP 429 response, the backend retries the same structured request in this order: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, and `gemini-3.5-flash`. Other HTTP errors and network failures stop the request without changing models. If every model returns 429, the API returns a service-unavailable response. The API key is sent in the `x-goog-api-key` header and is never added to request URLs or application logs.

AI extraction creates a reviewable proposal. If text extraction needs review, a human can inspect `/api/documents/:id/content` and confirm it with `POST /api/documents/:id/extraction-review` before requesting AI suggestions. A truncated extraction cannot be confirmed as complete; register a smaller excerpt instead. Accepting selected fact and event suggestions creates case records and source links; unselected suggestions remain unapproved. JPEG and PNG files also produce a separate image-description suggestion. Accepting that caption records the human review decision without turning the caption into a case fact. Chat receives only the authorized case context and recent conversation history, and citations are checked against the exact supplied source excerpts. Citations can point to an uploaded document or an excerpt registered on the case. Generated review findings and draft text require human approval before export.

Shipment, party, and damage information belongs in the sourced evidence ledger, where each non-unknown entry must link to a registered source. Assignment scope is workflow metadata and is explicitly marked as user-entered, not case evidence. Legacy JSON columns for shipment, parties, and damage are retained for database compatibility but are not accepted, returned, or used to generate AI context or artifacts. Model inputs identify excerpts that were omitted or shortened so absence from a prompt is not treated as absence from the source.

PDF, DOCX, XLSX, CSV, PNG, JPEG, TIFF, and EML files are accepted. Spreadsheet formulas are retained as formula text with any cached result; the extraction step never evaluates them. CSV delimiters are detected for comma, semicolon, and tab separated files. A case source marked `EXCERPT_ONLY` can store the excerpt text independently from an inaccessible original.

For CSV/XLSX sources, `POST /api/cases/:caseId/documents/:sourceCode/calculations` computes a selected numeric column with `SUM`, `MIN`, `MAX`, `MEAN`, `COUNT`, or `RANGE`. The request names the worksheet, header row, column, operation, measurement unit, and locale separators when needed. The calculation is stored as `CALCULATED` evidence with its source file hash, row span, method version, and excluded blank, nonnumeric, and formula cell counts. Formula cells are never evaluated or substituted with cached formula results.

## Case outputs

Each case supports four versioned outputs:

- A structured case record in JSON.
- A document register in XLSX.
- A preliminary review in DOCX.
- A draft survey report in DOCX.

Artifacts record the case revision used to create them. A later case change marks older artifacts stale; stale artifacts cannot be approved or exported as current. Narrative review/report artifacts can be saved as new manual revisions; earlier versions remain available from the version-history endpoint. Manual report sections must retain references to registered sources. The document register can record referenced or unavailable documents even when no file was uploaded.

## Main API groups

- `/api/auth`: registration, login, refresh, and logout.
- `/api/cases`: case details, document register, events, evidence, and issues.
- `/api/documents`: upload, download, extracted text, human extraction review, listing, and soft deletion.
- `/api/cases/:caseId/documents/:sourceCode/extract` and `/api/cases/:caseId/extractions`: extraction proposals and human review actions.
- `/api/cases/:caseId/documents/:sourceCode/calculations`: deterministic numeric column summaries for CSV/XLSX sources.
- `/api/chats`: case-scoped conversations and assistant messages.
- `/api/cases/:caseId/artifacts`: generation, version history, approval, and export.
- `/api/cases/:caseId/artifacts/:type/revisions` and `/versions`: surveyor edits and artifact version history.

All case, document, chat, extraction, and artifact operations are scoped to the authenticated owner. Request DTOs reject unknown fields through the global validation pipe.

## Checks

```bash
npm run build
npm run lint
npm test
```

Tests mock the Gemini HTTP API and do not require a live key. A live integration check requires a configured Gemini key and is not run by the unit-test suite.
