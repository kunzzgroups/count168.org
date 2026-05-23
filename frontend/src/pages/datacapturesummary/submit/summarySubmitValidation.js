import {
  SUMMARY_SUBMIT_TOTAL_MAX,
  SUMMARY_SUBMIT_TOTAL_MIN,
} from "./summarySubmitConstants.js";

/**
 * Validate footer total via legacy helpers (MoneyDecimal + row amount readers).
 * Returns { ok, total?, message? }.
 */
export function validateSummarySubmitTotal() {
  if (typeof window.__SUMMARY_VALIDATE_SUBMIT_TOTAL__ === "function") {
    return window.__SUMMARY_VALIDATE_SUBMIT_TOTAL__();
  }
  return { ok: true };
}

export function formatSummarySubmitTotalError(totalDisplay) {
  return `Cannot submit: The sum of Processed Amount must be between ${SUMMARY_SUBMIT_TOTAL_MIN} and ${SUMMARY_SUBMIT_TOTAL_MAX}. Current sum: ${totalDisplay}`;
}
