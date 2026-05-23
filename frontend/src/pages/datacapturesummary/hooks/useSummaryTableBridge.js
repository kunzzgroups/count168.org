import { useLayoutEffect } from "react";
import { registerSummaryFormulaEngineShims } from "../formula/summaryFormulaEngineBridge.js";

/** Set synchronously so legacy init never runs the DOM table/empty-state path before layout effects. */
if (typeof window !== "undefined") {
  window.__SUMMARY_REACT_TABLE__ = true;
  window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = true;
  registerSummaryFormulaEngineShims();
}

/** Legacy showEmptyState() inserts HTML after the submit bar — remove stale copies when React owns the table. */
export function removeLegacySummaryEmptyStateDom() {
  const submitBar = document.getElementById("summarySubmitContainer");
  if (submitBar) {
    let sibling = submitBar.nextElementSibling;
    while (sibling) {
      const next = sibling.nextElementSibling;
      if (sibling.classList?.contains("empty-state-container")) {
        sibling.remove();
      }
      sibling = next;
    }
  }
}

/**
 * Registers legacy SPA bridge flag so initDataCaptureSummaryPage skips DOM table build.
 * Template populate is handled by useSummaryTablePopulate.
 */
export function useSummaryTableBridge({ hasCaptureData, processData }) {
  useLayoutEffect(() => {
    window.__SUMMARY_REACT_TABLE__ = true;
    return () => {
      /* Keep flag for SPA — deleting it sends Add Account to legacy #addModal */
    };
  }, []);

  useLayoutEffect(() => {
    if (hasCaptureData) {
      removeLegacySummaryEmptyStateDom();
    }
  }, [hasCaptureData]);

  useLayoutEffect(() => {
    if (processData) {
      window.capturedProcessData = processData;
    }
  }, [processData]);
}

export function showSummaryTableChrome() {
  const loadingState = document.getElementById("loadingState");
  const actionButtons = document.getElementById("actionButtons");
  const summaryTableContainer = document.getElementById("summaryTableContainer");
  const summarySubmitContainer = document.getElementById("summarySubmitContainer");

  if (loadingState) loadingState.style.display = "none";
  if (actionButtons) actionButtons.style.display = "flex";
  if (summaryTableContainer) summaryTableContainer.style.display = "block";
  if (summarySubmitContainer) summarySubmitContainer.style.display = "flex";
  window.updateDeleteButton?.();
}

export function hideSummaryLoadingChrome() {
  const loadingState = document.getElementById("loadingState");
  if (loadingState) loadingState.style.display = "none";
}
