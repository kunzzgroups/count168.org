/**
 * Shared 1.TEXT / 2.FORMAT helper: pick the better report matrix from
 * clipboard plain vs normalized HTML so both modes paste the same shape.
 *
 * - agent_period: plain vertical-dump often wins (HTML collapses to col1)
 * - C8/Kendo Win Loss: HTML keeps Name/AGENT cells + footer empties (plain merges "87 AGENT")
 */

import {
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  buildFormatBodyMatrix,
  parseFormatHtmlTableStructure,
} from "./dataCaptureFormatHtmlMatrix.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import { sanitizePasteMatrix } from "./dataCapturePasteMatrixSanitize.js";

function cellText(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "");
  }
  return String(cell ?? "");
}

function toPlainStringMatrix(bodyMatrix) {
  if (!Array.isArray(bodyMatrix) || !bodyMatrix.length) return null;
  return bodyMatrix.map((row) => (row || []).map((cell) => cellText(cell)));
}

function matrixShape(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return { rows: 0, cols: 0 };
  const cols = Math.max(...matrix.map((row) => (Array.isArray(row) ? row.length : 0)), 0);
  return { rows: matrix.length, cols };
}

function isMoneyLike(text) {
  const raw = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!raw) return false;
  if (/^\$/.test(raw)) return true;
  const normalized = raw.replace(/[,$]/g, "").replace(/^\((.*)\)$/, "-$1");
  return /^-?\d+(?:\.\d+)?$/.test(normalized);
}

/** Col1 holds a whole vertical field dump (agent_period HTML failure). */
export function matrixLooksCol1Stacked(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return false;
  const nonEmptyCols = (row) =>
    (row || []).filter((cell) => cellText(cell).trim()).length;
  const maxFilled = Math.max(...matrix.map(nonEmptyCols), 0);
  const stackedRows = matrix.filter((row) => {
    const text = cellText(row?.[0])
      .replace(/\u00a0/g, " ")
      .trim();
    const lineHits = text.split(/\r?\n/).filter((line) => line.trim()).length;
    const moneyHits = (text.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
    return lineHits >= 3 || moneyHits >= 3;
  }).length;
  return stackedRows >= 1 && maxFilled <= 2;
}

function matrixHasMergedNameUserType(matrix) {
  return (matrix || []).some((row) =>
    (row || []).some((cell) => /^\d+\s+(AGENT|MEMBER)$/i.test(cellText(cell).trim())),
  );
}

function matrixHasAlignedMoneyFooter(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return false;
  const last = matrix[matrix.length - 1] || [];
  let first = -1;
  for (let i = 0; i < last.length; i += 1) {
    if (cellText(last[i]).trim()) {
      first = i;
      break;
    }
  }
  if (first < 0) return false;
  const token = cellText(last[first]).trim();
  // Empty id/name then money, or Subtotal label not in col0 money.
  if (first >= 2 && isMoneyLike(token)) return true;
  if (first >= 1 && /sub\s*total|total\s*amount|grand\s*total/i.test(token)) return true;
  return false;
}

/**
 * Higher is better. Negative = unusable.
 * @param {string[][] | null} matrix
 */
export function scoreReportPasteMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return -1;
  if (matrixLooksCol1Stacked(matrix)) return -1;
  const { rows, cols } = matrixShape(matrix);
  if (rows < 1 || cols < 2) return -1;
  if (matrix.length > 1 && cols === 1) return -1;

  let score = rows * 100 + cols * 10;
  if (matrixHasAlignedMoneyFooter(matrix)) score += 50;
  if (matrixHasMergedNameUserType(matrix)) score -= 80;
  return score;
}

function matrixFromClipboardHtml(html) {
  if (!html) return null;
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  if (!/<table\b/i.test(normalized)) return null;
  try {
    const structure = parseFormatHtmlTableStructure(normalized);
    if (!structure?.dataRows?.length) return null;
    const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
    const plain = toPlainStringMatrix(body);
    return sanitizePasteMatrix(plain);
  } catch {
    return null;
  }
}

/**
 * @param {string} html
 * @param {string} text
 * @returns {{ matrix: string[][], source: "html" | "plain" } | null}
 */
export function selectPreferredReportPasteMatrix(html, text) {
  const plainMatrix = text?.trim() ? parsePlainTextMatrix(text) : null;
  const htmlMatrix = matrixFromClipboardHtml(html);

  const plainScore = scoreReportPasteMatrix(plainMatrix);
  const htmlScore = scoreReportPasteMatrix(htmlMatrix);

  if (htmlScore < 0 && plainScore < 0) return null;

  // Prefer the higher score; ties → HTML (keeps empty footer pads / separate AGENT).
  if (htmlScore >= plainScore && htmlScore >= 0) {
    return { matrix: htmlMatrix, source: "html" };
  }
  if (plainScore >= 0) {
    return { matrix: plainMatrix, source: "plain" };
  }
  return { matrix: htmlMatrix, source: "html" };
}
