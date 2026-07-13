import { handleTextPlainPaste, parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import { tryApplyBillingStatementPlainMatrix } from "./dataCaptureStatementMatrixPaste.js";
import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import { parseAndFillHtmlTableForTextWithFormat } from "./dataCaptureTextHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  plainMatrixToHtmlTable,
  renderFormatPreview,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  getDefaultPasteAnchorCell,
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
  resolvePasteAnchor,
} from "./dataCapturePasteApply.js";
import { domGridHasEditableData } from "../../lib/dataCaptureTableSnapshot.js";
import { isGridPasteBlockedTarget } from "./dataCaptureClipboard.js";
import { showFormatEditableGrid, syncFormatPreviewFromDom } from "../../format/dataCaptureFormat.js";
import { resolvePasteCell } from "./dataCaptureClipboard.js";
import {
  getActiveCaptureType,
  recomputeSubmitStateAfterPaste,
  setFormatGridReady,
  toggleFormatDisplay,
} from "../../lib/dataCaptureBridge.js";

function isFormatMode() {
  return getActiveCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  return isGridPasteBlockedTarget(el);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  // Format chrome (preview / paste area) only belongs to 2.Format.
  // 1.Text reuses the same Excel-like fill pipeline into the editable grid.
  if (isFormatMode()) {
    setFormatGridReady(true);
    syncFormatPreviewFromDom();
    if (area) area.innerHTML = "";
    showFormatEditableGrid();
    toggleFormatDisplay();
  }
  recomputeSubmitStateAfterPaste();
  return true;
}

/** Call after a Citibet-style plain matrix paste in 2.Format mode. */
export function markFormatGridReadyAfterPlainMatrixPaste() {
  return afterFormatPasteFilled(true, null);
}

function resolveFormatFallbackAnchorCell(startRow = 0, anchorCell = null) {
  if (anchorCell?.closest?.("#dataTable")) return anchorCell;
  const tableBody = document.getElementById("tableBody");
  const targetRow = Math.max(0, Number(startRow) || 0);
  const rowEl = tableBody?.children?.[targetRow];
  const cell = rowEl?.querySelector?.('td[contenteditable="true"]');
  return cell || getDefaultPasteAnchorCell();
}

function processFormatPlainTextFallback(
  text,
  { area = null, startRow = null, anchorCell = null } = {},
) {
  if (!text || !String(text).trim()) return false;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());
  const resolvedAnchor = resolveFormatFallbackAnchorCell(resolvedStartRow, anchorCell);
  if (!resolvedAnchor) return false;

  // Fusion 1.Text: Material plain-newline → matrix → Format table pipeline (preview + grid).
  const matrix = parsePlainTextMatrix(String(text));
  if (matrix.length > 0 && (matrix[0]?.length ?? 0) >= 2) {
    const tableHtml = plainMatrixToHtmlTable(matrix);
    if (processFormatTableHtml(tableHtml, { area, startRow, anchorCell })) return true;
  }

  const filled = handleTextPlainPaste(null, text, resolvedAnchor);
  return afterFormatPasteFilled(filled, area);
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!html) return false;
  const normalizedHtml = normalizeClipboardHtmlToTable(html) || html;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());
  const resolvedAnchor = resolveFormatFallbackAnchorCell(resolvedStartRow, anchorCell);

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(normalizedHtml);
  const sanitized = sanitizePastedHTML(normalizedHtml);

  if (previewFragment) {
    renderFormatPreview(previewFragment);
  } else if (sanitized && /<table\b/i.test(sanitized)) {
    renderFormatPreview(sanitized);
  }

  // Prefer the normalized multi-column table first. Preview/sanitized fragments can
  // still carry 1-TD-per-row Material wrappers and "succeed" with a collapsed grid.
  const candidates = [normalizedHtml, sanitized, previewFragment].filter(Boolean);
  if (!candidates.length) return false;

  for (const candidate of candidates) {
    const filled = parseAndFillHtmlTableForFormat(candidate, {
      startRow: resolvedStartRow,
    });
    if (afterFormatPasteFilled(filled, area)) return true;
  }

  // Compatibility fallback: some sites copy table-like HTML wrappers that
  // 2.Format structure parser cannot classify. Reuse 1.Text format-preserving
  // parser to keep values/styles and still unlock 2.Format submit flow.
  for (const candidate of candidates) {
    const filledByTextParser = parseAndFillHtmlTableForTextWithFormat(candidate, resolvedAnchor);
    if (afterFormatPasteFilled(filledByTextParser, area)) return true;
  }

  return false;
}

export function processFormatTsv(text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, { area, startRow, anchorCell });
}

function readClipboard(clipboard) {
  const getData = (type) => {
    try {
      return clipboard?.getData?.(type) || "";
    } catch {
      return "";
    }
  };
  return {
    html: getData("text/html"),
    text: getData("text/plain"),
  };
}

