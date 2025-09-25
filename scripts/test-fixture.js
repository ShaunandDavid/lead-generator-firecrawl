import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.MOCK_OPENAI = "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const fixturePath = path.resolve(__dirname, "..", "fixtures", "sample-docs.json");
  const documents = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const { buildLeadFromDocuments } = await import("../src/extractor.js");
  const result = await buildLeadFromDocuments({
    domain: "sample-co.test",
    documents,
    icpProfile: "Testing profile",
    maxPages: 5,
    concurrency: 2,
    model: "mock-llm-sm"
  });

  assert.ok(result.sheetRow, "Expected sheetRow in result");
  assert.equal(result.sheetRow.company, "Sample Co");
  assert.ok(result.sheetRow.emails.includes("contact@sample-co.test"));
  assert.equal(result.lead.location, "Austin, TX");
  assert.equal(result.scoring?.json?.fit_score, 82);
  assert.ok(Array.isArray(result.summary?.json?.key_signals));

  console.log("Fixture pipeline test passed");
}

run().catch((error) => {
  console.error("Fixture pipeline test failed:", error);
  process.exit(1);
});
