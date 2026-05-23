import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { normalizeRows } from "./processListHelpers.js";

/** Warm Bank Process List data before route swap (Games → Bank). */
export async function prefetchBankProcessListPayload(companyId) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, currencyCodes: null };

  const listUrl = new URL(buildApiUrl("api/processes/processlist_api.php"));
  listUrl.searchParams.set("permission", "Bank");
  listUrl.searchParams.set("company_id", String(cid));
  listUrl.searchParams.set("showAll", "1");

  const curUrl = buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${cid}`);

  try {
    const [listRes, curRes] = await Promise.all([
      fetch(listUrl.toString(), { credentials: "include" }),
      fetch(curUrl, { credentials: "include" }),
    ]);
    const listJson = await listRes.json();
    const curJson = await curRes.json();

    const rows =
      listRes.ok && listJson?.success && Array.isArray(listJson.data) ? normalizeRows(listJson.data) : null;

    let currencyCodes = null;
    if (curRes.ok && curJson?.success && Array.isArray(curJson.data)) {
      currencyCodes = curJson.data.map((r) => String(r.code).toUpperCase());
    }

    return { rows, currencyCodes };
  } catch {
    return { rows: null, currencyCodes: null };
  }
}

/** Warm Games Process List data before route swap (Bank → Games). */
export async function prefetchGamesProcessListPayload(companyId) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, meta: null };

  const listUrl = new URL(buildApiUrl("api/processes/processlist_api.php"));
  listUrl.searchParams.set("permission", "Games");
  listUrl.searchParams.set("company_id", String(cid));

  const metaUrl = new URL(buildApiUrl("api/processes/addprocess_api.php"));
  metaUrl.searchParams.set("company_id", String(cid));

  try {
    const [listRes, metaRes] = await Promise.all([
      fetch(listUrl.toString(), { credentials: "include" }),
      fetch(metaUrl.toString(), { credentials: "include" }),
    ]);
    const listJson = await listRes.json();
    const metaJson = await metaRes.json();
    const metaData = metaJson?.data || metaJson || {};

    const rows =
      listRes.ok && listJson?.success && Array.isArray(listJson.data) ? normalizeRows(listJson.data) : null;

    const meta = {
      currencies: Array.isArray(metaData.currencies) ? metaData.currencies : [],
      descriptions: Array.isArray(metaData.descriptions) ? metaData.descriptions : [],
      days: Array.isArray(metaData.days) ? metaData.days : [],
      existingProcesses: Array.isArray(metaData.existingProcesses) ? metaData.existingProcesses : [],
    };

    return { rows, meta };
  } catch {
    return { rows: null, meta: null };
  }
}
