/** Keys cleared when finishing a capture round (legacy PHP + JS parity). */

export function clearDataCaptureRoundLocalStorage() {
  [
    "capturedTableData",
    "capturedProcessData",
    "capturedDataCaptureType",
    "capturedFormatPreviewHtml",
    "captured655PreviewHtml",
    "capturedTableRateValues",
    "capturedTableRateValuesByProductId",
    "capturedTableFormulaSourceForRefresh",
    "capturedCaptureId",
  ].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}
