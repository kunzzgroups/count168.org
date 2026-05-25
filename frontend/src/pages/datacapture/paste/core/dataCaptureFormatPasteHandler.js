import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  renderFormatPreview,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import { getFormatGridReady, setFormatPreviewHtml } from "../../format/dataCaptureFormat.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  captureTableDataFromDom,
  domGridHasEditableData,
} from "../../lib/dataCaptureTableSnapshot.js";
import { resolvePasteAnchor } from "./dataCapturePasteApply.js";

function getCaptureType() {
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") {
    return window.__DC_GET_CAPTURE_TYPE__() || "1.Text";
  }
  return "1.Text";
}

function isFormatMode() {
  return getCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function placeCaretAtEnd(el) {
  try {
    el.focus();
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    /* ignore */
  }
}

function markFormatGridReady(ready) {
  window.__DC_SET_FORMAT_GRID_READY__?.(ready);
}

function gridHasFormatData() {
  if (typeof window.__DC_GET_FORMAT_GRID_READY__ === "function" && window.__DC_GET_FORMAT_GRID_READY__()) {
    return true;
  }
  return getFormatGridReady() || domGridHasEditableData();
}

/** First empty row after the last row that contains pasted data. */
export function findFormatAppendStartRow() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return 0;

  let lastDataRow = -1;
  for (let i = 0; i < tableBody.children.length; i += 1) {
    const row = tableBody.children[i];
    const hasData = Array.from(row.querySelectorAll('td[contenteditable="true"]')).some((cell) =>
      String(cell.textContent || "").trim()
    );
    if (hasData) lastDataRow = i;
  }

  return lastDataRow + 1;
}

/** Row index reserved by Shift+Enter for the next table paste. */
let formatPendingPasteStartRow = null;

export function clearFormatPendingPasteStartRow() {
  formatPendingPasteStartRow = null;
}

function resolveNextFormatPasteRow(fromCell) {
  if (fromCell?.contentEditable === "true") {
    const row = fromCell.parentNode;
    const table = row?.parentNode;
    if (table) {
      const currentRowIndex = Array.from(table.children).indexOf(row);
      if (currentRowIndex >= 0) return currentRowIndex + 1;
    }
  }
  return findFormatAppendStartRow();
}

/** Shift+Enter: mark next row and focus paste area so user can paste more table data. */
export function prepareFormatNextRowPaste(fromCell = null) {
  if (!isFormatMode()) return false;

  let nextRow = resolveNextFormatPasteRow(fromCell);
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return false;

  while (nextRow >= tableBody.children.length && tableBody.children.length < 702) {
    const added = window.__DC_ADD_NEW_ROW__?.();
    if (added == null) break;
    nextRow = added;
  }

  if (nextRow >= tableBody.children.length) return false;

  formatPendingPasteStartRow = nextRow;

  const targetRow = tableBody.children[nextRow];
  const targetCell = targetRow?.children[1];
  if (targetCell?.contentEditable === "true") {
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__?.(targetCell);
  }

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  if (pasteAreaFormat) {
    pasteAreaFormat.innerHTML = "";
    pasteAreaFormat.style.display = "block";
    setTimeout(() => pasteAreaFormat.focus(), 0);
  }

  window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  return true;
}

export function resolveFormatPasteStartRow(anchorCell) {
  if (formatPendingPasteStartRow != null) {
    return formatPendingPasteStartRow;
  }
  if (anchorCell) {
    const { startRow } = resolvePasteAnchor(anchorCell);
    return startRow >= 0 ? startRow : 0;
  }
  if (gridHasFormatData()) {
    return findFormatAppendStartRow();
  }
  return 0;
}

