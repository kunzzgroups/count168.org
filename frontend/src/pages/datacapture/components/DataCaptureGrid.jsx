import { memo, useLayoutEffect } from "react";
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "../grid/dataCaptureGridMeta.js";

/**
 * Stable grid shell — React builds and manages #dataTable rows/cells.
 */
function DataCaptureGrid() {
  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tryEnsure = () => {
      if (cancelled) return;
      if (typeof window.__DC_ENSURE_GRID_READY__ === "function") {
        window.__DC_ENSURE_GRID_READY__(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
        const dims =
          typeof window.__DC_GET_GRID_DIMENSIONS__ === "function"
            ? window.__DC_GET_GRID_DIMENSIONS__()
            : { rows: 0, cols: 0 };
        if (dims.rows >= 1 && dims.cols >= 1) return;
      }
      attempts += 1;
      if (attempts < 60) {
        setTimeout(tryEnsure, 50);
      }
    };

    tryEnsure();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <table className="excel-table" id="dataTable">
        <thead id="tableHeader">
          <tr>
            <th />
          </tr>
        </thead>
        <tbody id="tableBody" />
      </table>
      <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
        <iframe
          id="tablePreviewFrameFormat"
          className="table-preview-frame-format"
          title="Format Table Preview"
        />
      </div>
      <div
        id="pasteAreaFormat"
        className="paste-area-format"
        style={{ display: "none" }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
      />
    </>
  );
}

export default memo(DataCaptureGrid, () => true);
