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

AI extraction creates a reviewable proposal. Accepting selected suggestions creates case evidence and source links; unselected suggestions remain unapproved. Chat receives only the authorized case context and recent conversation history, and citations are checked against the exact supplied source excerpts. Generated review findings and draft text require human approval before export.

## Case outputs

Each case supports four versioned outputs:

- A structured case record in JSON.
- A document register in XLSX.
- A preliminary review in DOCX.
- A draft survey report in DOCX.

Artifacts record the case revision used to create them. A later case change marks older artifacts stale; stale artifacts cannot be approved or exported as current. The document register can record referenced or unavailable documents even when no file was uploaded.

## Main API groups

- `/api/auth`: registration, login, refresh, and logout.
- `/api/cases`: case details, document register, events, evidence, and issues.
- `/api/documents`: upload, download, extracted text, listing, and soft deletion.
- `/api/cases/:caseId/documents/:sourceCode/extract` and `/api/cases/:caseId/extractions`: extraction proposals and human review actions.
- `/api/chats`: case-scoped conversations and assistant messages.
- `/api/cases/:caseId/artifacts`: generation, version history, approval, and export.

All case, document, chat, extraction, and artifact operations are scoped to the authenticated owner. Request DTOs reject unknown fields through the global validation pipe.

## Checks

```bash
npm run build
npm run lint
npm test
```

Tests mock the Gemini HTTP API and do not require a live key. A live integration check requires a configured Gemini key and is not run by the unit-test suite.
