import { parsePhoneNumberFromString } from "libphonenumber-js";
import { load } from "cheerio";

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const replacements = [
  { pattern: /\s*\[?\(?at\)?\]?\s*/gi, replacement: "@" },
  { pattern: /\s*\[?\(?dot\)?\]?\s*/gi, replacement: "." },
  { pattern: /\s+\bat\b\s+/gi, replacement: "@" },
  { pattern: /\s+\bdot\b\s+/gi, replacement: "." }
];

export function deobfuscate(text = "") {
  let output = text;
  for (const { pattern, replacement } of replacements) {
    output = output.replace(pattern, replacement);
  }
  return output.replace(/[\[\](){}<>]/g, "");
}

export function extractEmails(text = "") {
  const cleaned = deobfuscate(text);
  const matches = cleaned.match(emailRegex) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
}

export function extractPhones(text = "", defaultRegion = "US") {
  const tokens = text
    .replace(/[()]/g, " ")
    .replace(/[^0-9+\s-]/g, " ")
    .split(/\s+/);

  const seen = new Set();
  const phones = [];
  for (const token of tokens) {
    if (!token) continue;
    const normalized = token.replace(/[^0-9+]/g, "");
    if (normalized.length < 8) continue;
    try {
      const phone = parsePhoneNumberFromString(normalized, defaultRegion);
      if (phone && phone.isValid()) {
        const formatted = phone.number;
        if (!seen.has(formatted)) {
          seen.add(formatted);
          phones.push(formatted);
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  return phones;
}

export function extractLinkedInLinks(text = "") {
  const regex = /https?:\/\/([a-z]+\.)?linkedin\.com\/[A-Za-z0-9_./-]+/gi;
  const matches = text.match(regex) || [];
  return Array.from(new Set(matches.map((url) => url.split(/[?#]/)[0])));
}

export function detectTechHints({ html = "", markdown = "" }) {
  const tech = new Set();
  const $ = html ? load(html) : null;

  if (/wp-content/i.test(html)) tech.add("WordPress");
  if (/shopify/i.test(html)) tech.add("Shopify");
  if (/wixstatic/i.test(html)) tech.add("Wix");
  if (/squarespace/i.test(html)) tech.add("Squarespace");
  if (/hubspot/i.test(html)) tech.add("HubSpot");

  if ($) {
    const generator = $("meta[name='generator']").attr("content");
    if (generator) tech.add(generator.trim());
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (/salesforce|pardot/i.test(src)) tech.add("Salesforce/Pardot");
      if (/marketo/i.test(src)) tech.add("Marketo");
      if (/hubspot/i.test(src)) tech.add("HubSpot");
    });
  }

  if (/powered by shopify/i.test(markdown)) tech.add("Shopify");
  if (/powered by wordpress/i.test(markdown)) tech.add("WordPress");

  return Array.from(tech);
}

export function normalizeDomain(urlString) {
  try {
    const prefixed = urlString.startsWith("http") ? urlString : `https://${urlString}`;
    const { hostname } = new URL(prefixed);
    const host = hostname.toLowerCase();
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const ccTlds = ["co.uk", "com.au", "co.nz", "com.br", "com.mx", "com.tr"];
    const lastTwo = parts.slice(-2).join(".");
    const lastThree = parts.slice(-3).join(".");
    if (ccTlds.includes(lastThree)) {
      return lastThree;
    }
    return lastTwo;
  } catch {
    return urlString;
  }
}
