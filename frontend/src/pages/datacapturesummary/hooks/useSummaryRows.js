import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildInitialSummaryRows,
  insertSubRowInModel,
  readSummaryRowsFromDom,
} from "../table/summaryRowModel.js";

/**
 * React-owned summary row list. Legacy mutates cell content in place; new sub-rows go through
 * __SUMMARY_REACT_ADD_SUB_ROW__ so React and DOM stay aligned.
 */
export function useSummaryRows(tableData, enabled) {
  const initialRows = useMemo(() => buildInitialSummaryRows(tableData), [tableData]);
  const [rows, setRows] = useState([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useLayoutEffect(() => {
    if (enabled && initialRows.length) {
      setRows(initialRows);
    } else {
      setRows([]);
    }
  }, [enabled, initialRows]);

  const syncFromDom = useCallback(() => {
    flushSync(() => {
      setRows((prev) => {
        const synced = readSummaryRowsFromDom(prev);
        if (synced.length === 0 && prev.length > 0) return prev;
        return synced;
      });
    });
  }, []);

  const removeRowsByKeys = useCallback((keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const keySet = new Set(keys.filter(Boolean));
    if (keySet.size === 0) return;
    flushSync(() => {
      setRows((prev) => prev.filter((row) => !keySet.has(row.key)));
    });
  }, []);

  const resetToInitialRows = useCallback(() => {
    flushSync(() => {
      setRows(initialRows);
    });
  }, [initialRows]);

  /** Remove all sub rows before re-applying templates (prevents duplicate subs on refresh). */
  const stripSubRows = useCallback(() => {
    flushSync(() => {
      setRows((prev) => prev.filter((row) => row.productType !== "sub"));
    });
  }, []);

  /** Reorder React row list to match legacy-computed order (avoids tbody appendChild). */
  const setRowOrder = useCallback((orderedKeys) => {
    if (!Array.isArray(orderedKeys) || orderedKeys.length === 0) return;
    flushSync(() => {
      setRows((prev) => {
        const byKey = new Map(prev.map((row) => [row.key, row]));
        const next = [];
        orderedKeys.forEach((key) => {
          const row = byKey.get(key);
          if (row) {
            next.push(row);
            byKey.delete(key);
          }
        });
        byKey.forEach((row) => next.push(row));
        return next.length ? next : prev;
      });
    });
  }, []);

  const addSubRow = useCallback((parentProcessValue, insertAfterRow, rowIndex) => {
    const insertAfterKey = insertAfterRow?.getAttribute?.("data-react-row-key") || null;
    let newKey = "";

    flushSync(() => {
      setRows((prev) => {
        const { rows: next, newKey: key } = insertSubRowInModel(
          prev,
          parentProcessValue,
          insertAfterKey,
          rowIndex
        );
        newKey = key;
        return next;
      });
    });

    if (!newKey) return null;
    return document.querySelector(`tr[data-react-row-key="${CSS.escape(newKey)}"]`);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      delete window.__SUMMARY_REACT_ADD_SUB_ROW__;
      delete window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__;
      delete window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__;
      return undefined;
    }

    window.__SUMMARY_REACT_ADD_SUB_ROW__ = addSubRow;
    window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__ = syncFromDom;
    window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__ = removeRowsByKeys;
    window.__SUMMARY_REACT_SET_ROW_ORDER__ = setRowOrder;
    window.__SUMMARY_STRIP_SUB_ROWS__ = stripSubRows;
    window.__SUMMARY_REACT_RESET_ROWS__ = resetToInitialRows;

    return () => {
      delete window.__SUMMARY_REACT_ADD_SUB_ROW__;
      delete window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__;
      delete window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__;
      delete window.__SUMMARY_REACT_SET_ROW_ORDER__;
      delete window.__SUMMARY_STRIP_SUB_ROWS__;
      delete window.__SUMMARY_REACT_RESET_ROWS__;
    };
  }, [enabled, addSubRow, syncFromDom, removeRowsByKeys, stripSubRows, resetToInitialRows, setRowOrder]);

  return { rows, syncFromDom, resetToInitialRows, removeRowsByKeys, stripSubRows };
}
