export function buildSummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  const groupOnly = processData.groupOnlyCapture === true;
  return {
    captureDate: processData.date,
    processId: processData.process,
    processName: processData.processName,
    processCode: processData.processCode || processData.process_code || "",
    currencyId: processData.currency,
    currencyName: processData.currencyName,
    remark: processData.remark || "",
    groupOnlyCapture: groupOnly,
    captureSelectedGroup: groupOnly
      ? String(processData.captureSelectedGroup || "").trim().toUpperCase()
      : undefined,
    captureScopeMode: groupOnly ? "group" : "company",
    summaryRows: Array.isArray(summaryRows) ? summaryRows : [],
  };
}
