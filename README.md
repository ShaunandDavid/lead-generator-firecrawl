# Lead Scraper CLI

An opinionated CLI that combines Firecrawl for discovery, OpenAI for structured extraction, and Google Sheets for lead syncing. It prioritises high-signal pages, merges regex and LLM outputs, scores ICP fit, and appends deduped rows to Sheets so you get sales-ready leads in minutes.

## Features
- Firecrawl crawl with depth/limit controls that honour robots.txt and rate limits.
- Smart page prioritisation (contact/about/team/pricing/etc.).
- Hybrid extraction: regex for emails/phones + LLM JSON schema for semantics.
- Automatic model escalation when confidence is low.
- Domain or directory mode: start from a company homepage **or** a directory/listing; directory fan-out pulls external business websites automatically (with dedupe and max-results limit).
- Lead scoring + summary against an ICP description.
- Each run can create a brand-new Google Spreadsheet (or reuse an existing one) with headers pre-seeded.
- Resumability via `cache/run-state.json` and JSONL logs per day.

## Prerequisites
- Node.js 18+
- Firecrawl API key
- OpenAI API key
- Google Cloud service account JSON with access to Sheets/Drive
- Enable **Google Sheets API** (required) and **Google Drive API** (needed for auto-creating spreadsheets) for the project
- Share the target sheet or folder with the service-account email (Editor access)

## Environment variables
Copy `.env.example` to `.env` and fill in your secrets:

```
FIRECRAWL_API_KEY=your-firecrawl-key
OPENAI_API_KEY=your-openai-key
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Optional: reuse an existing spreadsheet with --reuse-sheet
SHEET_ID=
# Comma/semicolon separated emails to share newly created spreadsheets with
SHEET_SHARE_WITH=you@example.com
# Optional folder to store generated spreadsheets
SHEET_FOLDER_ID=

OPENAI_MODEL=gpt-4o-mini
OPENAI_ESCALATION_MODEL=gpt-4o
DRY_RUN=false
```

> If you see `PERMISSION_DENIED` when creating spreadsheets, enable the Google Drive API for your project or supply `SHEET_ID` and run with `--reuse-sheet`.

## Installation

```
npm install
```

Run via the `lead-scraper` bin or through npm:

```
npm start -- run --url https://example.com --icp "SaaS companies with 50-500 employees"
```

## Usage

```
lead-scraper run [options]

Options:
  --url <url>                 Single domain, directory, or homepage to crawl
  --urls <urls...>            Multiple starting URLs in one run
  --domains <file>            Text file of domains/URLs (one per line)
  --directory                 Treat inputs as directory/listing pages and fan-out to business sites
  --max-businesses <n>        Maximum businesses to extract in directory mode (default 25)
  --html-folder <path>        Use local HTML/Markdown instead of crawling (one domain per run)
  --icp <description>         Ideal customer profile description
  --sheet <name>              Tab name inside the spreadsheet (default: Leads)
  --title <name>              Spreadsheet title override
  --keyword <text>            Keyword to include in the auto-generated spreadsheet title
  --share <emails>            Extra comma/space separated emails to share the spreadsheet with
  --sheet-folder <id>         Drive folder ID for created spreadsheets
  --reuse-sheet               Append to the existing SHEET_ID instead of creating a new spreadsheet
  --max-depth <n>             Crawl depth (default from config)
  --max-pages <n>             Page fetch limit (default from config)
  --page-concurrency <n>      Parallel LLM extractions (default from config)
  --domain-concurrency <n>    Domains/businesses processed in parallel (default 1)
  --model <id>                Override OpenAI model for all prompts
  --delay <seconds>           Delay between crawl requests (default 2)
  --poll-interval <seconds>   Firecrawl poll interval in seconds (default 3)
  --dry-run                   Skip Google Sheets append (still runs crawl + extraction)
```

Examples:

**Single domain:**
```
lead-scraper run \
  --url https://contoso.com \
  --icp "US-based B2B SaaS with >$5M funding"
```

**Directory fan-out (with reuse):**
```
lead-scraper run \
  --url "https://www.yellowpages.com/search?search_terms=Business+Coaches+%26+Consultants&geo_location_terms=Port+Huron%2C+MI" \
  --directory \
  --max-businesses 25 \
  --reuse-sheet \
  --sheet "PortHuron-2025-09-25" \
  --icp "Businesses buying AI advisory services"
```

### Google Sheets layout
The header row is seeded automatically:

```
timestamp | lead_id | domain | company | emails | phones | contact_url | linkedin |
industry | location | size | tech_cms | fit_score | confidence | notes_ai | source_urls |
status | error
```

`lead_id` is a deterministic SHA-1 of `domain|primary_email` for idempotency. `source_urls` is a JSON string listing the pages that informed the lead (directory source is prepended in directory mode).

### Resumability & logs
- `cache/run-state.json` tracks per-domain state, last successes, and failures.
- `logs/YYYY-MM-DD.log` contains structured JSON lines for each event.
- If a domain fails, rerun the command; Firecrawl re-uses cached artefacts when available.

### Dry runs
Set `DRY_RUN=true` or pass `--dry-run` to exercise the entire pipeline without touching Sheets. Useful for prompt validation and cost estimation.

## Development Tips
- Toggle `DEBUG=true` to see verbose logs.
- Adjust defaults via environment variables (`MAX_PAGES`, `MAX_DEPTH`, `CONCURRENCY`, etc.).
- Key modules live in `src/`:
  - `firecrawl.js` — crawl wrapper
  - `extractor.js` — page prioritisation, LLM extraction, aggregation
  - `directory.js` — directory/link fan-out heuristics
  - `openai.js` — JSON-schema prompts, scoring, summaries
  - `googleSheets.js` — spreadsheet creation, sharing, and batch appends
  - `storage.js` — cache + resumability helpers

## Safety & compliance
- The crawler honours Firecrawl settings (respect robots.txt, set `--delay` for politeness).
- Only use the output for compliant outreach; avoid scraping personal data unless permitted.
- Review destination site terms before running bulk crawls.

## Roadmap ideas
- Persist per-page extraction artefacts for auditing
- Additional directory heuristics (support Chamber listings, Google Maps)
- Support alternative sinks (CSV, Airtable) via adapters
- Add health metrics (token spend, errors) to summary output

## API + UI quickstart
1. Share your Google Sheet (or folder) with the service-account email and, if you want automatic sheet creation, enable the Google Drive API.
2. Start the job runner API:
   `
   npm run api
   `
   The server listens on http://localhost:4000 and exposes /runs endpoints.
3. In another terminal, install deps (first run only) and start the UI:
   `
   cd web
   npm install
   npm run dev
   `
   The UI expects NEXT_PUBLIC_API_BASE_URL (default http://localhost:4000). See web/.env.local.example.
4. Open http://localhost:3000 — chat with the assistant, paste a directory URL and sheet link, configure options in the side panel, and launch runs.

Runs triggered via the UI translate directly to the CLI pipeline, so CLI and UI can be used interchangeably.
