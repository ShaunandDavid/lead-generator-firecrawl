import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

function walkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(fullPath));
    } else if (/\.(html?|md)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function loadDocumentsFromFolder(folderPath) {
  const absolute = path.resolve(folderPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Folder not found: ${absolute}`);
  }
  const files = walkDirectory(absolute);
  return files.map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    if (/\.md$/i.test(filePath)) {
      return {
        url: `file://${filePath}`,
        markdown: raw,
        html: null,
        metadata: { title: path.basename(filePath) }
      };
    }
    const dom = new JSDOM(raw);
    const text = dom.window.document.body?.textContent || "";
    const title = dom.window.document.title || path.basename(filePath);
    return {
      url: `file://${filePath}`,
      markdown: text,
      html: raw,
      metadata: { title }
    };
  });
}
