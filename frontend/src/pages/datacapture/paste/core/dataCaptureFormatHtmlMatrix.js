/** 2.Format HTML table → body matrix (PR6 batch 1). */

import {
  sanitizeFormatHtmlFragment,
  sanitizeCopiedStyleString,
} from "./dataCaptureFormatStyleUtils.js";
import {
  expandCollapsedTableRows,
  tableLooksHorizontallyCollapsed,
  tokenizeCollapsedReportRow,
} from "./dataCaptureFormatClipboardNormalize.js";

/** @returns {{ headerRows: Element[], dataRows: Element[], maxCols: number, allRows: Element[], table: Element } | null} */
export function parseFormatHtmlTableStructure(htmlString) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlString;

  const table = tempDiv.querySelector("table");
  if (!table) return null;

  // Chrome / Material clipboards often wrap a whole flex row inside one <td>.
  // Expand those into real columns before header/body classification.
  expandCollapsedTableRows(table);

  const allRows = Array.from(table.querySelectorAll("tr"));
  if (allRows.length === 0) return null;

  const headerRows = [];
  const dataRows = [];

  allRows.forEach((tr) => {
    // Match PHP: only <thead> rows, or rows that are entirely <th> (no <td>).
    // Rows that start with <th scope="row"> but include <td> are data rows (e.g. DEMOS).
    const inThead = !!tr.closest("thead");
    const thCount = tr.querySelectorAll("th").length;
    const tdCount = tr.querySelectorAll("td").length;
    const isHeaderRow = inThead || (thCount > 0 && tdCount === 0);
    if (isHeaderRow) {
      headerRows.push(tr);
    } else {
      dataRows.push(tr);
    }
  });

  let maxCols = 0;
  allRows.forEach((tr) => {
    // Use direct cell count. Do NOT trust colspan alone — Material clipboards
    // often set colspan=N on a single TD that still holds every column value.
    const cells = Array.from(tr.children || []).filter((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    if (cells.length <= 1) {
      maxCols = Math.max(maxCols, cells.length);
      return;
    }
    let colCount = 0;
    cells.forEach((cell) => {
      colCount += parseInt(cell.getAttribute("colspan") || "1", 10);
    });
    maxCols = Math.max(maxCols, colCount);
  });

  if (maxCols === 0) return null;

  return { headerRows, dataRows, maxCols, allRows, table };
}

function extractCellLines(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();

  const hasBrTag =
    /<br\s*\/?>/i.test(cellHtml) ||
    /<br\s+[^>]*>/i.test(cellHtml) ||
    /<br\s+style[^>]*>/i.test(cellHtml);
  const hasNewline =
    cellText.includes("\n") || cellText.includes("\r\n") || cellText.includes("\r");

  let lines = [];

  if (hasBrTag) {
    const htmlWithMarker = cellHtml
      .replace(/<br\s+[^>]*>/gi, "|||SPLIT_MARKER|||")
      .replace(/<br\s*\/?>/gi, "|||SPLIT_MARKER|||");
    const markerDiv = document.createElement("div");
    markerDiv.innerHTML = htmlWithMarker;
    const textWithMarker = markerDiv.textContent || markerDiv.innerText || "";
    lines = textWithMarker
      .split("|||SPLIT_MARKER|||")
      .map((part) => {
        const cleanDiv = document.createElement("div");
        cleanDiv.innerHTML = part;
        return (cleanDiv.textContent || cleanDiv.innerText || "").trim();
      })
      .filter((part) => part !== "");
  } else if (hasNewline) {
    lines = cellText.split(/\r?\n|\r/).map((part) => part.trim()).filter((part) => part !== "");
  } else {
    const directChildren = Array.from(sourceCell.childNodes || []);
    const directSpans = directChildren.filter(
      (node) => node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN",
    );
    const hasOnlySpanChildren = directChildren.every((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return !String(node.textContent || "").trim();
      }
      return node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN";
    });

    const spansAreBlockLike =
      directSpans.length >= 2 &&
      directSpans.every((span) => {
        const styleAttr = String(span.getAttribute("style") || "").toLowerCase();
        return /\bdisplay\s*:\s*(block|table|flex|grid|list-item)\b/.test(styleAttr);
      });

    // Avoid false positives: inline spans are often just styling wrappers, not vertical split rows.
    if (hasOnlySpanChildren && spansAreBlockLike) {
      const parts = directSpans
        .map((span) => (span.textContent || "").trim())
        .filter((part) => part !== "");
      if (parts.length >= 2) {
        lines = [parts[0], parts[1]];
      }
    }
  }

  return lines;
}

