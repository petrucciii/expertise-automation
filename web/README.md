# Expertise web

React/Vite workspace for cargo and transport surveyors. The interface follows the requested ChatGPT layout: collapsible sidebar, centered conversations, rounded composer, light/dark themes and responsive case screens. Data comes from the Nest API; empty states contain no fabricated cases or AI responses.

## Run locally

Use Node.js `>=24.15.0 <25`. Set up PostgreSQL, the root `.env` and the API migrations following [the backend guide](../api/README.md). In the root `.env`, allow the browser URL exactly in `FRONTEND_ORIGINS`, for example `http://localhost:5173,http://127.0.0.1:5173`. Start the API from `api` with `npm run start:dev`.

From `web`:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`, register or sign in, and create a practice. In PowerShell use `npm.cmd` / `npx.cmd` when execution policy blocks `.ps1` wrappers. Upload an original to the library or from the practice's sources, then link it to that practice. Open and check extracted text before requesting AI suggestions. The chat uses reviewed/extracted source content and registered evidence; a newly uploaded file is not automatically read by chat.

The dev server proxies `/api` to `http://127.0.0.1:3000`. To change the backend address, copy `.env.example` to `.env.local` and set `API_PROXY_TARGET`. `VITE_API_BASE` defaults to `/api`; it may be an exact HTTP(S) API URL ending in `/api`. No Gemini key, JWT secret or database credentials belong in `VITE_*` variables or frontend files.

## Screens and workflow

The sidebar opens practices, document library, guide and conversations. Within a practice:

- **Chat:** case-scoped questions, selected source files, report-section context, citations, conversation history, copy and deletion.
- **Pratica:** references, family, assignment, questions and work status.
- **Fonti:** originals, excerpts, unavailable references, metadata/hash, text reading, OCR confirmation and extraction proposals.
- **Proposte:** inspect facts/events/captions and their quotes, accept selected suggestions or reject a proposal.
- **Evidenze:** attributed records with status/unit/group/source references, plus deterministic CSV/XLSX calculations.
- **Cronologia:** events with date semantics, status, attribution and citations.
- **Verifiche:** four-state checklist with linked evidence and manual rule references.
- **Risultati:** four versioned outputs, AI suggestions, narrative editing, immutable history, approval and authenticated exports. Obsolete outputs must be regenerated.

The complete explanation and SVG diagram live in [the workflow guide](../docs/app-flow.md) and also appear under “Come funziona” in the app. The [frontend plan](../docs/frontend-plan.md) records the implementation sequence and design choices.

## Security and state

Access tokens remain in memory. Refresh uses the backend's HttpOnly cookie, single-flight coordination within a tab and Web Locks across tabs when supported. A BroadcastChannel clears other tabs on logout or account changes. Theme preferences are the only persisted browser setting. Owner changes clear query caches; late responses from previous sessions are rejected. Auth failures do not enter an infinite refresh loop. Logout failures remain visible instead of claiming that server revocation succeeded.

All files and exports use authenticated fetch and temporary blob URLs. AI responses render Markdown with raw HTML disabled; remote images are not loaded automatically. Source names, excerpt text, JSON and errors are rendered as text. Revision saving carries the opened artifact ID so the backend can reject concurrent edits. Client checks support usability; the backend remains authoritative for ownership, validation and approval.

## Checks

```bash
npm run check
npm audit --audit-level=moderate
npx playwright install chromium
npm run test:e2e
```

Build and type checking use strict TypeScript, including test code. Oxlint includes type-aware promise rules, React hooks and accessibility checks. Vitest/Testing Library verify transport, session concurrency, forms, OCR confirmation, selection limits and preservation of unsaved edits. Optional `npm run test:cov` measures that unit-test scope; it is not a measure of the complete browser workflow.

The Playwright suite starts the real compiled Nest application, a disposable PostgreSQL database, private temporary file storage, and Vite on ports 3101/5174. Docker must be running, both API and web dependencies must be installed, and those ports must be free. It uses real authentication, cookies, DTOs, parsers, ledger operations, revisions, approvals and downloads. The external Gemini transport is synthetic. Browser fixtures also replace the in-memory rate counter so repeated accessibility scans and UI setup do not exhaust the shared test-server quota; the backend HTTP suite tests real throttling separately. The suite never uses your configured database, real accounts, document storage or Gemini key.

Browser scenarios cover all eight practice screens, the library, registration, case editing, upload/duplicates, original text/download, proposal acceptance/rejection, manual evidence, table calculations, chronology, checklist editing, all four exports, manual and AI narrative versions, approvals, stale/concurrent updates, chat source/section context, history beyond a page, answer copying and conversation deletion. Security cases exercise hostile Markdown, inaccessible resources, session expiry, cross-tab rotation/logout and upload limits. Keyboard focus and automated axe WCAG A/AA checks run on desktop, mobile and dark theme; screenshots are saved under `test-results`. Linux CI installs browser dependencies with `npx playwright install --with-deps chromium`.

The [verification report](../docs/frontend-verification.md) maps these checks to features and records actual results and inspected screenshots. Automated accessibility checks do not replace a complete assistive-technology audit, and synthetic documents do not establish OCR or AI accuracy for every real document.

## Production hosting

`npm run build` produces `dist`. Serve that directory from an HTTPS static host and route `/api` to the Nest server on the same origin. Configure history fallback to `index.html` for app routes, preserve the request `Origin`, keep uploads private, and set the API's allowed origin to the frontend's exact HTTPS origin. A static `vite preview` is a build inspection server and does not provide the development API proxy.

For a separate API origin, use an exact `VITE_API_BASE` at build time, enable credentialed CORS for the frontend origin, and configure backend cookie SameSite/Secure settings for that topology. Production response headers should include `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` for same-origin hosting, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Add the exact API origin to `connect-src` only when using a separate origin. The inline style allowance supports dynamic Radix positioning and the textarea's measured height; arbitrary HTML/script is never rendered.

Specialist transport templates, an automatic legal-rule engine and PDF report previews are not implemented by the backend; the interface does not simulate them.
