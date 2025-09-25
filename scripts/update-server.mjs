const fs = require('fs');
const path = 'src/server.js';
let text = fs.readFileSync(path, 'utf8');
if (!text.includes('from "node:fs"')) {
  text = text.replace('import express from "express";\nimport cors from "cors";\nimport { nanoid } from "nanoid";',
    'import express from "express";\nimport cors from "cors";\nimport fs from "node:fs";\nimport { nanoid } from "nanoid";');
}
if (!text.includes('import { config }')) {
  text = text.replace('import { runPipeline } from "./index.js";\nimport { logger } from "./logger.js";\nimport { loadRuns, saveRuns } from "./runStore.js";\n',
    'import { runPipeline } from "./index.js";\nimport { logger } from "./logger.js";\nimport { config } from "./config.js";\nimport { loadRuns, saveRuns } from "./runStore.js";\n');
}
if (!text.includes('function getServiceAccountEmail')) {
  const insert = `function getServiceAccountEmail() {\n  const credentialsPath = config.googleCredentialsPath;\n  if (!credentialsPath) return null;\n  try {\n    const raw = fs.readFileSync(credentialsPath, "utf8");\n    const data = JSON.parse(raw);\n    return data.client_email || null;\n  } catch (error) {\n    logger.warn("Unable to read service account email", { message: error.message });\n    return null;\n  }\n}\n\n`;
  text = text.replace('const persistedRuns = loadRuns();\npersistedRuns.forEach((run) => {', insert + 'const persistedRuns = loadRuns();\npersistedRuns.forEach((run) => {');
}
if (!text.includes('app.get("/service-account"')) {
  text = text.replace('app.get("/health", (_req, res) => {\n  res.json({ status: "ok", timestamp: new Date().toISOString() });\n});\n\n',
    'app.get("/health", (_req, res) => {\n  res.json({ status: "ok", timestamp: new Date().toISOString() });\n});\n\napp.get("/service-account", (_req, res) => {\n  const email = getServiceAccountEmail();\n  if (!email) {\n    return res.status(404).json({ error: "Service account email not available" });\n  }\n  res.json({ email });\n});\n\n');
}
fs.writeFileSync(path, text);