/** First-cell BR/SPAN check used for required row count pre-detection. */
function sourceRowNeedsVerticalSplit(sourceCells) {
  if (sourceCells.length === 0) return false;
  return extractCellLines(sourceCells[0]).length >= 2;
}

/** Count tbody rows after vertical splits (SUB TOTAL / GRAND TOTAL). */
export function countFormatRequiredBodyRows(dataRows) {
  let count = dataRows.length;
  dataRows.forEach((sourceRow) => {
    const sourceCells = sourceRow.querySelectorAll("td, th");
    if (sourceRowNeedsVerticalSplit(sourceCells)) {
      count += 1;
    }
  });
  return count;
}

function detectRowVerticalSplit(sourceCells) {
  let hasVerticalSplit = false;
  const cellsWithSplit = [];

  sourceCells.forEach((sourceCell, cellIndex) => {
    const lines = extractCellLines(sourceCell);
    if (lines.length >= 2) {
      hasVerticalSplit = true;
      cellsWithSplit.push({
        index: cellIndex,
        cell: sourceCell,
        topData: lines[0],
        bottomData: lines[1],
        allLines: lines,
      });
    }
  });

  const isFirstCellWithBrOrSpan = cellsWithSplit.some((entry) => entry.index === 0);
  return { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan };
}

function extractPlainText(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cellHtml;
  return (tempDiv.textContent || tempDiv.innerText || "").trim();
}

function parseStyleDeclarations(styleString) {
  const out = {};
  String(styleString || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value) return;
      out[prop] = value;
    });
  return out;
}

function isDefaultColor(value) {
  const v = String(value || "").trim().toLowerCase();
  return !v || v === "rgb(0, 0, 0)" || v === "#000" || v === "#000000" || v === "black" || v === "inherit" || v === "initial";
}

function isTransparentBg(value) {
  const v = String(value || "").trim().toLowerCase();
  return !v || v === "transparent" || v === "rgba(0, 0, 0, 0)" || v === "initial" || v === "inherit";
}

/** Harvest visible text styles from cell + nested spans (common in report HTML). */
function harvestVisualStyleMap(sourceCell) {
  const merged = {};
  const absorb = (styleMap) => {
    if (!styleMap) return;
    ["color", "background-color", "background", "font-weight", "font-style", "text-decoration", "text-align", "font-size"].forEach(
      (key) => {
        if (styleMap[key] == null || styleMap[key] === "") return;
        if (key === "color" && isDefaultColor(styleMap[key]) && merged.color) return;
        if ((key === "background-color" || key === "background") && isTransparentBg(styleMap[key])) return;
        merged[key] = styleMap[key];
      },
    );
  };

  absorb(parseStyleDeclarations(sourceCell.getAttribute("style") || ""));
  Array.from(sourceCell.querySelectorAll("*")).forEach((el) => {
    absorb(parseStyleDeclarations(el.getAttribute("style") || ""));
  });

  try {
    const computed = window.getComputedStyle(sourceCell);
    absorb({
      color: computed.color,
      "background-color": computed.backgroundColor,
      "font-weight": computed.fontWeight,
      "font-style": computed.fontStyle,
      "text-decoration": computed.textDecorationLine || computed.textDecoration,
      "text-align": computed.textAlign,
    });
  } catch {
    /* ignore detached/computed failures */
  }

  return merged;
}

function stripBorderDeclarations(styleString) {
  if (!styleString || !String(styleString).trim()) return "";
  return String(styleString)
    .replace(/\s*border(?:-(?:top|right|bottom|left|color|style|width|radius))?\s*:[^;]*;?/gi, "")
    .trim()
    .replace(/;\s*$/, "");
}

