/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
  const startRow =
    Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;

  try {
    const hasBrInOriginal =
      /<br\s+[^>]*>/i.test(htmlString) || /<br\s*\/?>/i.test(htmlString);
    console.log(
      `Format: Parsing HTML table with header support... hasBrInOriginal=${hasBrInOriginal}`,
    );

    const structure = parseFormatHtmlTableStructure(htmlString);
    if (!structure) {
      return false;
    }

    const { headerRows, dataRows, maxCols } = structure;

    // Build/reshape first — source maxCols from colspan can lie; matrix width is truth.
    let bodyMatrix;
    try {
      bodyMatrix = buildFormatBodyMatrix(dataRows, Math.max(maxCols, 1));
    } catch (err) {
      console.warn("Format: buildFormatBodyMatrix failed", err);
      return false;
    }

    const appliedCols = Math.max(
      0,
      ...bodyMatrix.map((row) => (Array.isArray(row) ? row.length : 0)),
    );
    if (appliedCols < 2) {
      console.log(
        `Format: rejecting collapsed matrix (sourceMaxCols=${maxCols}, appliedCols=${appliedCols}) — falling back`,
      );
      return false;
    }

    const sample = (bodyMatrix[0] || [])
      .slice(0, 10)
      .map((cell) => String(cell?.value ?? "").slice(0, 18));
    console.log(
      `Format: Applying ${bodyMatrix.length} body row(s) at row ${startRow} (${dataRows.length} source data rows x ${appliedCols} cols)`,
      sample,
    );

    ensureGridFits(startRow, 0, bodyMatrix.length, appliedCols);

    const { successCount } = applyDataMatrixToGrid(bodyMatrix, null, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
      alignTotalRows: false,
    });

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${bodyMatrix.length} 个数据行 x ${appliedCols} 列)，已保持完整表格结构!`,
        "success",
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    console.log("Format: No cells were pasted");
    return false;
  } catch (error) {
    console.error("Format: Error parsing HTML table:", error);
    return false;
  }
}
