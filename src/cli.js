#!/usr/bin/env node
import { Command } from "commander";
import { runPipeline } from "./index.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

const program = new Command();

function parseInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseEmailList(value) {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

program
  .name("lead-scraper")
  .description("Firecrawl + OpenAI + Google Sheets lead scraper")
  .version("0.1.0");

program
  .command("run")
  .description("Crawl, extract, score, and sync leads")
  .option("--url <url>", "Starting URL to crawl")
  .option("--urls <urls...>", "Multiple starting URLs")
  .option("--domains <file>", "Path to newline-separated list of domains/URLs")
  .option("--html-folder <path>", "Folder containing HTML/Markdown files to analyze instead of crawling")
  .option("--icp <description>", "Ideal customer profile description to guide scoring")
  .option("--directory", "Treat the input URLs as directories/listings and attempt fan-out to business sites")
  .option("--max-businesses <number>", "Maximum businesses to extract from directory sources", (value) => parseInteger(value, 25))
  .option("--sheet <name>", "Tab name inside the spreadsheet (default: Leads)")
  .option("--title <name>", "Spreadsheet title override for this run")
  .option("--keyword <text>", "Keyword to include in the auto-generated spreadsheet title")
  .option("--share <emails>", "Additional comma/space separated emails to share the spreadsheet with", parseEmailList)
  .option("--sheet-folder <id>", "Drive folder ID where new spreadsheets should be stored")
  .option("--reuse-sheet", "Append to the existing SHEET_ID instead of creating a new spreadsheet")
  .option("--max-depth <number>", "Max crawl depth", (value) => parseInteger(value, config.maxDepth))
  .option("--max-pages <number>", "Max pages to fetch", (value) => parseInteger(value, config.maxPages))
  .option("--page-concurrency <number>", "Concurrent LLM extractions", (value) => parseInteger(value, config.concurrency))
  .option("--domain-concurrency <number>", "Number of domains/businesses to process in parallel", (value) => parseInteger(value, 1))
  .option("--model <id>", "Override OpenAI model for extraction/scoring")
  .option("--delay <seconds>", "Delay between crawl requests", (value) => parseInteger(value, 2))
  .option("--poll-interval <seconds>", "Firecrawl poll interval", (value) => parseInteger(value, 3))
  .option("--dry-run", "Run without writing to Google Sheets")
  .action(async (cmdOptions) => {
    const options = {
      url: cmdOptions.url,
      urls: cmdOptions.urls,
      domainsFile: cmdOptions.domains,
      htmlFolder: cmdOptions.htmlFolder,
      icp: cmdOptions.icp,
      directory: Boolean(cmdOptions.directory),
      maxBusinesses: cmdOptions.maxBusinesses,
      sheetName: cmdOptions.sheet,
      title: cmdOptions.title,
      keyword: cmdOptions.keyword,
      shareWith: cmdOptions.share || [],
      sheetFolderId: cmdOptions.sheetFolder,
      reuseSheet: Boolean(cmdOptions.reuseSheet),
      maxDepth: cmdOptions.maxDepth,
      maxPages: cmdOptions.maxPages,
      pageConcurrency: cmdOptions.pageConcurrency,
      domainConcurrency: cmdOptions.domainConcurrency,
      model: cmdOptions.model,
      delay: cmdOptions.delay,
      pollInterval: cmdOptions.pollInterval,
      dryRun: Boolean(cmdOptions.dryRun)
    };

    try {
      const result = await runPipeline(options);
      logger.info("Pipeline completed", result);
      if (!result.dryRun && result.spreadsheetUrl) {
        console.log(`Spreadsheet URL: ${result.spreadsheetUrl}`);
      }
    } catch (error) {
      logger.error("Pipeline failed", { message: error.message });
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
