import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { config, validateEnv, ensureDirectories, requiredEnvVars } from "./config.js";
import { logger } from "./logger.js";
import { crawlDomain } from "./firecrawl.js";
import { buildLeadFromDocuments } from "./extractor.js";
import {
  appendLeadRows,
  createSpreadsheet,
  fetchExistingLeadIds,
  ensureHeaderRow
} from "./googleSheets.js";
import { recordFailure, upsertDomainState } from "./storage.js";
import { loadDocumentsFromFolder } from "./localLoader.js";
import { extractBusinessUrls } from "./directory.js";

function ensureHttp(url) {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

function parseDomainsFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Domains file not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function gatherDocuments(domain, options) {
  if (options.htmlFolder) {
    return loadDocumentsFromFolder(options.htmlFolder);
  }
  const startUrl = ensureHttp(domain);
  return crawlDomain(startUrl, {
    limit: options.maxPages ?? config.maxPages,
    maxDepth: options.maxDepth ?? config.maxDepth,
    includePaths: options.includePaths,
    excludePaths: options.excludePaths,
    pollInterval: options.pollInterval,
    delay: options.delay
  });
}

async function processDomain(domain, options) {
  let documents = [];
  try {
    documents = await gatherDocuments(domain, options);
    const documentCount = documents?.length ?? 0;
    if (!documentCount) {
      throw new Error("No documents returned from crawl");
    }
    const lead = await buildLeadFromDocuments({
      domain,
      documents,
      icpProfile: options.icp,
      maxPages: options.maxPages,
      concurrency: options.pageConcurrency,
      model: options.model
    });
    upsertDomainState(domain, {
      lastSuccess: new Date().toISOString(),
      pagesFetched: documentCount
    });
    return { success: true, documentsFetched: documentCount, ...lead };
  } catch (error) {
    recordFailure(domain, error);
    logger.error("Domain processing failed", { domain, error: error.message });
    return { success: false, error, documentsFetched: documents?.length ?? 0 };
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "run";
}

function buildSpreadsheetTitle(domains, options) {
  if (options.title) return options.title;
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let label = options.label || options.keyword;
  if (!label) {
    const firstDomain = ensureHttp(domains[0]);
    try {
      label = new URL(firstDomain).host;
    } catch {
      label = firstDomain;
    }
  }
  return `${datePart}_${slugify(label)}`;
}

export async function runPipeline(options) {
  ensureDirectories();
  const startedAt = Date.now();
  const dryRun = options.dryRun ?? config.dryRun;
  const envToValidate = dryRun
    ? ["FIRECRAWL_API_KEY", "OPENAI_API_KEY"]
    : requiredEnvVars;
  validateEnv(envToValidate);

  const metrics = {
    startedAt: new Date(startedAt).toISOString(),
    totals: {
      targetsDiscovered: 0,
      processed: 0,
      successes: 0,
      failures: 0
    },
    firecrawl: {
      directoryPages: 0,
      targetPages: 0
    },
    llm: {
      models: {},
      totalCalls: 0
    }
  };

  const usageByModel = metrics.llm.models;

  function accumulateUsage(model, usage) {
    if (!model || !usage) return;
    const bucket = usageByModel[model] || (usageByModel[model] = {});
    let accounted = false;
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        bucket[key] = (bucket[key] || 0) + value;
        accounted = true;
      }
    }
    if (accounted) {
      metrics.llm.totalCalls += 1;
    }
  }

  function accumulateResultUsage(result) {
    if (!result?.usage) return;
    const extraction = Array.isArray(result.usage.extraction) ? result.usage.extraction : [];
    extraction.forEach((entry) => accumulateUsage(entry?.model, entry?.usage));
    if (result.usage.scoring && result.scoring?.model) {
      accumulateUsage(result.scoring.model, result.usage.scoring);
    }
    if (result.usage.summary && result.summary?.model) {
      accumulateUsage(result.summary.model, result.usage.summary);
    }
  }

  const inputDomains = new Set();
  if (options.url) inputDomains.add(options.url);
  if (options.urls?.length) options.urls.forEach((url) => inputDomains.add(url));
  if (options.domainsFile) {
    parseDomainsFile(options.domainsFile).forEach((url) => inputDomains.add(url));
  }

  if (!inputDomains.size) {
    if (options.htmlFolder) {
      throw new Error("Provide at least one domain via --url or --domains when using --html-folder");
    }
    throw new Error("Provide at least one --url or --domains file");
  }

  const domains = Array.from(inputDomains);
  if (options.htmlFolder && domains.length > 1) {
    throw new Error("--html-folder currently supports a single domain");
  }

  const sheetName = options.sheetName || "Leads";
  let sheetId = options.sheetId || config.defaultSpreadsheetId;
  let spreadsheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : "";
  let createdNewSheet = false;

  if (!dryRun && !options.reuseSheet) {
    const shareWith = Array.from(new Set([
      ...config.sheetShareWith,
      ...(options.shareWith || [])
    ]));
    const title = buildSpreadsheetTitle(domains, options);
    try {
      const created = await createSpreadsheet({
        title,
        sheetName,
        shareWith,
        folderId: options.sheetFolderId || config.sheetFolderId
      });
      sheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl;
      createdNewSheet = true;
      logger.info("Spreadsheet created", { sheetId, spreadsheetUrl, sheetName, shareWith });
    } catch (error) {
      if (error?.response?.status === 403) {
        throw new Error("Unable to create spreadsheet (permission denied). Enable the Google Drive API for this project or rerun with --reuse-sheet and a shared SHEET_ID.");
      }
      throw error;
    }
  } else if (!dryRun && options.reuseSheet) {
    if (!sheetId) {
      throw new Error("--reuse-sheet requested but SHEET_ID is not configured");
    }
    logger.info("Reusing existing spreadsheet", { sheetId, sheetName });
  }

  const existingLeadIds = new Set();
  if (!dryRun && sheetId) {
    try {
      await ensureHeaderRow(sheetId, sheetName);
      const existing = await fetchExistingLeadIds(sheetId, sheetName);
      existing.forEach((id) => existingLeadIds.add(id));
      if (existingLeadIds.size) {
        logger.info("Loaded existing lead IDs", { count: existingLeadIds.size });
      }
    } catch (error) {
      logger.warn("Unable to load existing lead IDs", { message: error.message });
    }
  }

  const maxBusinesses = options.maxBusinesses ?? 25;
  const directoryMode = Boolean(options.directory);
  const targets = [];

  const finalizeMetrics = () => {
    metrics.totals.targetsDiscovered = targets.length;
    metrics.firecrawl.totalPages =
      (metrics.firecrawl.directoryPages || 0) +
      (metrics.firecrawl.targetPages || 0);
    metrics.durationMs = Date.now() - startedAt;
    metrics.finishedAt = new Date().toISOString();
    return metrics;
  };


  if (directoryMode) {
    await Promise.all(
      domains.map(async (domain) => {
        const startUrl = ensureHttp(domain);
        const documents = await gatherDocuments(domain, options);
        metrics.firecrawl.directoryPages += documents?.length ?? 0;
        if (!documents?.length) {
          logger.warn("No documents from directory", { startUrl });
          return;
        }
        const candidates = extractBusinessUrls(documents, startUrl, { maxBusinesses });
        if (!candidates.length) {
          logger.warn("No external business URLs discovered", { startUrl });
          return;
        }
        candidates.forEach((candidate) => {
          targets.push({ url: candidate.url, source: startUrl });
        });
      })
    );
  } else {
    domains.forEach((domain) => {
      targets.push({ url: domain });
    });
  }

  if (!targets.length) {
    const finalMetrics = finalizeMetrics();
    return {
      appended: 0,
      failures: [{ message: "No crawl targets discovered" }],
      dryRun,
      sheetId,
      spreadsheetUrl,
      createdNewSheet,
      directoryMode,
      targetsProcessed: 0,
      metrics: finalMetrics
    };
  }

  const limit = pLimit(options.domainConcurrency ?? 1);
  const pendingRows = [];
  const failures = [];

  await Promise.all(
    targets.map((target) =>
      limit(async () => {
        metrics.totals.processed += 1;
        const result = await processDomain(target.url, options);
        metrics.firecrawl.targetPages += result.documentsFetched ?? 0;
        if (!result.success) {
          metrics.totals.failures += 1;
          failures.push({ domain: target.url, error: result.error });
          return;
        }

        metrics.totals.successes += 1;
        accumulateResultUsage(result);

        const leadRow = result.sheetRow;
        if (!leadRow) return;
        if (existingLeadIds.has(leadRow.lead_id)) {
          logger.info("Lead already exists; skipping", { domain: target.url });
          return;
        }
        if (target.source) {
          try {
            const sources = JSON.parse(leadRow.source_urls || "[]");
            const list = Array.isArray(sources) ? sources : [];
            list.unshift(target.source);
            leadRow.source_urls = JSON.stringify(Array.from(new Set(list)));
          } catch {
            leadRow.source_urls = JSON.stringify([target.source]);
          }
        }
        existingLeadIds.add(leadRow.lead_id);
        pendingRows.push(leadRow);
        logger.info("Lead prepared", { domain: target.url, leadId: leadRow.lead_id });
      })
    )
  );

  if (!dryRun && pendingRows.length) {
    if (!sheetId) {
      throw new Error("No spreadsheet ID available for append. Provide SHEET_ID or allow automatic creation.");
    }
    await appendLeadRows(pendingRows, { sheetId, sheetName, dryRun });
  } else if (dryRun) {
    logger.info("Dry run completed", { prepared: pendingRows.length });
  }

  const finalMetrics = finalizeMetrics();

  return {
    appended: dryRun ? 0 : pendingRows.length,
    failures,
    dryRun,
    sheetId,
    spreadsheetUrl,
    createdNewSheet,
    directoryMode,
    targetsProcessed: metrics.totals.processed,
    metrics: finalMetrics
  };
}
