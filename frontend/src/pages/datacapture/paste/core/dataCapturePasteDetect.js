import {
  isReturnFormulaLikeCell,
  parseApiReturnFormat,
  parseApiReturnTableFormat,
} from "./dataCaptureApiReturnParsers.js";
import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "../vendors/dataCaptureCitibetParsers.js";

/** Citibet reports are tab-separated with Upline/Downline section headers. */
export function pastedPlainTextLooksCitibetReport(pastedData) {
  if (!pastedData || typeof pastedData !== "string" || !pastedData.includes("\t")) return false;
  const lower = pastedData.toLowerCase();
  return (
    lower.includes("upline payment") ||
    lower.includes("downline payment") ||
    lower.includes("upline payment report") ||
    lower.includes("downline payment report")
  );
}

function readClipboardHtml(clipboard) {
  try {
    return clipboard?.getData?.("text/html") || "";
  } catch {
    return "";
  }
}

/** Excel / rich HTML paste with visible cell styling (not plain TSV). */
export function pastedHtmlLooksFormatted(html) {
  if (!html || typeof html !== "string" || !/<table\b/i.test(html)) return false;

  if (/mso-|x:str|xmlns:o=|xmlns:x=|ProgId\s*=\s*["']?Excel/i.test(html)) {
    return true;
  }

  if (
    /background(?:-color)?\s*:\s*(?!transparent\b|#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i.test(
      html,
    )
  ) {
    return true;
  }

  if (/bgcolor\s*=\s*["']?(?!#fff(?:fff)?\b|white\b)/i.test(html)) {
    return true;
  }

  if (/font-weight\s*:\s*(?:bold|[67]00)/i.test(html)) {
    return true;
  }

  if (/<(?:td|th)[^>]+style\s*=\s*["'][^"']*(?:background|color|font)/i.test(html)) {
    return true;
  }

  return false;
}

/** RETURN rows contain formula-like description cells (colon + numbers / operators). */
export function pastedPlainTextLooksReturn(pastedData) {
  if (!pastedData || typeof pastedData !== "string") return false;

  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (!lines.length) return false;

  if (lines.length === 1) {
    if (parseApiReturnTableFormat(pastedData)) return true;
    if (parseApiReturnFormat(lines[0])) return true;
  }

  const hasTabSeparator = lines.some((line) => line.includes("\t"));
  let formulaCells = 0;
  let dataCells = 0;

  for (const line of lines) {
    const cells = hasTabSeparator
      ? line.split("\t").map((cell) => cell.trim())
      : [line];

    for (const cell of cells) {
      if (!cell) continue;
      dataCells += 1;
      if (isReturnFormulaLikeCell(cell)) formulaCells += 1;
    }
  }

  return formulaCells > 0 && dataCells >= 3;
}

/**
 * Resolve capture type from clipboard content.
 * Priority: CITIBET → RETURN → FORMAT → TEXT.
 */
export function autoDetectCaptureTypeFromPaste(pastedData, clipboard = null) {
  if (!pastedData || typeof pastedData !== "string") return "1.Text";

  if (parseCitibetMajorPaymentReport(pastedData)) return "CITIBET";
  if (pastedPlainTextLooksCitibetReport(pastedData) && parseCitibetPaymentReport(pastedData)) {
    return "CITIBET";
  }

  if (pastedPlainTextLooksReturn(pastedData)) return "4.RETURN";

  const html = readClipboardHtml(clipboard);
  if (pastedHtmlLooksFormatted(html)) return "2.Format";

  return "1.Text";
}

export function parseCitibetPasteData(pastedData, captureType) {
  const isCitibetMode = captureType === "CITIBET";
  let usedMajorParser = false;

  if (isCitibetMode) {
    const majorParsed = parseCitibetMajorPaymentReport(pastedData);
    usedMajorParser = Boolean(majorParsed);
    let parsed = majorParsed || parseCitibetPaymentReport(pastedData);
    if (!parsed && pastedPlainTextLooksCitibetReport(pastedData)) {
      parsed = parseCitibetFormatBasedPaste(pastedData);
    }
    return parsed ? { ...parsed, usedMajorParser } : null;
  }

  const parsed = parseCitibetPaymentReport(pastedData);
  return parsed ? { ...parsed, usedMajorParser: false } : null;
}

export function shouldExitCitibetMode(pastedData, captureType) {
  if (captureType !== "CITIBET") return false;
  const stillCitibet =
    parseCitibetMajorPaymentReport(pastedData) ||
    parseCitibetPaymentReport(pastedData) ||
    (pastedPlainTextLooksCitibetReport(pastedData) && parseCitibetFormatBasedPaste(pastedData));
  return !stillCitibet;
}
