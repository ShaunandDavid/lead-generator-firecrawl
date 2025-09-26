import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

export const requiredEnvVars = [
  "FIRECRAWL_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS"
];

function parseList(value = "") {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
  defaultSpreadsheetId: process.env.SHEET_ID || "",
  sheetShareWith: parseList(process.env.SHEET_SHARE_WITH || ""),
  sheetFolderId: process.env.SHEET_FOLDER_ID || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  upscaleModel: process.env.OPENAI_ESCALATION_MODEL || "gpt-4o",
  concurrency: Number(process.env.CONCURRENCY || 6),
  maxDepth: Number(process.env.MAX_DEPTH || 2),
  maxPages: Number(process.env.MAX_PAGES || 80),
  cacheDir: process.env.CACHE_DIR || path.resolve("cache"),
  logsDir: process.env.LOGS_DIR || path.resolve("logs"),
  dryRun: process.env.DRY_RUN === "true",
  shareNotify: process.env.SHEET_SHARE_NOTIFY === "true",
  shareOnReuse: process.env.SHEET_SHARE_ON_REUSE === "true"
};

export function ensureDirectories() {
  for (const dir of [config.cacheDir, config.logsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function validateEnv(vars = requiredEnvVars) {
  const missing = vars.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
