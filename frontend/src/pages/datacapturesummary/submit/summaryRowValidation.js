import { validateSummaryRowsCurrencyFormula as validateRowsFromDom } from "./summarySubmitRowValidation.js";

/**
 * Validate Currency + Formula on rows that have Account filled.
 */
export function validateSummaryRowsCurrencyFormula() {
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return { ok: true };
  return validateRowsFromDom(tbody.querySelectorAll("tr"));
}
