import OpenAI from "openai";
import { config } from "./config.js";
import { logger } from "./logger.js";

const isMock = process.env.MOCK_OPENAI?.toLowerCase() === "true";
const client = isMock ? null : new OpenAI({ apiKey: config.openAiApiKey });

function buildJsonSchemaFormat(name, schema) {
  return {
    type: "json_schema",
    name,
    strict: true,
    schema
  };
}

async function callJsonModel({
  name,
  schema,
  systemPrompt,
  userPrompt,
  model = config.openAiModel,
  temperature = 0,
  maxOutputTokens = 1500
}) {
  if (isMock) {
    return mockCall({ name, userPrompt });
  }
  const response = await client.responses.parse({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: buildJsonSchemaFormat(name, schema)
    },
    temperature,
    max_output_tokens: maxOutputTokens
  });

  if (!response.output_parsed) {
    const outputText = response.output_text?.trim();
    logger.error("OpenAI response missing parsed JSON", { outputText });
    throw new Error("OpenAI response missing parsed JSON");
  }

  return {
    json: response.output_parsed,
    usage: response.usage,
    model: response.model
  };
}

export async function extractLeadSignals({ page, domain, icpProfile, model, escalate }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      company_name: { type: ["string", "null"], description: "Legal or brand name" },
      company_description: { type: ["string", "null"], description: "1-2 sentence description" },
      industry: { type: ["string", "null"] },
      headquarters: { type: ["string", "null"], description: "City, state/province, country" },
      employee_count: { type: ["string", "null"], description: "Employee range if stated" },
      contact_urls: {
        type: "array",
        items: { type: "string" },
        description: "Contact or lead capture URLs present on page"
      },
      emails: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            context: { type: ["string", "null"] }
          },
          required: ["value", "confidence", "context"],
          description: "Emails present in text"
        }
      },
      phones: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string" },
            confidence: { type: "number" },
            context: { type: ["string", "null"] }
          },
          required: ["value", "confidence", "context"]
        }
      },
      linkedin_urls: {
        type: "array",
        items: { type: "string" }
      },
      other_social: {
        type: "array",
        items: { type: "string" }
      },
      notes: { type: ["string", "null"], description: "Signals relevant to ICP" },
      confidence: { type: "number" },
      missing_signals: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: [
      "company_name",
      "company_description",
      "industry",
      "headquarters",
      "employee_count",
      "contact_urls",
      "emails",
      "phones",
      "linkedin_urls",
      "other_social",
      "notes",
      "confidence",
      "missing_signals"
    ],
    description: "Structured lead signals extracted strictly from the provided content"
  };

  const basePrompt = `You are a lead research analyst building structured data from raw website content.
The ideal customer profile is: ${icpProfile || "not provided"}.
Only use facts explicitly present in the supplied content. Do not guess or fabricate.
If a field is not present, set it to null (or [] for arrays).
Return concise values.`;

  const userPrompt = `Domain: ${domain}
URL: ${page.url}
---
${page.markdown || page.html || "No content"}`;

  try {
    const result = await callJsonModel({
      name: "lead_extraction",
      schema,
      systemPrompt: basePrompt,
      userPrompt,
      model: model || config.openAiModel
    });
    return result;
  } catch (error) {
    logger.warn("Lead extraction failed on primary model", {
      url: page.url,
      message: error.message
    });
    if (!escalate) throw error;
    const fallbackModel = escalate === true ? config.upscaleModel : escalate;
    const result = await callJsonModel({
      name: "lead_extraction",
      schema,
      systemPrompt: basePrompt,
      userPrompt,
      model: fallbackModel
    });
    return result;
  }
}

export async function scoreLeadFit({ lead, icpProfile, model }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      fit_score: { type: "number" },
      confidence: { type: "number" },
      rationale: { type: "string" },
      blockers: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["fit_score", "confidence", "rationale", "blockers"],
    description: "Scoring output for ICP fit"
  };

  const systemPrompt = `You are evaluating whether a company is a good fit for a B2B sales lead list.
Return a fit score 0-100, confidence 0-1, rationale, and any blockers.`;

  const summary = JSON.stringify(lead, null, 2);

  const userPrompt = `Ideal customer profile:
${icpProfile}

Company facts:
${summary}`;

  const result = await callJsonModel({
    name: "lead_scoring",
    schema,
    systemPrompt,
    userPrompt,
    model: model || config.openAiModel
  });
  return result;
}

export async function summarizeLead({ lead, model }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      key_signals: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["summary", "key_signals"],
    description: "Concise summary of lead insights"
  };

  const systemPrompt = "Provide a concise, sales-ready summary highlighting why the company is interesting.";
  const userPrompt = JSON.stringify(lead, null, 2);

  const result = await callJsonModel({
    name: "lead_summary",
    schema,
    systemPrompt,
    userPrompt,
    model: model || config.openAiModel,
    maxOutputTokens: 600
  });
  return result;
}
function sanitizeDomain(value = "") {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.host.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  }
}

function humanizeDomain(host = "") {
  if (!host) return "Mock Company";
  const base = host.split(".")[0];
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function mockCall({ name, userPrompt }) {
  const usage = { total_tokens: 48, input_tokens: 28, output_tokens: 20 };
  if (name === "lead_extraction") {
    const domainMatch = userPrompt.match(/Domain:\s*(.+)/i);
    const domainValue = domainMatch ? domainMatch[1].trim() : "example.com";
    const host = sanitizeDomain(domainValue);
    const companyName = humanizeDomain(host);
    const email = `contact@${host}`.replace(/@\./, "@");
    return {
      json: {
        company_name: companyName,
        company_description: `${companyName} offers mocked services for test runs.`,
        industry: "Software",
        headquarters: "Austin, TX",
        employee_count: "51-200",
        contact_urls: [`https://${host}/contact`],
        emails: [
          { value: email, confidence: 0.9, context: "Primary" }
        ],
        phones: [
          { value: "+15551234567", confidence: 0.7, context: "Main" }
        ],
        linkedin_urls: [`https://www.linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, "-")}`],
        other_social: [],
        notes: "Mocked extraction output",
        confidence: 0.9,
        missing_signals: []
      },
      usage,
      model: "mock-llm-sm"
    };
  }
  if (name === "lead_scoring") {
    return {
      json: {
        fit_score: 82,
        confidence: 0.7,
        rationale: "Mock rationale based on fixture content.",
        blockers: []
      },
      usage,
      model: "mock-llm-sm"
    };
  }
  if (name === "lead_summary") {
    let payload = {};
    try {
      payload = JSON.parse(userPrompt);
    } catch {
      payload = {};
    }
    const company = payload?.company || "Mock Company";
    return {
      json: {
        summary: `${company} is summarised by the mock OpenAI adapter.`,
        key_signals: ["Mock summary signal"]
      },
      usage,
      model: "mock-llm-sm"
    };
  }
  return {
    json: {},
    usage,
    model: "mock-llm-sm"
  };
}
