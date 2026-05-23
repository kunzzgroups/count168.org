/** Read clipboard payloads from a paste event; HTML table detect/parse helpers. */

export function resolvePasteCell(target) {
  if (!target) return null;
  return target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
}

export function isTypingModeCell(cell) {
  return Boolean(cell && document.activeElement === cell);
}

export function getClipboardPlainText(e) {
  const clipboard = e.clipboardData || window.clipboardData;
  const getData = (type) => {
    try {
      if (!clipboard || typeof clipboard.getData !== "function") return "";
      return clipboard.getData(type) || "";
    } catch {
      return "";
    }
  };
  return getData("text/plain") || getData("text") || getData("Text") || "";
}

export function getClipboardHtml(e) {
  try {
    return e.clipboardData?.getData("text/html") || "";
  } catch {
    return "";
  }
}

export function detectHtmlTableInClipboard(e) {
  try {
    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard?.getData) return null;

    const htmlData = clipboard.getData("text/html");
    if (htmlData && /<table\b/i.test(htmlData)) {
      return htmlData;
    }

    const textData = clipboard.getData("text/plain");
    if (textData && /<table\b/i.test(textData)) {
      return textData;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function sanitizePastedCellHtml(cellContent) {
  if (!cellContent) return "";
  return cellContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}

/** Reorder columns when No./User appear at the end (common Excel copy quirk). */
export function detectColumnReorder(allRows) {
  const numCols = countRowCols(allRows[0]);
  if (numCols < 3) return null;

  for (let hi = 0; hi < Math.min(3, allRows.length); hi += 1) {
    const headerCells = allRows[hi].querySelectorAll("td, th");
    const headerTexts = Array.from(headerCells).map((c) => (c.textContent || "").trim());
    const noIdx = headerTexts.findIndex((t) => /^no\.?$/i.test(t));
    const userIdx = headerTexts.findIndex((t) => /^user$/i.test(t));
    if (noIdx >= 0 && userIdx >= 0 && (noIdx !== 0 || userIdx !== 1)) {
      const otherIndices = headerTexts.map((_, i) => i).filter((i) => i !== noIdx && i !== userIdx);
      return [noIdx, userIdx, ...otherIndices];
    }
    if (noIdx >= 0 && userIdx >= 0) break;
  }

  const looksLikeRowNo = (s) => {
    const t = (s || "").trim();
    return /^\d+$/.test(t) && t.length <= 6;
  };
  const looksLikeUserId = (s) => {
    const t = (s || "").trim();
    return t.length >= 2 && /^[a-zA-Z0-9_]+$/.test(t) && /[a-zA-Z]/.test(t) && /\d/.test(t);
  };

  let matchCount = 0;
  const checkRows = Math.min(5, allRows.length);
  for (let ri = 0; ri < checkRows; ri += 1) {
    const cells = allRows[ri].querySelectorAll("td, th");
    const n = cells.length;
    if (n < 3) continue;
    const secondLast = (cells[n - 2].textContent || "").trim();
    const last = (cells[n - 1].textContent || "").trim();
    if (looksLikeRowNo(secondLast) && looksLikeUserId(last)) matchCount += 1;
  }

  if (matchCount >= 2) {
    const n = allRows[0].querySelectorAll("td, th").length;
    return [n - 2, n - 1, ...Array.from({ length: n - 2 }, (_, i) => i)];
  }

  return null;
}

function countRowCols(row) {
  if (!row) return 0;
  const cells = row.querySelectorAll("td, th");
  let c = 0;
  cells.forEach((cell) => {
    c += Number.parseInt(cell.getAttribute("colspan") || "1", 10);
  });
  return c;
}

export function measureHtmlTable(table) {
  const allRows = table.querySelectorAll("tr");
  if (!allRows.length) return null;

  let maxCols = 0;
  allRows.forEach((tr) => {
    maxCols = Math.max(maxCols, countRowCols(tr));
  });

  if (maxCols === 0) return null;
  return { allRows: Array.from(allRows), maxCols };
}

/** Flatten an HTML table to tab-separated plain text (for structured paste parsers). */
export function htmlTableToTabPlainText(html) {
  if (!html || typeof html !== "string" || !/<table\b/i.test(html)) return "";

  const temp = document.createElement("div");
  temp.innerHTML = html;
  const table = temp.querySelector("table");
  if (!table) return "";

  const lines = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td, th");
    if (!cells.length) return;
    lines.push(Array.from(cells).map((cell) => (cell.textContent || "").trim()).join("\t"));
  });

  return lines.join("\n");
}

/**
 * Prefer plain text; when CITIBET only parses from HTML table rows, use that TSV instead.
 */
export function resolvePastePlainTextForStructuredParsers(e, canParse) {
  const plain = getClipboardPlainText(e);
  if (plain && canParse(plain)) return plain;

  const html = getClipboardHtml(e);
  if (html) {
    const fromHtml = htmlTableToTabPlainText(html);
    if (fromHtml && canParse(fromHtml)) return fromHtml;
  }

  return plain;
}
