import fs from "node:fs";
import path from "node:path";
import { config, ensureDirectories } from "./config.js";

ensureDirectories();

const STATE_PATH = path.join(config.cacheDir, "run-state.json");

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return { domains: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function getDomainState(domainKey) {
  const state = loadState();
  return state.domains?.[domainKey];
}

export function upsertDomainState(domainKey, payload) {
  const state = loadState();
  state.domains = state.domains || {};
  state.domains[domainKey] = {
    ...(state.domains[domainKey] || {}),
    ...payload,
    updatedAt: new Date().toISOString()
  };
  saveState(state);
  return state.domains[domainKey];
}

export function recordFailure(domainKey, error) {
  return upsertDomainState(domainKey, {
    lastFailure: {
      message: error?.message || String(error),
      stack: error?.stack,
      at: new Date().toISOString()
    }
  });
}

export function appendVisited(domainKey, url) {
  const state = loadState();
  state.domains = state.domains || {};
  const entry = state.domains[domainKey] || { visited: [] };
  entry.visited = Array.from(new Set([...(entry.visited || []), url]));
  entry.updatedAt = new Date().toISOString();
  state.domains[domainKey] = entry;
  saveState(state);
}

export function clearDomain(domainKey) {
  const state = loadState();
  if (state.domains) {
    delete state.domains[domainKey];
    saveState(state);
  }
}

export function listDomainStates() {
  const state = loadState();
  return Object.entries(state.domains || {});
}
