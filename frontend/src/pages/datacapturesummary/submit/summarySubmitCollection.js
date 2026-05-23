import { buildSummarySubmitPayload } from "./summarySubmitPayload.js";
import { prepareSummarySubmitCollection } from "./summarySubmitRowCollection.js";

/**
 * Prepare submit rows + payload (React-owned collection).
 */
export async function prepareSummarySubmitPayload() {
  let processData = null;
  try {
    const raw = localStorage.getItem("capturedProcessData");
    processData = raw ? JSON.parse(raw) : null;
  } catch {
    processData = null;
  }

  if (!processData) {
    return { ok: false, message: "No process data found. Please return to Data Capture page." };
  }

  const prep = await prepareSummarySubmitCollection(processData);
  if (!prep?.ok) {
    return {
      ok: false,
      warning: !!prep?.warning,
      message: prep?.message || "Failed to prepare summary rows.",
      rows: prep?.rows || [],
    };
  }

  const payload = buildSummarySubmitPayload(processData, prep.rows);
  return { ok: true, payload, rows: prep.rows };
}
