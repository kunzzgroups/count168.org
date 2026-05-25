/** localStorage keys shared with legacy datacapturesummary.js */
export const SUMMARY_CAPTURE_STORAGE_KEYS = [
  "capturedTableData",
  "capturedProcessData",
  "capturedDataCaptureType",
  "capturedFormatPreviewHtml",
  "captured655PreviewHtml",
  "capturedTableRateValues",
  "capturedTableFormulaSourceForRefresh",
  "capturedCaptureId",
];

export const SUMMARY_RATE_VALUES_KEY = "capturedTableRateValues";
export const SUMMARY_FORMULA_SOURCE_KEY = "capturedTableFormulaSourceForRefresh";
export const SUMMARY_CAPTURE_ID_KEY = "capturedCaptureId";
const SUMMARY_FRESH_NAV_KEY = "dc_summary_fresh_nav";

export function markSummaryFreshNavigation() {
  try {
    sessionStorage.setItem(SUMMARY_FRESH_NAV_KEY, "1");
  } catch {
    /* ignore */
  }
  window.isNavigatingAwayByBackOrSubmit = true;
}

export function consumeSummaryFreshNavigation() {
  try {
    if (sessionStorage.getItem(SUMMARY_FRESH_NAV_KEY) === "1") {
      sessionStorage.removeItem(SUMMARY_FRESH_NAV_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function clearSummaryCaptureRoundStorage() {
  try {
    for (const key of SUMMARY_CAPTURE_STORAGE_KEYS) {
      localStorage.removeItem(key);
      if (key === "capturedFormatPreviewHtml" || key === "captured655PreviewHtml") {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export function isSummaryFreshFromCapture(searchParams) {
  return searchParams?.get("success") === "1";
}

export function stripSummarySuccessParamFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("success") && !url.searchParams.has("error")) return;
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function readCaptureSessionFromStorage() {
  try {
    const tableDataStr = localStorage.getItem("capturedTableData");
    const processDataStr = localStorage.getItem("capturedProcessData");
    if (!tableDataStr || !processDataStr) return null;
    return {
      tableData: JSON.parse(tableDataStr),
      processData: JSON.parse(processDataStr),
    };
  } catch {
    return null;
  }
}

/** Fresh capture round: drop stale captureId before rendering summary. */
export function clearStaleCaptureIdForFreshRound() {
  try {
    localStorage.removeItem(SUMMARY_CAPTURE_ID_KEY);
  } catch {
    /* ignore */
  }
}
