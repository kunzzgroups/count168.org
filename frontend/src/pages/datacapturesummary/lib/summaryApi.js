import { buildApiUrl } from "../../../utils/core/apiUrl.js";

function withCompany(url, companyId) {
  if (companyId == null || companyId === "") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}company_id=${encodeURIComponent(String(companyId))}`;
}

async function parseJsonResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `HTTP ${response.status}`);
  }
  return json;
}

/** GET api/session/current_user_api.php */
export async function fetchSummarySessionUser() {
  const response = await fetch(buildApiUrl("api/session/current_user_api.php"), {
    credentials: "include",
  });
  const json = await parseJsonResponse(response);
  if (!json.success || !json.data) {
    throw new Error(json.message || "Session unavailable");
  }
  return json.data;
}

/** Default load: currencies + accounts for Edit Formula / Add Account */
export async function fetchSummaryFormCatalog(companyId) {
  const url = withCompany(buildApiUrl("api/datacapture_summary/summary_api.php"), companyId);
  const response = await fetch(url, { credentials: "include" });
  const json = await parseJsonResponse(response);
  if (!json.success) {
    throw new Error(json.message || "Failed to load summary form data");
  }
  return {
    currencies: Array.isArray(json.currencies) ? json.currencies : [],
    accounts: Array.isArray(json.accounts) ? json.accounts : [],
  };
}

/** GET ?action=get_summary_state */
export async function fetchSummaryServerState({ companyId, processId, processCode, signal }) {
  const params = new URLSearchParams({ action: "get_summary_state" });
  if (processId != null && processId !== "") params.set("process_id", String(processId));
  if (processCode != null && processCode !== "") params.set("process_code", String(processCode));
  if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  const url = buildApiUrl(`api/datacapture_summary/summary_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include", signal });
  const json = await response.json();
  if (json?.success === true && json.data && typeof json.data === "object") {
    return json.data;
  }
  return null;
}

/** POST ?action=save_summary_state (fire-and-forget friendly) */
export async function saveSummaryServerState(companyId, payload) {
  const url = withCompany(
    buildApiUrl("api/datacapture_summary/summary_api.php?action=save_summary_state"),
    companyId
  );
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/** POST ?action=submit — returns parsed JSON or throws with { status, message, isSizeError }. */
export async function submitSummaryPayload(companyId, payload) {
  const url = withCompany(
    buildApiUrl("api/datacapture_summary/summary_api.php?action=submit"),
    companyId
  );
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const lowerText = (responseText || "").toLowerCase();
    const isSizeError =
      response.status === 413 ||
      lowerText.includes("post_max_size") ||
      lowerText.includes("payload too large") ||
      lowerText.includes("request entity too large") ||
      lowerText.includes("数据太大") ||
      lowerText.includes("exceeds");
    throw {
      status: response.status,
      message: responseText || `HTTP ${response.status}`,
      isSizeError,
    };
  }

  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw {
      status: response.status,
      message: `Invalid JSON response: ${responseText}`,
      isSizeError: false,
    };
  }

  if (!json.success) {
    const message = json.message || json.error || "Unknown error";
    throw {
      status: response.status,
      message,
      isSizeError: /太大|post_max_size/i.test(message),
    };
  }

  return json;
}
