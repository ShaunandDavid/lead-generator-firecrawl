# Lead Scraper SOP (Interim Reuse Mode)

## 1. Prerequisites
- Node.js 18+ and npm installed.
- Access to this repository.
- Service account key stored at `./service-account.json` (already in repo root) with email `codex-bot@invertible-now-468304-m6.iam.gserviceaccount.com`.
- Google Sheets that will receive leads must be owned by a user account with available Drive storage.

## 2. Environment Configuration
1. Copy `.env.example` to `.env` (already done for development).
2. Ensure `.env` has the following values:
   - `FIRECRAWL_API_KEY`
   - `OPENAI_API_KEY`
   - `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`
   - `SHEET_ID=<target Google Sheet ID>` (only when running in reuse mode)
   - Optional defaults: `SHEET_SHARE_NOTIFY`, `SHEET_SHARE_ON_REUSE`, `SHEET_FOLDER_ID` (used later when Workspace is live).
3. Install dependencies once:
   ```bash
   npm install
   npm install --prefix web
   ```

## 3. Preparing Client Sheets (Reuse Mode)
1. Client creates a Google Sheet (one per campaign or account).
2. Client shares the sheet with `codex-bot@invertible-now-468304-m6.iam.gserviceaccount.com` as **Editor**.
3. Collect the share link or sheet ID from the client.

## 4. Running via CLI (Ops Team)
1. From repo root run:
   ```bash
   node src/cli.js run --url <start-url> --reuse-sheet --sheet <tab-name> --share-notify --share-on-reuse
   ```
   - Replace `<start-url>` with the domain or directory to crawl.
   - Use `--sheet <tab-name>` if the target sheet uses a non-default tab name (default is `Leads`).
   - The CLI deduplicates leads using column B (`lead_id`).
2. Check `logs/<date>.log` for pipeline summaries.
3. Spreadsheet output is visible at the URL logged by the CLI.

## 5. Running via Web UI (Client Workflow)
1. Start services:
   ```bash
   npm run dev
   ```
   - API: `http://localhost:4000`
   - Web: `http://localhost:3000`
2. On the web form the client provides:
   - Directory or website URL(s).
   - Google Sheet link (forces reuse mode).
   - Optional: Drive folder URL (ignored until Workspace delegation is live).
   - ICP guidance and other parameters as needed.
3. After submission the job appears in the dashboard with status updates. The result card links to the populated Google Sheet.

## 6. Sharing Checklist for Onboarding Clients
- Verify the Google Sheet link responds for the service account by hitting `GET /service-account` and confirming the email matches the sheet's share list.
- Ensure clients have given the service account Editor access before launching a run.
- Confirm `npm test` and `npm run lint` pass before rolling changes into production.

## 7. Workspace Upgrade TODO (Future)
- Once Xenteck Workspace is active:
  1. Create a Workspace service account under the same project.
  2. Enable domain-wide delegation to impersonate an Ops user with Drive quota.
  3. Update `service-account.json`, set `GOOGLE_APPLICATION_CREDENTIALS`, and add `GOOGLE_IMPERSONATE_USER=<ops-user@xenteck.com>`.
  4. Re-enable automatic spreadsheet creation by providing `SHEET_SHARE_WITH`, `SHEET_SHARE_NOTIFY`, `SHEET_SHARE_ON_REUSE`, and optional `SHEET_FOLDER_ID` overrides.
- No code changes are required; only credentials and env updates.

## 8. Support Commands
- Lint: `npm run lint`
- Tests: `npm test`
- Logs tail: `Get-Content logs/<date>.log -Tail 50`
- Restart API/UI: `npm run dev`

## 9. Legal References
- Privacy Policy: docs/legal/privacy-policy.md
- Terms of Service: docs/legal/terms-of-service.md
- Data Processing Addendum: docs/legal/data-processing-addendum.md

Obtain client acknowledgement of the Terms and Privacy Policy before initiating runs.