import {
  SUMMARY_SUBMIT_TOTAL_MAX,
  SUMMARY_SUBMIT_TOTAL_MIN,
} from "./summarySubmitConstants.js";

export function formatSummarySubmitTotalError(totalDisplay) {
  return `Cannot submit: The sum of Processed Amount must be between ${SUMMARY_SUBMIT_TOTAL_MIN} and ${SUMMARY_SUBMIT_TOTAL_MAX}. Current sum: ${totalDisplay}`;
}
