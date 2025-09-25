import express from "express";
import cors from "cors";
import fs from "node:fs";
import { nanoid } from "nanoid";
import { runPipeline } from "./index.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { loadRuns, saveRuns } from "./runStore.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const jobs = new Map();
const queue = [];
let processing = false;

function getServiceAccountEmail() {
  const credentialsPath = config.googleCredentialsPath;
  if (!credentialsPath) return null;
  try {
    const raw = fs.readFileSync(credentialsPath, "utf8");
    const data = JSON.parse(raw);
    return data.client_email || null;
  } catch (error) {
    logger.warn("Unable to read service account email", { message: error.message });
    return null;
  }
}

const persistedRuns = loadRuns();
persistedRuns.forEach((run) => {
  jobs.set(run.id, run);
  if (run.status === "running") {
    run.status = "queued";
  }
  if (run.status === "queued") {
    queue.push(run);
  }
});

function persistJobs() {
  saveRuns(Array.from(jobs.values()));
}

function accumulateModelUsage(target, model, usage) {
  if (!model || !usage) return;
  const bucket = target[model] || (target[model] = {});
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      bucket[key] = (bucket[key] || 0) + value;
    }
  }
}

function buildStats() {
  const stats = {
    runs: {
      total: jobs.size,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0
    },
    totals: {
      appended: 0,
      targetsDiscovered: 0,
      targetsProcessed: 0,
      successes: 0,
      failures: 0
    },
    firecrawl: {
      directoryPages: 0,
      targetPages: 0,
      totalPages: 0
    },
    llm: {
      totalCalls: 0,
      models: {}
    },
    lastFinishedAt: null
  };

  for (const job of jobs.values()) {
    if (job.status === "queued") {
      stats.runs.queued += 1;
    } else if (job.status === "running") {
      stats.runs.running += 1;
    } else if (job.status === "completed") {
      stats.runs.completed += 1;
    } else if (job.status === "failed") {
      stats.runs.failed += 1;
    }

    const appended = Number(job.result?.appended ?? 0);
    if (!Number.isNaN(appended)) {
      stats.totals.appended += appended;
    }

    const metrics = job.result?.metrics;
    if (metrics) {
      stats.totals.targetsDiscovered += metrics.totals?.targetsDiscovered ?? 0;
      stats.totals.targetsProcessed += metrics.totals?.processed ?? 0;
      stats.totals.successes += metrics.totals?.successes ?? 0;
      stats.totals.failures += metrics.totals?.failures ?? 0;

      stats.firecrawl.directoryPages += metrics.firecrawl?.directoryPages ?? 0;
      stats.firecrawl.targetPages += metrics.firecrawl?.targetPages ?? 0;

      stats.llm.totalCalls += metrics.llm?.totalCalls ?? 0;
      const modelUsages = metrics.llm?.models ?? {};
      for (const [model, usage] of Object.entries(modelUsages)) {
        accumulateModelUsage(stats.llm.models, model, usage);
      }

      const finishedAt = metrics.finishedAt || job.finishedAt;
      if (finishedAt && (!stats.lastFinishedAt || finishedAt > stats.lastFinishedAt)) {
        stats.lastFinishedAt = finishedAt;
      }
    } else if (job.finishedAt && (!stats.lastFinishedAt || job.finishedAt > stats.lastFinishedAt)) {
      stats.lastFinishedAt = job.finishedAt;
    }
  }

  stats.firecrawl.totalPages = stats.firecrawl.directoryPages + stats.firecrawl.targetPages;

  return stats;
}

if (persistedRuns.length) {
  persistJobs();
}

if (queue.length) {
  setImmediate(() => processQueue());
}

function parseSheetId(value) {
  if (!value) return null;
  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;
  const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function normaliseShareList(list = []) {
  if (typeof list === "string") {
    return list
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(list)) {
    return list.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function enqueue(job) {
  queue.push(job);
  persistJobs();
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const job = queue.shift();
    await runJob(job);
  }
  processing = false;
}

async function runJob(job) {
  const { options } = job;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  persistJobs();
  try {
    const result = await runPipeline(options);
    job.status = "completed";
    job.result = result;
    job.finishedAt = new Date().toISOString();
    persistJobs();
    logger.info("Job completed", { jobId: job.id, appended: result.appended });
  } catch (error) {
    job.status = "failed";
    job.error = {
      message: error.message,
      stack: error.stack
    };
    job.finishedAt = new Date().toISOString();
    persistJobs();
    logger.error("Job failed", { jobId: job.id, message: error.message });
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/service-account", (_req, res) => {
  const email = getServiceAccountEmail();
  if (!email) {
    return res.status(404).json({ error: "Service account email not available" });
  }
  res.json({ email });
});

app.post("/runs", (req, res) => {
  const body = req.body || {};
  if (!body.url && !body.urls?.length && !body.domainsFile) {
    return res.status(400).json({ error: "Provide at least one directory or domain URL" });
  }

  const sheetId = parseSheetId(body.sheetUrl) || parseSheetId(body.sheetId) || undefined;
  const shareWith = normaliseShareList(body.shareWith);

  const options = {
    url: body.url,
    urls: body.urls,
    domainsFile: body.domainsFile,
    htmlFolder: body.htmlFolder,
    icp: body.icp,
    directory: Boolean(body.directory),
    maxBusinesses: body.maxBusinesses,
    sheetName: body.sheetName,
    title: body.title,
    keyword: body.keyword,
    shareWith,
    sheetFolderId: body.sheetFolderId,
    reuseSheet: Boolean(body.reuseSheet),
    sheetId,
    maxDepth: body.maxDepth,
    maxPages: body.maxPages,
    pageConcurrency: body.pageConcurrency,
    domainConcurrency: body.domainConcurrency,
    model: body.model,
    delay: body.delay,
    pollInterval: body.pollInterval,
    dryRun: Boolean(body.dryRun)
  };

  const id = nanoid();
  const job = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    options,
    result: null,
    error: null
  };
  jobs.set(id, job);
  enqueue(job);
  res.status(202).json({ id, status: job.status });
});

app.get("/stats", (_req, res) => {
  res.json(buildStats());
});

app.get("/runs", (_req, res) => {
  const all = Array.from(jobs.values()).map((job) => ({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error
  }));
  res.json({ runs: all });
});

app.get("/runs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Run not found" });
  }
  res.json({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  logger.info("Lead scraper API listening", { port: PORT, host: HOST });
});

