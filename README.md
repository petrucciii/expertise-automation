# Expertise Automation

Cargo and transport surveyor workspace with a Nest backend and React/Vite frontend. It manages cases, source-tracked evidence, document registers, extraction proposals, scoped AI assistance, and versioned report artifacts with explicit human review.

Start with [the API guide](api/README.md) for installation, authentication, document workflows, output formats, and verification commands.

Then follow [the frontend guide](web/README.md) to start the ChatGPT-style workspace. The [complete visual and textual workflow](docs/app-flow.md) explains every feature and is also available inside the app.

The [code and security audit](api/docs/audit-2026-10-09.md) records the requirements checked, fixes, the complete route test inventory, sector document examples, live-provider results, and remaining implementation limits.

Requirements: Node.js 24.15 or later in the 24.x line, npm, and PostgreSQL. Docker is also required for HTTP integration tests, which create disposable PostgreSQL databases. The automatic suite does not use a real Gemini key or the database configured in your `.env`.

From `api`, run `npm ci` and `npm run check`. Optional `npm run test:ocr` and `npm run test:live` exercise real OCR and Gemini with synthetic documents; the live command sends those synthetic sources to Google and may consume API quota.

From `web`, run `npm ci`, `npm run check`, `npx playwright install chromium`, and `npm run test:e2e` for the browser workflow. The [frontend verification report](docs/frontend-verification.md) maps the implemented screens to the tests and visual checks. GitHub Actions verifies both applications, backend coverage and browser flows.
