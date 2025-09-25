/* Simple structured logger */
import fs from "node:fs";
import path from "node:path";
import { config, ensureDirectories } from "./config.js";

ensureDirectories();

function writeLog(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  const line = JSON.stringify(entry);
  if (config.logsDir) {
    const logPath = path.join(
      config.logsDir,
      `${new Date().toISOString().slice(0, 10)}.log`
    );
    fs.appendFileSync(logPath, `${line}\n`);
  }
  const output = `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`;
  if (context && Object.keys(context).length) {
    console.log(output, context);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (message, context) => writeLog("info", message, context),
  warn: (message, context) => writeLog("warn", message, context),
  error: (message, context) => writeLog("error", message, context),
  debug: (message, context) => {
    if (process.env.DEBUG?.toLowerCase() === "true") {
      writeLog("debug", message, context);
    }
  }
};
