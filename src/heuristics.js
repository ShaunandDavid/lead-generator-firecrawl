const urlKeywords = new Map([
  ["contact", 6],
  ["about", 4],
  ["team", 4],
  ["leadership", 4],
  ["pricing", 3],
  ["services", 3],
  ["solutions", 3],
  ["careers", 2],
  ["join", 2],
  ["jobs", 2],
  ["hire", 2],
  ["press", 1],
  ["privacy", 1],
  ["terms", 1]
]);

const contentPatterns = [
  { pattern: /mailto:/gi, score: 6 },
  { pattern: /phone|call us|reach us|contact us/gi, score: 3 },
  { pattern: /@/g, score: 2 },
  { pattern: /linkedin\.com\//gi, score: 3 },
  { pattern: /address|hq|headquarters|located in/gi, score: 2 }
];

const metadataSignals = [
  { key: "title", weight: 1 },
  { key: "description", weight: 1 }
];

export function scoreDocument(doc) {
  let score = 0;
  const url = doc.url || "";
  const markdown = doc.markdown || "";
  const metadata = doc.metadata || {};

  for (const [keyword, weight] of urlKeywords) {
    if (url.toLowerCase().includes(keyword)) {
      score += weight;
    }
  }

  for (const { pattern, score: weight } of contentPatterns) {
    if (pattern.test(markdown)) {
      score += weight;
    }
  }

  metadataSignals.forEach(({ key, weight }) => {
    if (metadata?.[key]) {
      score += weight;
    }
  });

  if (markdown.length > 2000) {
    score += 2;
  }
  if ((doc.links?.length || 0) > 10) {
    score += 1;
  }
  return score;
}

export function prioritizeDocuments(documents, maxPages = 12) {
  const scored = documents
    .map((doc) => ({ doc, score: scoreDocument(doc) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxPages).map((item) => item.doc);
}