export function buildFormatDataCellStyle(sourceCell) {
  const visual = harvestVisualStyleMap(sourceCell);
  // Grid CSS already draws cell borders; do not put border on td/span (looks like a box around text).
  const sourceCellStyle = stripBorderDeclarations(
    sanitizeCopiedStyleString(sourceCell.getAttribute("style") || ""),
  );
  let styleString = "";

  if (sourceCellStyle) {
    styleString += ` ${sourceCellStyle}`;
  }

  if (visual.color && !isDefaultColor(visual.color) && !/\bcolor\s*:/i.test(styleString)) {
    styleString += ` color: ${visual.color} !important;`;
  }
  if (visual["background-color"] && !isTransparentBg(visual["background-color"]) && !/\bbackground(?:-color)?\s*:/i.test(styleString)) {
    styleString += ` background-color: ${visual["background-color"]} !important;`;
  }
  if (visual["font-weight"] && visual["font-weight"] !== "normal" && visual["font-weight"] !== "400" && !/\bfont-weight\s*:/i.test(styleString)) {
    styleString += ` font-weight: ${visual["font-weight"]} !important;`;
  }
  if (visual["font-style"] && visual["font-style"] !== "normal" && !/\bfont-style\s*:/i.test(styleString)) {
    styleString += ` font-style: ${visual["font-style"]} !important;`;
  }
  if (
    visual["text-decoration"] &&
    visual["text-decoration"] !== "none" &&
    !/\btext-decoration\s*:/i.test(styleString)
  ) {
    styleString += ` text-decoration: ${visual["text-decoration"]} !important;`;
  }
  if (visual["text-align"] && visual["text-align"] !== "left" && visual["text-align"] !== "start" && !/\btext-align\s*:/i.test(styleString)) {
    styleString += ` text-align: ${visual["text-align"]} !important;`;
  }

  return styleString;
}

/** @param {Element} sourceCell @param {string} [displayText] split override — plain text only */
export function buildFormatDataCellPatch(sourceCell, displayText) {
  const styleCssText = buildFormatDataCellStyle(sourceCell);

  if (displayText !== undefined) {
    const escaped = String(displayText)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return {
      value: displayText,
      html: `<span style="${styleCssText}">${escaped}</span>`,
      styleCssText,
    };
  }

  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }
  const cellText = sourceCell.textContent || sourceCell.innerText || "";

  const cleanContent = cellContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return {
      value: cellText,
      html: sanitizeFormatHtmlFragment(cleanContent),
      styleCssText,
    };
  }

  if (cellText && cellText.trim() !== "") {
    const escaped = String(cellText)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return {
      value: cellText,
      html: `<span style="${styleCssText}">${escaped}</span>`,
      styleCssText,
    };
  }

  return { value: "", styleCssText };
}

function emptyRowPatch(maxCols) {
  return Array.from({ length: maxCols }, () => ({ value: "" }));
}

function fillSourceRowPatches(targetRow, sourceCells, maxCols, lineSelector) {
  let currentCol = 0;

  sourceCells.forEach((sourceCell, cellIndex) => {
    // Material / Chrome clipboards often set colspan=N on a crushed cell.
    // For paste matrix layout we must treat each TD as one column.
    const colspan = 1;
    const splitInfo = lineSelector(cellIndex, sourceCell);

    if (currentCol < maxCols) {
      if (splitInfo) {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell, splitInfo);
      } else {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell);
      }
    }

    for (let spanIndex = 1; spanIndex < colspan; spanIndex += 1) {
      currentCol += 1;
      if (currentCol < maxCols) {
        targetRow[currentCol] = { value: "" };
      }
    }
    currentCol += 1;
  });

  return targetRow;
}

