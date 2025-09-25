import crypto from "node:crypto";
import pLimit from "p-limit";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prioritizeDocuments } from "./heuristics.js";
import {
  extractEmails,
  extractPhones,
  extractLinkedInLinks,
  detectTechHints,
  normalizeDomain
} from "./parsers.js";
import {
  extractLeadSignals,
  scoreLeadFit,
  summarizeLead
} from "./openai.js";

const CONFIDENCE_THRESHOLD = 0.6;

function mergeUnique(list = []) {
  return Array.from(new Set(list.filter(Boolean)));
}

function pickHigherConfidence(current, incoming) {
  if (!incoming?.value) return current;
  if (!current?.value) return incoming;
  return (incoming.confidence ?? 0) >= (current.confidence ?? 0) ? incoming : current;
}

function buildLeadId(domain, primaryEmail) {
  const base = `${domain}|${primaryEmail || ""}`;
  return crypto.createHash("sha1").update(base).digest("hex");
}

async function extractPageSignals({ page, domain, icpProfile, model }) {
  const text = `${page.markdown || ""}\n${page.html || ""}`;
  const regexEmails = extractEmails(text);
  const regexPhones = extractPhones(text);
  const linkedin = extractLinkedInLinks(text + " " + (page.url || ""));
  const tech = detectTechHints({ html: page.html || "", markdown: page.markdown || "" });

  let result = await extractLeadSignals({
    page,
    domain,
    icpProfile,
    model,
    escalate: false
  });

  const usage = [];
  if (result.usage) usage.push({ model: result.model, usage: result.usage });

  const aiData = result.json;
  const needsEscalation =
    (aiData.confidence ?? 0) < CONFIDENCE_THRESHOLD || !aiData.company_name;

  if (needsEscalation) {
    const escalated = await extractLeadSignals({
      page,
      domain,
      icpProfile,
      model,
      escalate: true
    });
    if (escalated.usage) usage.push({ model: escalated.model, usage: escalated.usage });
    result = escalated;
  }

  return {
    url: page.url,
    ai: result.json,
    regexEmails,
    regexPhones,
    linkedin,
    tech,
    metadata: page.metadata || {},
    usage
  };
}

function aggregatePages(domain, pageResults) {
  const aggregate = {
    domain,
    company: null,
    description: null,
    industry: null,
    location: null,
    size: null,
    contactUrls: new Set(),
    emails: new Map(),
    phones: new Set(),
    linkedin: new Set(),
    otherSocial: new Set(),
    notes: [],
    confidenceScores: [],
    tech: new Set(),
    sourceUrls: new Set(),
    models: [],
    usage: []
  };

  for (const page of pageResults) {
    aggregate.sourceUrls.add(page.url);
    page.tech.forEach((item) => aggregate.tech.add(item));
    page.usage.forEach((usage) => aggregate.usage.push(usage));

    const ai = page.ai || {};
    const confidence = ai.confidence ?? 0;
    if (confidence) aggregate.confidenceScores.push(confidence);
    aggregate.models.push(...page.usage.map((u) => u.model));

    aggregate.company = pickHigherConfidence(aggregate.company, {
      value: ai.company_name,
      confidence
    });
    aggregate.description = pickHigherConfidence(aggregate.description, {
      value: ai.company_description,
      confidence
    });
    aggregate.industry = pickHigherConfidence(aggregate.industry, {
      value: ai.industry,
      confidence
    });
    aggregate.location = pickHigherConfidence(aggregate.location, {
      value: ai.headquarters,
      confidence
    });
    aggregate.size = pickHigherConfidence(aggregate.size, {
      value: ai.employee_count,
      confidence
    });

    (ai.contact_urls || []).forEach((url) => aggregate.contactUrls.add(url));
    (ai.linkedin_urls || []).forEach((url) => aggregate.linkedin.add(url));
    (ai.other_social || []).forEach((url) => aggregate.otherSocial.add(url));

    const aiEmails = (ai.emails || []).map((entry) => ({
      value: entry.value?.toLowerCase(),
      confidence: entry.confidence ?? confidence,
      context: entry.context || null
    }));
    for (const { value, confidence: emailConfidence, context } of aiEmails) {
      if (!value) continue;
      const existing = aggregate.emails.get(value) || { value, confidence: 0, contexts: [] };
      existing.confidence = Math.max(existing.confidence, emailConfidence ?? 0);
      if (context) existing.contexts = [...new Set([...(existing.contexts || []), context])];
      aggregate.emails.set(value, existing);
    }

    for (const email of page.regexEmails ?? []) {
      if (!email) continue;
      const existing = aggregate.emails.get(email) || { value: email, confidence: 0, contexts: [] };
      existing.confidence = Math.max(existing.confidence, 0.5);
      aggregate.emails.set(email, existing);
    }

    for (const phone of page.regexPhones ?? []) {
      aggregate.phones.add(phone);
    }

    if (Array.isArray(page.linkedin)) {
      page.linkedin.forEach((url) => aggregate.linkedin.add(url));
    }

    if (ai.notes) {
      aggregate.notes.push(ai.notes);
    }
  }

  const avgConfidence = aggregate.confidenceScores.length
    ? aggregate.confidenceScores.reduce((acc, val) => acc + val, 0) / aggregate.confidenceScores.length
    : null;

  return {
    domain,
    company: aggregate.company?.value || null,
    description: aggregate.description?.value || null,
    industry: aggregate.industry?.value || null,
    location: aggregate.location?.value || null,
    size: aggregate.size?.value || null,
    contactUrls: Array.from(aggregate.contactUrls),
    emails: Array.from(aggregate.emails.values())
      .map((row) => ({
        value: row.value,
        confidence: Number(row.confidence?.toFixed(2) || 0),
        context: row.contexts?.join("; ") || null
      }))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    phones: Array.from(aggregate.phones),
    linkedin: Array.from(aggregate.linkedin),
    otherSocial: Array.from(aggregate.otherSocial),
    notes: mergeUnique(aggregate.notes).join(" | ") || null,
    confidence: avgConfidence,
    tech: Array.from(aggregate.tech),
    sourceUrls: Array.from(aggregate.sourceUrls),
    usage: aggregate.usage
  };
}