/** Paste handler for #pasteAreaFormat (direct paste into format area). */
export function handleFormatPasteAreaEvent(e) {
  if (!isFormatMode()) return;

  const clipboard = e.clipboardData || window.clipboardData;
  const { html, text } = readClipboard(clipboard);
  const area = document.getElementById("pasteAreaFormat");
  const anchorCell = getFormatPasteAnchorCell() || getDefaultPasteAnchorCell();

  const hasExistingData = domGridHasEditableData();
  const startRow = hasExistingData ? resolveFormatPasteStartRow(anchorCell) : 0;

  // Citibet-style plain matrix first (billing statements).
  if (
    text &&
    tryApplyBillingStatementPlainMatrix(text, anchorCell, {
      startRowOverride: startRow,
      startColOverride: 0,
    })
  ) {
    e.preventDefault();
    e.stopPropagation();
    afterFormatPasteFilled(true, area);
    return;
  }

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area, startRow, anchorCell });
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, { area, startRow, anchorCell });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area, startRow, anchorCell });
    return;
  }

  if (text && text.trim()) {
    e.preventDefault();
    e.stopPropagation();
    if (processFormatPlainTextFallback(text, { area, startRow, anchorCell })) return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      if (pastedHTML && (/<table\b/i.test(pastedHTML) || clipboardHtmlLooksLikeGrid(pastedHTML))) {
        const appendStartRow = domGridHasEditableData()
          ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
          : 0;
        processFormatTableHtml(pastedHTML, { area, startRow: appendStartRow });
      }
    } catch {
      /* ignore */
    }
  }, 0);
}

/**
 * Global bubble-phase intercept: route table paste to format pipeline
 * instead of letting <table> land elsewhere on the page.
 */
export function handleGlobalFormatPaste(e) {
  if (!isFormatMode()) return;
  if (isEditableFormField(e.target)) return;
  if (e.target?.closest?.("#dataTable")) return;
  if (e.defaultPrevented) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  const hasExistingData = domGridHasEditableData();
  const anchorCell = getFormatPasteAnchorCell() || getDefaultPasteAnchorCell();
  const appendMode = hasExistingData;
  const startRow = appendMode ? resolveFormatPasteStartRow(anchorCell) : 0;

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");

  const { html, text } = readClipboard(clipboard);

  if (
    text &&
    tryApplyBillingStatementPlainMatrix(text, anchorCell, {
      startRowOverride: startRow,
      startColOverride: 0,
    })
  ) {
    e.preventDefault();
    e.stopPropagation();
    afterFormatPasteFilled(true, pasteAreaFormat);
    return;
  }

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.trim()) {
    e.preventDefault();
    e.stopPropagation();
    processFormatPlainTextFallback(text, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!clipboard) return false;
  if (!options.allowOutsideFormatMode && !isFormatMode()) return false;

  const { html, text } = readClipboard(clipboard);

  // Citibet-style plain matrix before HTML format fill (billing statements).
  if (
    text &&
    tryApplyBillingStatementPlainMatrix(text, options.anchorCell || getDefaultPasteAnchorCell(), {
      startRowOverride: options.startRow,
      startColOverride: 0,
    })
  ) {
    return afterFormatPasteFilled(true, options.area ?? null);
  }

  const htmlCandidate = html || fallbackHTML || "";
  const htmlToUse =
    htmlCandidate && (/<table\b/i.test(htmlCandidate) || clipboardHtmlLooksLikeGrid(htmlCandidate))
      ? htmlCandidate
      : "";

  if (htmlToUse) {
    return processFormatTableHtml(htmlToUse, options);
  }

  if (text && text.includes("\t")) {
    return processFormatTsv(text, options);
  }

  if (text && text.trim()) {
    return processFormatPlainTextFallback(text, options);
  }

  return false;
}

/**
 * Excel-like format paste into the editable grid.
 * Used by 2.Format and by 1.Text (allowOutsideFormatMode) so both share one pipeline.
 */
export function handleFormatCellPaste(e, pastedData, options = {}) {
  const allowOutsideFormatMode = Boolean(options.allowOutsideFormatMode);
  const anchorCell =
    resolvePasteCell(e?.target) ||
    (allowOutsideFormatMode ? getDefaultPasteAnchorCell() : null) ||
    getFormatPasteAnchorCell();

  // 2.Format appends after existing rows; 1.Text pastes from the active cell like Excel.
  const startRow = allowOutsideFormatMode
    ? resolvePasteAnchor(anchorCell).startRow
    : resolveFormatPasteStartRow(anchorCell);

  const clipboard = e?.clipboardData || window.clipboardData;
  if (
    clipboard &&
    handleFormatPasteFromClipboard(clipboard, null, {
      startRow,
      anchorCell,
      allowOutsideFormatMode,
    })
  ) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    return processFormatTableHtml(html, { startRow, anchorCell });
  }

  if (pastedData && pastedData.includes("\t")) {
    return processFormatTsv(pastedData, { startRow, anchorCell });
  }

  if (pastedData && pastedData.trim()) {
    return processFormatPlainTextFallback(pastedData, { startRow, anchorCell });
  }

  return false;
}
