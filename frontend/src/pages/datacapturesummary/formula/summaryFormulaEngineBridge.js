import {
  formatNegativeNumbersInFormula,
  isNewIdProductColumnFormat,
  parseCompleteFormula,
  parseIdProductColumnRef,
  parseSourceColumnsInput,
  removeThousandsSeparators,
} from "./summaryFormulaParseUtils.js";
import { evaluateExpression, evaluateMoneyExpression } from "./summaryFormulaEvaluate.js";
import {
  registerSummaryFormulaReferenceEngine,
  unregisterSummaryFormulaReferenceEngine,
} from "./summaryFormulaReference.js";
import {
  registerSummarySaveFormula,
  unregisterSummarySaveFormula,
} from "./summarySaveFormula.js";
import {
  registerSummarySubTemplatePopulate,
  unregisterSummarySubTemplatePopulate,
} from "../table/summarySubTemplatePopulate.js";

/** Register React formula utilities for legacy datacapturesummary.js (Strangler). */
export function registerSummaryFormulaEngineShims() {
  window.__SUMMARY_FORMULA_ENGINE__ = true;
  window.__SUMMARY_REMOVE_THOUSANDS_SEPARATORS__ = removeThousandsSeparators;
  window.__SUMMARY_PARSE_ID_PRODUCT_COLUMN_REF__ = parseIdProductColumnRef;
  window.__SUMMARY_IS_NEW_ID_PRODUCT_COLUMN_FORMAT__ = isNewIdProductColumnFormat;
  window.__SUMMARY_PARSE_SOURCE_COLUMNS_INPUT__ = parseSourceColumnsInput;
  window.__SUMMARY_PARSE_COMPLETE_FORMULA__ = parseCompleteFormula;
  window.__SUMMARY_FORMAT_NEGATIVE_NUMBERS_IN_FORMULA__ = formatNegativeNumbersInFormula;
  window.__SUMMARY_EVALUATE_MONEY_EXPRESSION__ = evaluateMoneyExpression;
  window.__SUMMARY_EVALUATE_EXPRESSION__ = evaluateExpression;

  window.removeThousandsSeparators = removeThousandsSeparators;
  window.evaluateExpression = evaluateExpression;

  registerSummaryFormulaReferenceEngine();
  registerSummarySaveFormula();
  registerSummarySubTemplatePopulate();
}

export function unregisterSummaryFormulaEngineShims() {
  unregisterSummarySubTemplatePopulate();
  unregisterSummarySaveFormula();
  unregisterSummaryFormulaReferenceEngine();
  delete window.__SUMMARY_FORMULA_ENGINE__;
  delete window.__SUMMARY_REMOVE_THOUSANDS_SEPARATORS__;
  delete window.__SUMMARY_PARSE_ID_PRODUCT_COLUMN_REF__;
  delete window.__SUMMARY_IS_NEW_ID_PRODUCT_COLUMN_FORMAT__;
  delete window.__SUMMARY_PARSE_SOURCE_COLUMNS_INPUT__;
  delete window.__SUMMARY_PARSE_COMPLETE_FORMULA__;
  delete window.__SUMMARY_FORMAT_NEGATIVE_NUMBERS_IN_FORMULA__;
  delete window.__SUMMARY_EVALUATE_MONEY_EXPRESSION__;
  delete window.__SUMMARY_EVALUATE_EXPRESSION__;
}

if (typeof window !== "undefined" && window.__SUMMARY_REACT_TABLE__) {
  registerSummaryFormulaEngineShims();
}
