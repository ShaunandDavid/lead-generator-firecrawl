import { load } from "cheerio";
import { normalizeDomain } from "./parsers.js";

const DEFAULT_MAX = 25;
const SOCIAL_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com"
]);

function resolveUrl(href = "", baseUrl = "") {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (!/^https?:/i.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function unwrapRedirect(urlString, baseDomain) {
  try {
    const url = new URL(urlString);
    if (normalizeDomain(urlString) !== baseDomain) {
      return urlString;
    }
    const redirectParam = url.searchParams.get("url") || url.searchParams.get("website") || url.searchParams.get("redirect") || url.searchParams.get("dest");
    if (redirectParam) {
      try {
        const decoded = decodeURIComponent(redirectParam);
        if (/^https?:/i.test(decoded)) {
          return decoded;
        }
      } catch {
        // ignore decode errors
      }
    }
    return urlString;
  } catch {
    return urlString;
  }
}

export function extractBusinessUrls(documents = [], sourceUrl, { maxBusinesses = DEFAULT_MAX } = {}) {
  const sourceDomain = normalizeDomain(sourceUrl || "");
  const seenDomains = new Set();
  const seenUrls = new Set();
  const results = [];

  for (const doc of documents) {
    const candidateSources = new Set();
    (doc.links || []).forEach((href) => candidateSources.add(href));

    if (doc.html) {
      try {
        const $ = load(doc.html);
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (href) candidateSources.add(href);
        });
      } catch (error) {
        // ignore parse errors
      }
    }

    for (const href of candidateSources) {
      if (results.length >= maxBusinesses) break;
      const absolute = resolveUrl(href, doc.url || sourceUrl);
      if (!absolute) continue;
      let cleaned = unwrapRedirect(absolute, sourceDomain);
      let domain = normalizeDomain(cleaned);
      if (!domain || domain === sourceDomain) continue;
      if (SOCIAL_DOMAINS.has(domain)) continue;
      if (seenDomains.has(domain)) continue;
      if (seenUrls.has(cleaned)) continue;
      seenDomains.add(domain);
      seenUrls.add(cleaned);
      results.push({
        url: cleaned,
        domain,
        sourceDocument: doc.url || sourceUrl
      });
      if (results.length >= maxBusinesses) break;
    }

    if (results.length >= maxBusinesses) break;
  }

  return results;
}