function syncFormatPreviewFromGrid() {
  const snapshot = captureTableDataFromDom("2.Format");
  const mergedHtml = buildFormatPreviewHtmlFromTableSnapshot(snapshot);
  if (!mergedHtml) return;
  renderFormatPreview(mergedHtml);
  setFormatPreviewHtml(mergedHtml);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  markFormatGridReady(true);
  if (area) area.innerHTML = "";
  window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
  return true;
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, anchorCell = null, startRow = null } = {}) {
  if (!html) return false;
  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(html);
  const sanitized = sanitizePastedHTML(html);
  if (!previewFragment && !sanitized) return false;

  const resolvedStartRow = startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell);
  const filled = parseAndFillHtmlTableForFormat(sanitized || previewFragment, {
    startRow: resolvedStartRow,
  });

  if (filled) {
    clearFormatPendingPasteStartRow();
    syncFormatPreviewFromGrid();
  } else if (resolvedStartRow === 0) {
    renderFormatPreview(previewFragment || sanitized);
  }

  return afterFormatPasteFilled(filled, area);
}

export function processFormatTsv(text, { area = null, anchorCell = null, startRow = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, { area, anchorCell, startRow });
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

  if (html && /<table\b/i.test(html)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area });
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, { area });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area });
    return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      if (pastedHTML && /<table\b/i.test(pastedHTML)) {
        processFormatTableHtml(pastedHTML, { area });
      }
    } catch {
      /* ignore */
    }
  }, 0);
}

function shouldSkipGlobalFormatPaste(target) {
  if (!target) return true;
  if (target.closest?.("#dataTable")) return false;
  if (target.closest?.("#pasteAreaFormat")) return false;
  return isEditableFormField(target);
}

/**
 * Global bubble-phase intercept: route table paste to format pipeline
 * instead of letting <table> land elsewhere on the page.
 */
export function handleGlobalFormatPaste(e) {
  if (!isFormatMode()) return;
  if (shouldSkipGlobalFormatPaste(e.target)) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  e.preventDefault();
  e.stopPropagation();

  const gridCell = e.target?.closest?.("#dataTable td[contenteditable='true']");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const { html, text } = readClipboard(clipboard);
  const appendMode = gridHasFormatData();
  const pasteOptions = {
    area: e.target?.closest?.("#pasteAreaFormat") ? pasteAreaFormat : null,
    anchorCell: gridCell || null,
  };

  if (appendMode) {
    if (html && /<table\b/i.test(html)) {
      processFormatTableHtml(html, pasteOptions);
      return;
    }
    if (text && text.includes("\t")) {
      processFormatTsv(text, pasteOptions);
    }
    return;
  }

  const dataTable = document.getElementById("dataTable");
  if (dataTable) dataTable.style.display = "none";
  if (pasteAreaFormat) {
    pasteAreaFormat.style.display = "block";
    placeCaretAtEnd(pasteAreaFormat);
  }

  if (html && /<table\b/i.test(html)) {
    processFormatTableHtml(html, { area: pasteAreaFormat });
    return;
  }

  if (text && text.includes("\t")) {
    processFormatTsv(text, { area: pasteAreaFormat });
  }
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlToUse = html && /<table\b/i.test(html) ? html : fallbackHTML || "";

  if (htmlToUse && /<table\b/i.test(htmlToUse)) {
    setTimeout(() => processFormatTableHtml(htmlToUse, options), 10);
    return true;
  }

  if (text && text.includes("\t")) {
    setTimeout(() => processFormatTsv(text, options), 10);
    return true;
  }

  return false;
}

/**
 * Phase 4e: 2.Format grid cell paste — route table HTML/TSV through format pipeline
 * instead of the full legacy paste body.
 */
export function handleFormatCellPaste(e, pastedData, anchorCell) {
  const options = { anchorCell };

  const clipboard = e.clipboardData || window.clipboardData;
  if (clipboard && handleFormatPasteFromClipboard(clipboard, null, options)) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  if (html && /<table\b/i.test(html)) {
    return processFormatTableHtml(html, options);
  }

  if (pastedData && pastedData.includes("\t")) {
    return processFormatTsv(pastedData, options);
  }

  return false;
}