function expandSourceRowToMatrixRows(sourceRow, maxCols) {
  const sourceCells = Array.from(
    sourceRow.querySelectorAll(":scope > td, :scope > th"),
  );
  const cells =
    sourceCells.length > 0
      ? sourceCells
      : Array.from(sourceRow.querySelectorAll("td, th"));

  // One crushed cell → tokenize into columns (never vertical-split into a 1-col dump).
  if (cells.length === 1) {
    const only = cells[0];
    const fromLines = extractCellLines(only);
    const tokenSource =
      fromLines.length >= 2 && fromLines.every((line) => tokenizeCollapsedReportRow(line).length < 2)
        ? fromLines
        : tokenizeCollapsedReportRow(
            fromLines.length >= 2 ? fromLines.join(" ") : only.textContent || "",
          );
    if (tokenSource.length >= 2) {
      const width = Math.max(maxCols, tokenSource.length);
      const row = emptyRowPatch(width);
      tokenSource.forEach((token, index) => {
        if (index < width) row[index] = { value: token };
      });
      return [row];
    }
  }

  const { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan } =
    detectRowVerticalSplit(cells);

  // Excel-style column stacks: same number of lines in each cell → one output row per line.
  if (isFirstCellWithBrOrSpan && hasVerticalSplit && cellsWithSplit.length > 0) {
    const lineCount = Math.max(...cellsWithSplit.map((entry) => entry.allLines.length));
    if (lineCount >= 2 && cells.length >= 2) {
      const rows = [];
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const row = emptyRowPatch(maxCols);
        fillSourceRowPatches(row, cells, maxCols, (cellIndex, sourceCell) => {
          const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
          if (splitInfo?.allLines?.[lineIndex] != null) return splitInfo.allLines[lineIndex];
          return lineIndex === 0 ? extractPlainText(sourceCell) : "";
        });
        rows.push(row);
      }
      return rows;
    }

    // Legacy 2-line SUBTOTAL stack in a multi-col row.
    const topRow = emptyRowPatch(maxCols);
    const bottomRow = emptyRowPatch(maxCols);

    fillSourceRowPatches(topRow, cells, maxCols, (cellIndex) => {
      const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (splitInfo) return splitInfo.topData;
      return extractPlainText(cells[cellIndex]);
    });

    fillSourceRowPatches(bottomRow, cells, maxCols, (cellIndex) => {
      const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (splitInfo) return splitInfo.bottomData;
      return extractPlainText(cells[cellIndex]);
    });

    return [topRow, bottomRow];
  }

  const row = emptyRowPatch(maxCols);
  fillSourceRowPatches(row, cells, maxCols, () => null);
  return [row];
}

/**
 * Last-chance reshape: rows that only filled column 0 with multi-token / multiline
 * content get expanded into real columns (matches the user-visible failure mode).
 */
export function reshapeCollapsedFormatMatrix(bodyMatrix) {
  if (!Array.isArray(bodyMatrix) || !bodyMatrix.length) return bodyMatrix;

  const reshaped = [];
  bodyMatrix.forEach((row) => {
    if (!Array.isArray(row) || !row.length) {
      reshaped.push(row);
      return;
    }

    const filledIdx = [];
    row.forEach((cell, index) => {
      if (String(cell?.value ?? "").trim() || String(cell?.html ?? "").trim()) {
        filledIdx.push(index);
      }
    });

    const primary = row[0] || {};
    const primaryText = String(primary.value ?? "")
      .replace(/\u00a0/g, " ")
      .trim();
    const primaryLines = primaryText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    // Case A: only col0 filled, and it holds one report row of space-separated fields.
    if (filledIdx.length <= 1) {
      if (
        primaryLines.length >= 2 &&
        primaryLines.every((line) => tokenizeCollapsedReportRow(line).length >= 2)
      ) {
        primaryLines.forEach((line) => {
          const tokens = tokenizeCollapsedReportRow(line);
          reshaped.push(tokens.map((token) => ({ value: token })));
        });
        return;
      }

      if (primaryLines.length >= 3) {
        reshaped.push(primaryLines.map((line) => ({ value: line })));
        return;
      }

      const tokens = tokenizeCollapsedReportRow(primaryText);
      if (tokens.length >= 3) {
        reshaped.push(tokens.map((token) => ({ value: token })));
        return;
      }
    }

    // Case B: several cells, but each cell still holds a full dense report row.
    if (
      filledIdx.length >= 2 &&
      filledIdx.every((index) => tokenizeCollapsedReportRow(row[index]?.value || "").length >= 3)
    ) {
      filledIdx.forEach((index) => {
        const tokens = tokenizeCollapsedReportRow(row[index]?.value || "");
        reshaped.push(tokens.map((token) => ({ value: token })));
      });
      return;
    }

    reshaped.push(row);
  });

  return reshaped;
}

/** @returns {Array<Array<{ value: string, html?: string, styleCssText?: string }>>} */
export function buildFormatBodyMatrix(dataRows, maxCols) {
  const matrix = [];
  dataRows.forEach((sourceRow) => {
    expandSourceRowToMatrixRows(sourceRow, maxCols).forEach((row) => matrix.push(row));
  });
  return reshapeCollapsedFormatMatrix(matrix);
}
