import fs from "node:fs";
import path from "node:path";
import { config, ensureDirectories } from "./config.js";

ensureDirectories();

const RUNS_FILE = path.join(config.cacheDir, "runs.json");

function loadFile() {
  try {
    const raw = fs.readFileSync(RUNS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return Array.isArray(parsed?.runs) ? parsed.runs : [];
  } catch (error) {
    return [];
  }
}

function saveFile(runs) {
  const payload = {
    updatedAt: new Date().toISOString(),
    runs
  };
  fs.writeFileSync(RUNS_FILE, JSON.stringify(payload, null, 2));
}

export function loadRuns() {
  return loadFile();
}

export function saveRuns(runs) {
  saveFile(runs);
}
