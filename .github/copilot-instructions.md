# Copilot Instructions – Lead Scraper Repo

Purpose: Help AI agents contribute productively to this Firecrawl + OpenAI + Google Sheets lead-scraper with an API and a Next.js UI.

## Big picture
- Two apps share one codebase:
  - CLI + API server in `src/` (Node ESM).
  - UI in `web/` (Next.js App Router) that calls the API.
- Pipeline (see `src/index.js`): inputs (domains/directories) → crawl (`firecrawl.js`) → prioritize pages (`heuristics.js`) → per-page extraction (regex in `parsers.js` + LLM JSON output via `openai.js`) with auto-escalation → aggregate & score/summary → dedupe vs Google Sheet and append (`googleSheets.js`).
- State: resumability in `cache/run-state.json`; job/runs persisted in `cache/runs.json`; daily JSONL logs in `logs/YYYY-MM-DD.log` via `logger.js`.

## Key modules (what they do)
- `server.js`: Express API with in-memory queue + persistence. Endpoints: `GET /health`, `POST /runs`, `GET /runs`, `GET /runs/:id`, `GET /stats`.
- `cli.js`: Commander entrypoint (`lead-scraper run ...`) mapping flags to `runPipeline()` options.
- `index.js`: Orchestrates the full run and assembles metrics; creates/reuses Sheets; concurrency via `p-limit`.
- `firecrawl.js`: Wraps `@mendable/firecrawl-js`. Defaults: deduplicateSimilarURLs, ignoreQueryParameters, formats `[markdown, html, links]`.
- `extractor.js`: Hybrid extraction. Regex emails/phones/LinkedIn + LLM signals; auto-escalates to `OPENAI_ESCALATION_MODEL` when confidence < 0.6; aggregates signals and builds a sheet row.
- `openai.js`: Uses Responses API with `text.format: json_schema`. Has `extractLeadSignals`, `scoreLeadFit`, `summarizeLead`. Supports mock mode via `MOCK_OPENAI=true` (no network/costs).
- `googleSheets.js`: Service account auth; creates spreadsheet/tabs, header row, sharing, and batch appends. Header fields are the contract.
- `directory.js`: Fan-out from listing pages to external business sites (excludes social domains); dedupes by domain.
- `parsers.js` / `heuristics.js`: Regex+libphonenumber extraction and page scoring. `normalizeDomain()` returns registrable domain.

## Environment & configuration
- Env is loaded in `config.js`. Required for full runs: `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` (JSON key path). Optional: `SHEET_ID`, `SHEET_SHARE_WITH`, `SHEET_FOLDER_ID`, `OPENAI_MODEL`, `OPENAI_ESCALATION_MODEL`, `DRY_RUN`, crawl limits (`MAX_DEPTH`, `MAX_PAGES`), `CONCURRENCY`.
- Drive API: To auto-create spreadsheets, enable Google Drive API for the project; otherwise run with `--reuse-sheet` and a shared `SHEET_ID`. A 403 during creation triggers an actionable error.
- Mocking & costs: Set `MOCK_OPENAI=true` to return deterministic fake LLM outputs; set `DRY_RUN=true` or pass `--dry-run` to skip Google Sheets writes.

## Developer workflows
- Install deps at repo root; UI uses `web` workspace and depends on the local package (`"lead-scraper": "file:.."`).
- Common scripts (root `package.json`):
  - `npm run api` → starts API at http://localhost:4000.
  - `npm start -- run ...` → invoke CLI. Flags mirror the API body (see below).
  - `npm run dev` → concurrently runs API + `web` dev server.
  - `npm run test` → exercises `fixtures/sample-docs.json` via `scripts/test-fixture.js` (no network). 
- API body to `/runs`: `{ url|urls|domainsFile, htmlFolder?, icp, directory?, maxBusinesses?, sheetName?, title?, keyword?, shareWith?, sheetFolderId?, reuseSheet?, sheetId?, maxDepth?, maxPages?, pageConcurrency?, domainConcurrency?, model?, delay?, pollInterval?, dryRun? }`.

## Data contracts & conventions
- Google Sheets header (source of truth in `googleSheets.js`):
  `timestamp | lead_id | domain | company | emails | phones | contact_url | linkedin | industry | location | size | tech_cms | fit_score | confidence | notes_ai | source_urls | status | error`.
- `lead_id` is SHA-1 of `domain|primary_email` (see `extractor.js`). Dedupe pulls existing IDs using column B.
- `buildSheetRow()` defines how fields map to columns. If you add a column: update `HEADER` in `googleSheets.js` and this builder together.
- Metrics: `runPipeline()` returns `{ appended, failures[], dryRun, sheetId, spreadsheetUrl, createdNewSheet, directoryMode, targetsProcessed, metrics }`. `metrics` includes `totals`, `firecrawl`, `llm.totalCalls`, `llm.models[model].{token counts}`, timestamps.
- Directory mode: `--directory` or API `directory: true` will crawl listing pages, then `extractBusinessUrls()` discovers external targets (caps at `maxBusinesses`, default 25).

## Patterns to follow
- Respect `config.js` defaults and env var gates; use `validateEnv()` when adding new sinks/integrations.
- Accumulate model usage consistently via the `usage` structures (see `index.js: accumulateResultUsage`).
- Use `logger.js` for structured logs; avoid `console.*` except where already patterned (CLI final URL).
- Persist any new per-run state under `cache/` via `storage.js` or `runStore.js` (avoid ad-hoc files).

## UI integration
- The Next.js app in `web/` expects `NEXT_PUBLIC_API_BASE_URL` (default http://localhost:4000). It translates UI actions to the same `/runs` API shape; ensure server options remain stable when changing CLI flags.

Feedback: If any section is unclear (e.g., additional headers, new endpoints, or env nuances), tell us what you need and we’ll extend this guide.