function buildSheetRow(lead, scoring, summary) {
  const bestEmail = lead.emails[0]?.value || "";
  const leadId = buildLeadId(lead.domain, bestEmail);

  const notes = [summary?.json?.summary, ...(summary?.json?.key_signals || [])]
    .filter(Boolean)
    .join(" | ");

  return {
    lead,
    row: {
      timestamp: new Date().toISOString(),
      lead_id: leadId,
      domain: lead.domain,
      company: lead.company,
      emails: lead.emails.map((item) => item.value).join(", "),
      phones: lead.phones.join(", "),
      contact_url: lead.contactUrls[0] || lead.sourceUrls[0] || `https://${lead.domain}`,
      linkedin: lead.linkedin[0] || "",
      industry: lead.industry,
      location: lead.location,
      size: lead.size,
      tech_cms: lead.tech.join(", "),
      fit_score: scoring?.json?.fit_score ?? null,
      confidence: scoring?.json?.confidence ?? lead.confidence ?? null,
      notes_ai: notes || lead.notes,
      source_urls: JSON.stringify(lead.sourceUrls),
      status: "ok",
      error: ""
    }
  };
}

export async function buildLeadFromDocuments({ domain, documents, icpProfile, maxPages, concurrency, model }) {
  const normalizedDomain = normalizeDomain(domain);
  const prioritized = prioritizeDocuments(documents, maxPages ?? 12);
  logger.info("Processing domain", {
    domain: normalizedDomain,
    totalPages: documents.length,
    prioritized: prioritized.length
  });

  const limit = pLimit(concurrency ?? config.concurrency);
  const pageResults = await Promise.all(
    prioritized.map((doc) =>
      limit(() => extractPageSignals({ page: doc, domain: normalizedDomain, icpProfile, model }))
    )
  );

  const aggregate = aggregatePages(normalizedDomain, pageResults);

  const scoring = await scoreLeadFit({ lead: aggregate, icpProfile, model });
  const summary = await summarizeLead({ lead: aggregate, model });

  const { row } = buildSheetRow(aggregate, scoring, summary);

  return {
    lead: aggregate,
    sheetRow: row,
    scoring,
    summary,
    usage: {
      extraction: aggregate.usage,
      scoring: scoring?.usage,
      summary: summary?.usage
    }
  };
}
