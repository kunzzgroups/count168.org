import { loadActiveCaptureSession } from "../../datacapture/lib/dataCaptureStorage.js";
import { saveGroupOnlyProcessPrefsFromProcessData } from "../../datacapture/lib/dataCaptureGroupOnlyProcessPersistence.js";
import { clearSummaryCaptureRoundStorage } from "./summaryStorage.js";

export function buildSummaryRestoreCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ restore: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

export function buildSummarySubmittedCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ submitted: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

/** Clear capture session after successful summary submit. */
export function clearSummarySessionAfterSubmit(options = {}) {
  window.isNavigatingAwayByBackOrSubmit = true;
  if (options.groupOnly === true) {
    const session = loadActiveCaptureSession();
    if (session?.processData) {
      saveGroupOnlyProcessPrefsFromProcessData(session.processData, session.processData.captureSelectedGroup);
    }
  }
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
