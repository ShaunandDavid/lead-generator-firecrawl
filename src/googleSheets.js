import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { config } from "./config.js";
import { logger } from "./logger.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive"
];
const DEFAULT_TAB = "Leads";
const HEADER = [
  "timestamp",
  "lead_id",
  "domain",
  "company",
  "emails",
  "phones",
  "contact_url",
  "linkedin",
  "industry",
  "location",
  "size",
  "tech_cms",
  "fit_score",
  "confidence",
  "notes_ai",
  "source_urls",
  "status",
  "error"
];

let googleAuth;
let sheetsClient;
let driveClient;

function resolveCredentialsPath() {
  const given = config.googleCredentialsPath;
  if (!given) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set");
  }
  const absolute = path.isAbsolute(given) ? given : path.resolve(given);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Google credentials file not found at ${absolute}`);
  }
  return absolute;
}

async function getAuth() {
  if (!googleAuth) {
    googleAuth = new google.auth.GoogleAuth({
      keyFile: resolveCredentialsPath(),
      scopes: SCOPES
    });
  }
  return googleAuth;
}

async function getSheets() {
  if (sheetsClient) return sheetsClient;
  const authClient = await (await getAuth()).getClient();
  sheetsClient = google.sheets({ version: "v4", auth: authClient });
  return sheetsClient;
}

async function getDrive() {
  if (driveClient) return driveClient;
  const authClient = await (await getAuth()).getClient();
  driveClient = google.drive({ version: "v3", auth: authClient });
  return driveClient;
}

function formatRange(sheetName, range) {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

function toRowValues(row) {
  return HEADER.map((key) => row[key] ?? "");
}

async function addSheet(sheetId, sheetName) {
  const sheets = await getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: sheetName }
          }
        }
      ]
    }
  });
  logger.info("Sheet tab created", { sheetId, sheetName });
}

export async function createSpreadsheet({
  title,
  sheetName = DEFAULT_TAB,
  shareWith = [],
  folderId
}) {
  const sheets = await getSheets();
  const requestBody = {
    properties: { title },
    sheets: [
      {
        properties: {
          title: sheetName
        }
      }
    ]
  };
  const res = await sheets.spreadsheets.create({ requestBody });
  const spreadsheetId = res.data.spreadsheetId;
  const spreadsheetUrl = res.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  if (folderId) {
    try {
      const drive = await getDrive();
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: "root"
      });
    } catch (error) {
      logger.warn("Unable to move spreadsheet to folder", { folderId, error: error.message });
    }
  }

  if (shareWith.length) {
    const drive = await getDrive();
    await Promise.all(
      shareWith.map((email) =>
        drive.permissions
          .create({
            fileId: spreadsheetId,
            requestBody: {
              role: "writer",
              type: "user",
              emailAddress: email.trim()
            },
            sendNotificationEmail: false
          })
          .catch((error) => {
            logger.warn("Failed to share spreadsheet", { email, error: error.message });
          })
      )
    );
  }

  return { spreadsheetId, spreadsheetUrl, sheetName };
}

export async function ensureHeaderRow(sheetId, sheetName = DEFAULT_TAB) {
  const sheets = await getSheets();
  let current = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: formatRange(sheetName, "1:1")
    });
    current = res.data.values?.[0] || [];
  } catch (error) {
    if (error?.response?.status === 400) {
      await addSheet(sheetId, sheetName);
    } else {
      throw error;
    }
  }

  if (!current.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: formatRange(sheetName, "A1"),
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADER]
      }
    });
    logger.info("Header row initialized", { sheetId, sheetName });
  }
}

export async function fetchExistingLeadIds(sheetId, sheetName = DEFAULT_TAB) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: formatRange(sheetName, "B2:B")
  });
  const values = res.data.values || [];
  return new Set(values.map((row) => row[0]).filter(Boolean));
}

export async function appendLeadRows(rows, {
  sheetId,
  sheetName = DEFAULT_TAB,
  dryRun = config.dryRun
} = {}) {
  if (!rows.length) return;
  if (!sheetId) {
    throw new Error("appendLeadRows requires a sheetId");
  }
  if (dryRun) {
    logger.info("Dry run enabled; skipping Sheets append", { count: rows.length });
    return;
  }
  await ensureHeaderRow(sheetId, sheetName);
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: formatRange(sheetName, "A:A"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows.map((row) => toRowValues(row))
    }
  });
  logger.info("Rows appended to Google Sheets", { count: rows.length, sheetName, sheetId });
}
