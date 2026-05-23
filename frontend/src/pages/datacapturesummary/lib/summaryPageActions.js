import { clearSummaryCaptureRoundStorage } from "./summaryStorage.js";

/** Persist formula/source/rate draft caches before refresh or leaving (not final Submit). */
export function saveSummaryRefreshState(options = {}) {
  const includeRateValue = options.includeRateValue !== false;
  if (includeRateValue) {
    window.saveRateValuesForRefresh?.();
  }
  window.saveFormulaSourceForRefresh?.({ includeRateValue });
}

export function buildSummaryRestoreCapturePath(companyId) {
  const params = new URLSearchParams({ restore: "1" });
  if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

export function buildSummarySubmittedCapturePath(companyId) {
  const params = new URLSearchParams({ submitted: "1" });
  if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

/** Clear capture session after successful summary submit (legacy parity). */
export function clearSummarySessionAfterSubmit() {
  window.isNavigatingAwayByBackOrSubmit = true;
  try {
    localStorage.removeItem("capturedTableRateValues");
    localStorage.removeItem("capturedTableRateValuesByProductId");
    localStorage.removeItem("capturedTableFormulaSourceForRefresh");
    localStorage.removeItem("capturedCaptureId");
  } catch {
    /* ignore */
  }
  clearSummaryCaptureRoundStorage();
}

export function runLegacyRateBatchSubmit() {
  window.submitRateValues?.();
}

export function runLegacyRateSelectAll(buttonEl) {
  window.toggleAllRate?.(buttonEl);
}

export function runLegacyDeleteSelectedRows() {
  window.deleteSelectedRows?.();
}

export function runLegacySubmitSummary() {
  window.submitSummaryData?.();
}

export function runLegacyHideNotification() {
  window.hideNotification?.();
}
