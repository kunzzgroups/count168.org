/** Fixed process choices when Group is selected without Company (Data Capture group-only mode). */

export const GROUP_ONLY_PROCESS_IDS = new Set(["salary", "commission", "bonus"]);

export function isGroupOnlyProcessId(id) {
  return GROUP_ONLY_PROCESS_IDS.has(String(id || "").toLowerCase());
}

/** Group-only Process dropdown labels: uppercase codes only (no "1." / "2." prefix). */
export function getGroupOnlyProcessOptions() {
  return [
    { id: "salary", process_id: "SALARY", displayText: "SALARY" },
    { id: "commission", process_id: "COMMISSION", displayText: "COMMISSION" },
    { id: "bonus", process_id: "BONUS", displayText: "BONUS" },
  ];
}

/**
 * Map saved capture session process fields to dropdown shape (salary/bonus ids).
 * Submit stores API numeric process id; dropdown uses salary/bonus.
 */
export function selectedProcessFromGroupOnlySession(processData) {
  if (!processData) return null;
  const options = getGroupOnlyProcessOptions();
  const pcode = String(processData.processCode || processData.process_code || "")
    .trim()
    .toUpperCase();
  if (pcode) {
    const byCode = options.find((o) => o.process_id === pcode);
    if (byCode) {
      return {
        id: byCode.id,
        displayText: byCode.displayText,
        process_id: byCode.process_id,
        description_name: null,
      };
    }
  }
  const rawPid = processData.process != null ? String(processData.process) : "";
  if (isGroupOnlyProcessId(rawPid)) {
    const byId = options.find((o) => o.id === rawPid.toLowerCase());
    if (byId) {
      return {
        id: byId.id,
        displayText: byId.displayText,
        process_id: byId.process_id,
        description_name: null,
      };
    }
  }
  const pname = String(processData.processName || processData.process_name || "")
    .trim()
    .toUpperCase();
  if (pname) {
    const byName = options.find((o) => o.process_id === pname || o.displayText === pname);
    if (byName) {
      return {
        id: byName.id,
        displayText: byName.displayText,
        process_id: byName.process_id,
        description_name: null,
      };
    }
  }
  return null;
}
