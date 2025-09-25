import { FirecrawlAppV1 } from "@mendable/firecrawl-js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { appendVisited } from "./storage.js";

const firecrawl = new FirecrawlAppV1({ apiKey: config.firecrawlApiKey });

export async function crawlDomain(startUrl, options = {}) {
  const limit = options.limit ?? config.maxPages;
  const maxDepth = options.maxDepth ?? config.maxDepth;
  const includePaths = options.includePaths;
  const excludePaths = options.excludePaths;
  const pollInterval = options.pollInterval ?? 3;
  const delay = options.delay ?? 2;

  logger.info("Starting Firecrawl job", { startUrl, limit, maxDepth });
  const response = await firecrawl.crawlUrl(
    startUrl,
    {
      limit,
      maxDepth,
      includePaths,
      excludePaths,
      scrapeOptions: {
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
        waitFor: options.waitFor ?? 0,
        location: options.location
      },
      deduplicateSimilarURLs: true,
      ignoreQueryParameters: true,
      delay
    },
    pollInterval
  );

  if (!response?.success) {
    const message = response?.error || "Unknown Firecrawl failure";
    throw new Error(`Firecrawl crawl failed: ${message}`);
  }

  const documents = response.data || [];
  documents.forEach((doc) => {
    if (doc.url) {
      appendVisited(normalizeDomainKey(startUrl), doc.url);
    }
  });

  logger.info("Firecrawl crawl complete", {
    startUrl,
    pages: documents.length,
    status: response.status
  });

  return documents;
}

export async function scrapeSingle(url, options = {}) {
  logger.info("Scraping single URL", { url });
  const response = await firecrawl.scrapeUrl(url, {
    ...options,
    formats: options.formats ?? ["markdown", "html", "links"]
  });
  if (!response?.success) {
    throw new Error(`Failed to scrape ${url}: ${response?.error || "unknown error"}`);
  }
  return response.data;
}

function normalizeDomainKey(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
