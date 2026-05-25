import { useCallback, useEffect, useRef } from "react";
import { buildColumnAEntries } from "../table/summaryColumnAData.js";
import {
  runSummaryTablePostPopulate,
  showSummarySuccessNotificationIfNeeded,
  summaryTableNeedsTemplatePopulate,
  waitForSummaryPopulateIdle,
  waitForSummaryPrePopulateReady,
} from "../table/summaryTablePostPopulate.js";
import {
  removeLegacySummaryEmptyStateDom,
  showSummaryTableChrome,
} from "./useSummaryTableBridge.js";

const MAX_POPULATE_ATTEMPTS = 2;

let populateInFlight = false;

async function executeSummaryPopulate({ tableData, syncFromDom, onTableVisible }) {
  if (!tableData) return false;

  if (populateInFlight) {
    await waitForSummaryPopulateIdle(12000);
    if (populateInFlight) return !summaryTableNeedsTemplatePopulate();
  }

  populateInFlight = true;
  window.__SUMMARY_POPULATE_IN_FLIGHT__ = true;

  try {
    removeLegacySummaryEmptyStateDom();
    await waitForSummaryPrePopulateReady();
    onTableVisible?.();
    const { idProducts } = buildColumnAEntries(tableData);
    window.rebuildUsedAccountIds?.();
    await runSummaryTablePostPopulate(idProducts, { skipPreReadyWait: true });
    syncFromDom?.();
    window.updateHeaderCurrencyFromSummaryTable?.();
    return !summaryTableNeedsTemplatePopulate();
  } finally {
    populateInFlight = false;
    window.__SUMMARY_POPULATE_IN_FLIGHT__ = false;
    removeLegacySummaryEmptyStateDom();
  }
}

async function runPopulateAttempts({
  tableData,
  syncFromDom,
  resetToInitialRows,
  fromExplicitReset,
  onTableVisible,
}) {
  const maxAttempts = fromExplicitReset ? 1 : MAX_POPULATE_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      resetToInitialRows?.();
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
      await new Promise((resolve) => window.setTimeout(resolve, 120 * attempt));
    }
    const populated = await executeSummaryPopulate({
      tableData,
      syncFromDom,
      onTableVisible: attempt === 0 ? onTableVisible : undefined,
    });
    if (populated) return true;
  }
  return false;
}

/**
 * React-owned template populate — runs after legacy init bindings, keeps loading until data is ready.
 */
export function useSummaryTablePopulate({
  tableData,
  hasCaptureData,
  scriptsReady,
  legacyInitDone,
  syncFromDom,
  resetToInitialRows,
  onPopulatingChange,
}) {
  const populateStartedRef = useRef(false);

  const finishPopulate = useCallback(() => {
    showSummaryTableChrome();
    showSummarySuccessNotificationIfNeeded();
    onPopulatingChange?.(false);
  }, [onPopulatingChange]);

  const runPopulate = useCallback(async (options = {}) => {
    const shouldReset = options?.reset === true;
    onPopulatingChange?.(true);
    try {
      if (shouldReset) {
        resetToInitialRows?.();
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });
      }
      const onTableVisible = () => {
        showSummaryTableChrome();
        onPopulatingChange?.(false);
      };
      const populated = await runPopulateAttempts({
        tableData,
        syncFromDom,
        resetToInitialRows,
        fromExplicitReset: shouldReset,
        onTableVisible,
      });
      if (!populated) {
        console.warn("Summary template populate incomplete after retries");
      }
      return populated;
    } catch (error) {
      console.error("Summary template populate failed:", error);
      return false;
    } finally {
      if (shouldReset) {
        showSummaryTableChrome();
        onPopulatingChange?.(false);
      } else {
        finishPopulate();
      }
    }
  }, [tableData, syncFromDom, resetToInitialRows, onPopulatingChange, finishPopulate]);

  useEffect(() => {
    window.__SUMMARY_REACT_ON_TABLE_READY__ = runPopulate;
    window.__SUMMARY_REACT_SET_POPULATING__ = onPopulatingChange;
    return () => {
      delete window.__SUMMARY_REACT_ON_TABLE_READY__;
      delete window.__SUMMARY_REACT_SET_POPULATING__;
    };
  }, [runPopulate, onPopulatingChange]);

  useEffect(() => {
    populateStartedRef.current = false;
  }, [tableData, hasCaptureData, scriptsReady]);

  useEffect(() => {
    if (!scriptsReady || !hasCaptureData || !tableData || !legacyInitDone) return;
    if (populateStartedRef.current) return;

    populateStartedRef.current = true;
    let cancelled = false;

    runPopulate().finally(() => {
      if (cancelled) {
        onPopulatingChange?.(false);
      }
    });

    return () => {
      cancelled = true;
      populateStartedRef.current = false;
    };
  }, [scriptsReady, hasCaptureData, tableData, legacyInitDone, runPopulate, onPopulatingChange]);

  useEffect(() => {
    return () => {
      populateStartedRef.current = false;
    };
  }, []);
}
