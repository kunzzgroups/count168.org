import { dataCaptureScopeCacheCompanyKey } from "../../datacapture/lib/dataCaptureScope.js";
import {
  SUMMARY_FORMULA_SOURCE_KEY,
  SUMMARY_RATE_VALUES_KEY,
} from "./summaryStorage.js";

const RATE_BY_PRODUCT_KEY = "capturedTableRateValuesByProductId";

function scopedKey(base, captureScope) {
  const tag = dataCaptureScopeCacheCompanyKey(captureScope);
  if (tag == null) return base;
  return `${base}:${tag}`;
}

/** Scoped localStorage keys for Summary refresh draft (formula / rate). */
export function summaryRefreshStorageKeys(captureScope) {
  return {
    formulaSource: scopedKey(SUMMARY_FORMULA_SOURCE_KEY, captureScope),
    rateValues: scopedKey(SUMMARY_RATE_VALUES_KEY, captureScope),
    rateByProduct: scopedKey(RATE_BY_PRODUCT_KEY, captureScope),
  };
}

export { RATE_BY_PRODUCT_KEY };
