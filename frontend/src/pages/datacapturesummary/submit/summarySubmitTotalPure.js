import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import {
  SUMMARY_SUBMIT_TOTAL_MAX,
  SUMMARY_SUBMIT_TOTAL_MIN,
} from "./summarySubmitConstants.js";
import { computeSummaryTotal, formatSummaryTotalDisplay } from "../table/summaryRowData.js";
import { roundSummaryTotalForValidation } from "../table/summaryRowAmount.js";
import { formatSummarySubmitTotalError } from "./summarySubmitValidation.js";

export function validateSummarySubmitTotalPure(rows, globalRateInput = "") {
  const total = computeSummaryTotal(rows, globalRateInput);
  const totalRounded = roundSummaryTotalForValidation(total);
  const min = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MIN);
  const max = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MAX);
  if (MoneyDecimal.cmp(totalRounded, min) < 0 || MoneyDecimal.cmp(totalRounded, max) > 0) {
    return {
      ok: false,
      total: totalRounded,
      message: formatSummarySubmitTotalError(formatSummaryTotalDisplay(total)),
    };
  }
  return { ok: true, total: totalRounded };
}
