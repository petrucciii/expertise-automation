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
npm run test:cov
npm audit --audit-level=moderate
```

Build and type checking use strict TypeScript, including test code. Oxlint includes type-aware promise rules, React hooks and accessibility checks. Vitest/Testing Library verify transport, session concurrency, forms and hostile input handling. Browser verification is described in the final testing notes when the end-to-end suite is added. Test results and coverage have different scopes: unit coverage is not a claim that every visual state or possible document is tested.

## Production hosting

`npm run build` produces `dist`. Serve that directory from an HTTPS static host and route `/api` to the Nest server on the same origin. Configure history fallback to `index.html` for app routes, preserve the request `Origin`, keep uploads private, and set the API's allowed origin to the frontend's exact HTTPS origin. A static `vite preview` is a build inspection server and does not provide the development API proxy.

For a separate API origin, use an exact `VITE_API_BASE` at build time, enable credentialed CORS for the frontend origin, and configure backend cookie SameSite/Secure settings for that topology. Production response headers should include `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` for same-origin hosting, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Add the exact API origin to `connect-src` only when using a separate origin. The inline style allowance supports dynamic Radix positioning and the textarea's measured height; arbitrary HTML/script is never rendered.

Specialist transport templates, an automatic legal-rule engine and PDF report previews are not implemented by the backend; the interface does not simulate them.
