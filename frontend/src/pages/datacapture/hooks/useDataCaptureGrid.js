import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { buildDataCaptureTable } from "../grid/dataCaptureBuildGrid.js";
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "../grid/dataCaptureGridMeta.js";
import {
  clearCaptureTableForReset,
  restoreCaptureTableFromData,
} from "../grid/dataCaptureGridClearRestore.js";
import {
  clearEditableGridCells,
  populateGridFromSnapshot,
  readGridDimensions,
} from "../grid/dataCaptureGridSnapshot.js";

/** Minimum rows/cols to consider the grid already built. */
function gridLooksInitialized(dims) {
  return dims.rows >= 1 && dims.cols >= 1;
}

/**
 * Phase 3+: Grid lifecycle in React — build, init dimensions, clear, restore cell values.
 */
export function useDataCaptureGrid(scriptsReady) {
  const dimensionsRef = useRef({ rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS });

  const initializeGrid = useCallback((rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS) => {
    const r = Math.max(1, Number(rows) || DEFAULT_GRID_ROWS);
    const c = Math.max(1, Number(cols) || DEFAULT_GRID_COLS);
    dimensionsRef.current = { rows: r, cols: c };

    buildDataCaptureTable(r, c);

    const dataTable = document.getElementById("dataTable");
    if (dataTable && dataTable.style.display === "none") {
      const captureType =
        typeof window.__DC_GET_CAPTURE_TYPE__ === "function" ? window.__DC_GET_CAPTURE_TYPE__() : "";
      if (captureType !== "2.Format") {
        const formatReady =
          typeof window.__DC_GET_FORMAT_GRID_READY__ === "function"
            ? window.__DC_GET_FORMAT_GRID_READY__()
            : false;
        if (formatReady) {
          dataTable.style.display = "table";
        }
      } else {
        dataTable.style.display = "table";
      }
    }

    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
    return dimensionsRef.current;
  }, []);

  const ensureGridReady = useCallback(
    (rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS) => {
      const r = Math.max(1, Number(rows) || DEFAULT_GRID_ROWS);
      const c = Math.max(1, Number(cols) || DEFAULT_GRID_COLS);

      let dims = readGridDimensions();
      if (!gridLooksInitialized(dims)) {
        initializeGrid(r, c);
        dims = readGridDimensions();
      }

      if (!gridLooksInitialized(dims)) {
        buildDataCaptureTable(r, c);
        dims = readGridDimensions();
        dimensionsRef.current = dims;
      }

      const dataTable = document.getElementById("dataTable");
      if (dataTable && dataTable.style.display === "none") {
        const captureType =
          typeof window.__DC_GET_CAPTURE_TYPE__ === "function" ? window.__DC_GET_CAPTURE_TYPE__() : "";
        if (captureType === "2.Format") {
          dataTable.style.display = "table";
        } else {
          const formatReady =
            typeof window.__DC_GET_FORMAT_GRID_READY__ === "function"
              ? window.__DC_GET_FORMAT_GRID_READY__()
              : false;
          if (formatReady) {
            dataTable.style.display = "table";
          }
        }
      }

      window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
      window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
      return dims;
    },
    [initializeGrid],
  );

  const handlersRef = useRef({});
  handlersRef.current = { initializeGrid, ensureGridReady };

  useLayoutEffect(() => {
    window.__DC_BUILD_GRID_REACT__ = buildDataCaptureTable;
    window.__DC_LEGACY_BUILD_TABLE__ = buildDataCaptureTable;
    window.__DC_INITIALIZE_TABLE__ = (rows, cols) => handlersRef.current.initializeGrid(rows, cols);
    window.__DC_ENSURE_GRID_READY__ = (rows, cols) => handlersRef.current.ensureGridReady(rows, cols);
    window.__DC_POPULATE_GRID_FROM_SNAPSHOT__ = populateGridFromSnapshot;
    window.__DC_CLEAR_GRID_CELLS__ = clearEditableGridCells;
    window.__DC_GET_GRID_DIMENSIONS__ = readGridDimensions;
    window.__DC_CLEAR_CAPTURE_TABLE__ = clearCaptureTableForReset;
    window.__DC_RESTORE_CAPTURE_TABLE__ = restoreCaptureTableFromData;

    return () => {
      delete window.__DC_BUILD_GRID_REACT__;
      delete window.__DC_LEGACY_BUILD_TABLE__;
      delete window.__DC_INITIALIZE_TABLE__;
      delete window.__DC_ENSURE_GRID_READY__;
      delete window.__DC_POPULATE_GRID_FROM_SNAPSHOT__;
      delete window.__DC_CLEAR_GRID_CELLS__;
      delete window.__DC_GET_GRID_DIMENSIONS__;
      delete window.__DC_CLEAR_CAPTURE_TABLE__;
      delete window.__DC_RESTORE_CAPTURE_TABLE__;
    };
  }, []);

  useEffect(() => {
    if (!scriptsReady) return;
    handlersRef.current.ensureGridReady(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
  }, [scriptsReady]);

  useEffect(() => {
    if (!scriptsReady) return;

    let cleanup = null;
    let pollId = null;

    const attach = () => {
      const tableBody = document.getElementById("tableBody");
      if (!tableBody) return false;

      const notify = () => {
        window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
      };

      tableBody.addEventListener("input", notify, true);
      tableBody.addEventListener("focusin", notify, true);

      cleanup = () => {
        tableBody.removeEventListener("input", notify, true);
        tableBody.removeEventListener("focusin", notify, true);
      };
      return true;
    };

    if (!attach()) {
      pollId = setInterval(() => {
        if (attach()) clearInterval(pollId);
      }, 200);
    }

    return () => {
      clearInterval(pollId);
      cleanup?.();
    };
  }, [scriptsReady]);

  return {
    initializeGrid,
    ensureGridReady,
    dimensions: dimensionsRef.current,
  };
}
