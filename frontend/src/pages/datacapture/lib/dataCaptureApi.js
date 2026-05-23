import { buildApiUrl } from "../../../utils/core/apiUrl.js";

/** YYYY-MM-DD in local timezone */
export function getLocalDateString(date = null) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildDateOptions() {
  const today = new Date();
  const opts = [];
  for (let i = 6; i >= -6; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekday = weekdayNames[date.getDay()];
    opts.push({
      value: dateString,
      label: `${dateString} (${weekday})`,
      isToday: i === 0,
    });
  }
  return opts;
}

function withCompany(url, companyId) {
  if (!companyId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}company_id=${encodeURIComponent(companyId)}`;
}

/** Same as legacy loadFormData: GET api/processes/addprocess_api.php */
export async function fetchAddProcessFormData(companyId) {
  let url = buildApiUrl("api/processes/addprocess_api.php");
  url = withCompany(url, companyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy loadProcessesByDate */
export async function fetchProcessesByDay(selectedDate, companyId) {
  let url = buildApiUrl(
    `api/processes/submitted_processes_api.php?action=get_processes_by_day&date=${encodeURIComponent(selectedDate)}`
  );
  url = withCompany(url, companyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy loadProcessData */
export async function fetchProcessDetail(processId, companyId) {
  let url = buildApiUrl(`api/processes/processlist_api.php?action=get_process&id=${encodeURIComponent(processId)}`);
  url = withCompany(url, companyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy `loadSubmittedProcesses`: GET get_submissions_by_capture_date */
export async function fetchSubmissionsByCaptureDate(captureDate, companyId) {
  let url = buildApiUrl(
    `api/processes/submitted_processes_api.php?action=get_submissions_by_capture_date&capture_date=${encodeURIComponent(captureDate)}`
  );
  url = withCompany(url, companyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy `loadPermissionButtons`: POST domain_api get_company_permissions */
export async function fetchCompanyPermissionsForDataCapture(companyCode) {
  const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
  });
  return response.json();
}

/** Matches `renderSubmittedProcesses` date/time formatting in `js/datacapture.js`. */
export function formatSubmittedProcessDateTime(process) {
  let formattedDate = "";
  let formattedTime = "";

  if (process.created_at) {
    const createdObj = new Date(process.created_at);
    const day = String(createdObj.getDate()).padStart(2, "0");
    const month = String(createdObj.getMonth() + 1).padStart(2, "0");
    const year = createdObj.getFullYear();
    formattedDate = `${day}/${month}/${year}`;
    formattedTime = `${String(createdObj.getHours()).padStart(2, "0")}:${String(createdObj.getMinutes()).padStart(2, "0")}:${String(createdObj.getSeconds()).padStart(2, "0")}`;
  } else {
    const logicalDateStr = process.capture_date || process.date_submitted;
    if (logicalDateStr) {
      const parts = logicalDateStr.split("-");
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const now = new Date();
    if (!formattedDate) {
      formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
    formattedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  }

  return `${formattedDate} ${formattedTime}`;
}

export function displayTextFromProcessRow(process) {
  if (process.process_display != null && String(process.process_display).trim() !== "") {
    return String(process.process_display).trim();
  }
  if (process.description_name) {
    return `${process.process_id} (${process.description_name})`;
  }
  return process.process_id;
}

/** GET addprocess_api.php — returns `descriptions` at top level (and under `data`). */
export async function fetchDescriptionCatalog(companyId) {
  let url = buildApiUrl("api/processes/addprocess_api.php");
  url = withCompany(url, companyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** POST action=add_description — same fields as legacy `addDescriptionForm` handler. */
export async function postAddDescription(companyId, descriptionName) {
  const formData = new FormData();
  formData.append("action", "add_description");
  formData.append("description_name", descriptionName);
  if (companyId) {
    formData.append("company_id", String(companyId));
  }
  const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  return response.json();
}

/** POST action=delete_description — matches legacy `deleteDescription` body. */
export async function postDeleteDescription(descriptionId) {
  const formData = new FormData();
  formData.append("action", "delete_description");
  formData.append("description_id", String(descriptionId));
  const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  return response.json();
}
