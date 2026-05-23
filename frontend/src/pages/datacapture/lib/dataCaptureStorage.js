import {
  isCitibetCaptureType,
  normalizeCaptureType as normalizeStoredCaptureType,
} from "./dataCaptureFormRules.js";

export const CAPTURE_TABLE_STORAGE_KEY = "capturedTableData";
export const CAPTURE_PROCESS_STORAGE_KEY = "capturedProcessData";
export const CAPTURE_TYPE_STORAGE_KEY = "capturedDataCaptureType";

export { normalizeStoredCaptureType, isCitibetCaptureType };

export function saveCaptureSession(tableData, processData, captureType) {
  const type = normalizeStoredCaptureType(captureType || processData?.dataCaptureType) || "1.Text";
  localStorage.setItem(CAPTURE_TABLE_STORAGE_KEY, JSON.stringify(tableData));
  localStorage.setItem(CAPTURE_PROCESS_STORAGE_KEY, JSON.stringify({ ...processData, dataCaptureType: type }));
  localStorage.setItem(CAPTURE_TYPE_STORAGE_KEY, type);
}

export function loadCaptureSession() {
  try {
    const tableDataStr = localStorage.getItem(CAPTURE_TABLE_STORAGE_KEY);
    const processDataStr = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    if (!tableDataStr || !processDataStr) return null;
    const tableData = JSON.parse(tableDataStr);
    const processData = JSON.parse(processDataStr);
    const savedTypeRaw =
      processData?.dataCaptureType ||
      processData?.captureType ||
      localStorage.getItem(CAPTURE_TYPE_STORAGE_KEY) ||
      "1.Text";
    return {
      tableData,
      processData,
      captureType: normalizeStoredCaptureType(savedTypeRaw) || "1.Text",
    };
  } catch {
    return null;
  }
}

export function shouldRestoreFromUrl() {
  return new URLSearchParams(window.location.search).get("restore") === "1";
}

export function stripRestoreParamFromUrl() {
  stripSearchParamsFromUrl(["restore"]);
}

export function stripSearchParamsFromUrl(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  try {
    const url = new URL(window.location.href);
    keys.forEach((key) => url.searchParams.delete(key));
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}
