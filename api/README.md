# Expertise Automation API

This repository contains the backend for a cargo and transport surveyor workspace. It provides authenticated case records, source documents, evidence and event tracking, extraction proposals, case-scoped chat, review suggestions, and versioned report artifacts. It does not treat AI output as an approved fact or a final survey determination.

## Backend setup

Use Node.js `>=24.15.0 <25`, npm, and PostgreSQL. Docker is required for integration tests. Commands below run from `api`; on PowerShell use `npm.cmd` and `npx.cmd` if script execution policy blocks their `.ps1` wrappers.

1. Copy the repository-root `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`. Set `GEMINI_API_KEY` to enable AI features. Generate the JWT secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. The example database password is for local development; replace it for other environments.
2. From this directory, install dependencies and generate the Prisma client:

   ```bash
   npm ci
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

The API uses the `api` prefix and port `3000` by default; `PORT` must be an integer from 1 to 65535. Browser origins must be listed exactly in `FRONTEND_ORIGINS`, including scheme and port, without paths or wildcards. Uploaded files are stored under `api/documents/uploads` by default; use `DOCUMENT_STORAGE_DIR` for private storage outside a static web directory. OCR training data is cached under `api/.cache/ocr` unless `OCR_CACHE_DIR` is set.

For production, run `npm run build`, then `npm run start:prod` with `NODE_ENV=production` and HTTPS. Prisma uses the auto-discovered `prisma.config.ts`. Build generates the client and copies the DOCX parser worker. Before applying the new active-document uniqueness migration to an existing database, follow the duplicate check in the [audit's migration notes](docs/audit-2026-10-09.md#migrations-and-deployment).

## Authentication and HTTP contracts

Access tokens are returned by login and refresh and must be sent as `Authorization: Bearer <token>`. Access tokens expire after 15 minutes. Refresh tokens are stored only in an HttpOnly cookie, expire after 30 days, and have a 90-day absolute session lifetime. Rotation detects replay and revokes the token family. Logout revokes refresh tokens; an already issued access token can remain valid until its short expiry. Deleted accounts cannot use either token type.

Production cookies use `__Host-`, `Secure`, path `/`, and `SameSite=Lax` by default. `REFRESH_COOKIE_SAME_SITE` accepts `lax`, `strict`, or `none`; `none` requires the production HTTPS configuration. Cookie-backed authentication writes reject unlisted browser origins. Production requires an `Origin` header for those writes, including scripted clients.

Helmet applies security headers. Rate limits are 120 requests per minute per client address, reduced to 10 for the authentication controller. Counters are local to one process. Forwarded client addresses are not trusted automatically; deployments with a reverse proxy must define their trusted proxy topology before changing that behavior.

DTOs reject unknown fields, whitespace-only required text, invalid enums and dates, and `null` for fields that are optional but not nullable. JSON nesting is limited to 32 levels, with a 10,000-object guard before transformation. The HTTP JSON body limit is 100 KiB. List endpoints use `limit` (default 50, maximum 100) and `offset` (default 0, maximum 100000); a chat's messages are paginated by the same query. The artifact list returns the latest version of each of its four types. The [audit route table](docs/audit-2026-10-09.md#route-test-inventory) lists all 43 endpoints and tested edge cases.

Expected error statuses include `400` for invalid input, `401` for missing/invalid authentication, `403` for an untrusted authentication origin, `404` for a missing or foreign-owned resource, `409` for duplicate/stale/concurrent work, `413` for oversized requests, `429` for local throttling, and `503` for an unavailable or invalid AI response.

## AI provider

AI calls use the Gemini `generateContent` REST API and read the key only from `GEMINI_API_KEY`. On an HTTP 429 response, the backend retries the same structured request in this order: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, and `gemini-3.5-flash`. Other HTTP errors, including 503, and network failures stop the request without changing models. If every model returns 429, the API returns a service-unavailable response. The API key is sent in the `x-goog-api-key` header and is never added to request URLs or application logs. The complete cascade has a 60-second deadline, a 512000-byte text context limit, and a 2 MB provider response limit. Redirects are rejected. AJV validates the returned JSON against the requested schema; incomplete, blocked, malformed, and schema-invalid results are rejected.

AI extraction creates a reviewable proposal. If text extraction needs review, a human can inspect `/api/documents/:id/content` and confirm it with `POST /api/documents/:id/extraction-review` before requesting AI suggestions. A truncated extraction cannot be confirmed as complete; register a smaller excerpt instead. Accepting selected fact and event suggestions creates case records and source links; unselected suggestions remain unapproved. JPEG and PNG files also produce a separate image-description suggestion. Accepting that caption records the human review decision without turning the caption into a case fact. OCR always requires human text review. A source document quoting a surveyor is not itself a direct observation by this application's reviewer.

Chat receives the authorized case context, at most 12 preceding messages, and up to 48000 characters of source text (12000 per source). Citations must match the exact text and PDF page supplied to the model. A fabricated citation rejects the entire answer. Citations can point to an uploaded document or a registered excerpt. Enhanced reviews/reports include up to 32000 source characters and reject an entire suggestion if any of its source/evidence references are unknown. These checks verify reference identity and literal excerpts, not the truth or legal sufficiency of a claim; human review remains necessary.

When `targetSection` is supplied, chat and enhanced draft generation include the current manual section and omit obsolete prose. Concurrent case changes or target-section edits invalidate the pending response with `409`. An unsuccessful chat generation retains the user's message for review, but does not store an assistant answer. Invalid source selections are rejected before creating a chat or message. AI suggestions remain separately labelled, including in approved narrative exports; approval does not automatically turn alternatives into established evidence.

Enhanced narrative generation preserves current manual prose and adds suggestions separately. Stale prose is rebuilt from the current evidence; ordinary regeneration also rebuilds the deterministic narrative. A targeted enhancement replaces suggestions for that section while preserving other sections' suggestions. All enhanced narrative saves check the version used as their base, including requests without a target section. Manual revision requests can supply `expectedArtifactId` to reject an editor that was opened before another revision; the frontend always supplies it. Chat details expose the message count so the browser can open long conversations at their latest page.

Shipment, party, and damage information belongs in the sourced evidence ledger, where each non-unknown entry must link to a registered source. Assignment scope is workflow metadata and is explicitly marked as user-entered, not case evidence. Legacy JSON columns for shipment, parties, and damage are retained for database compatibility but are not accepted, returned, or used to generate AI context or artifacts. Model inputs identify excerpts that were omitted or shortened so absence from a prompt is not treated as absence from the source.

PDF, DOCX, XLSX, CSV, PNG, JPEG, single-page TIFF, and EML files are accepted. Multi-frame images and multi-page TIFF are rejected. Spreadsheet formulas are retained as formula text with any cached result; the extraction step never evaluates them. CSV delimiters are detected for comma, semicolon, and tab separated files. A case source marked `EXCERPT_ONLY` can store the excerpt text independently from an inaccessible original.

Upload accepts one `file` part, no other fields, and at most 10 MiB. Filenames, magic bytes, actual Office ZIP expansion/CRC, and image dimensions are checked. An active owner cannot upload the same SHA-256 twice, even concurrently; soft deletion allows a later re-upload. Download and extraction verify the stored hash. Office archives are limited to 2000 entries, 20 MiB per entry and 50 MiB expanded in total. DOCX conversion runs in a worker with a configured 128 MiB old-generation JavaScript heap limit and a 15-second deadline. This is not a total process-memory limit; parent Node heap options can override it. PDF extraction accepts at most 200 pages; image and PDF OCR raster limits are 40 million pixels. Extracted text is capped at two million characters. Tables are limited to 20000 rows, 1000 columns, and 200000 populated cells. These bounds do not replace a production processing queue and storage quotas; see the audit's remaining risks.

For CSV/XLSX sources, `POST /api/cases/:caseId/documents/:sourceCode/calculations` computes a selected numeric column with `SUM`, `MIN`, `MAX`, `MEAN`, `COUNT`, or `RANGE`. The request names the worksheet, header row, column, operation, measurement unit, and locale separators when needed. The calculation is stored as `CALCULATED` evidence with its source file hash, row span, method version, and excluded blank, nonnumeric, and formula cell counts. Formula cells are never evaluated or substituted with cached formula results.

## Case outputs

Each case supports four versioned outputs:

- A structured case record in JSON.
- A document register in XLSX.
- A preliminary review in DOCX.
- A draft survey report in DOCX.

Artifacts record the case revision used to create them. A later case change marks older artifacts stale; stale artifacts cannot be approved or exported as current. Narrative review/report artifacts can be saved as new manual revisions; earlier versions remain available from the version-history endpoint. Manual report sections must retain references to registered sources. The document register can record referenced or unavailable documents even when no file was uploaded.

Only the latest unapproved version can be approved. Any new report version resets case approval to draft. JSON/XLSX outputs can be exported as drafts; DOCX narratives require approval. Manual report section IDs must be unique; malformed sections, unknown references and incomplete preliminary structures are rejected. Only `cargo_damage_general_it_v1` template version `1.0` is implemented. Configuring another template is rejected rather than silently returning the generic one. PDF report previews, a governed legal-rule catalogue and transport-specific template modules are not implemented.

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
npm run check
npm run test:cov
npm audit --audit-level=moderate
```

`check` runs build, whole-project type checking, type-aware lint, formatting verification, unit/browser tests, and HTTP integration tests. The integration tests use the compiled production Nest application, real authentication/password hashing, filesystem storage, migrations and a disposable PostgreSQL 18.6 container. Only the Gemini HTTP response is mocked. An inventory test detects added or changed routes, and every protected route is checked without credentials. The workflow in `.github/workflows/verify.yml` repeats verification and dependency audit on pushes and pull requests without application secrets.

Additional opt-in checks:

```bash
npm run test:ocr
npm run test:live
```

OCR exercises synthetic cargo text in PNG, JPEG and TIFF and may download/cache Italian and English training data. Live Gemini exercises synthetic maritime, road, air and rail sources and the four exports using an isolated database. It consumes provider quota and can fail when the provider is unavailable. Failed sources are reported and remaining modes are still attempted; an incomplete live run exits unsuccessfully. Neither command is included in `check` or CI. The [dated audit](docs/audit-2026-10-09.md) distinguishes successful live evidence from mock coverage and records the latest results.
