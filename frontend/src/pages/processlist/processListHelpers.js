export const PAGE_SIZE = 20;

export const EMPTY_FORM = {
  id: "",
  process_name: "",
  is_multi_process: false,
  selected_processes: [],
  show_multi_process_selection: true,
  selected_descriptions: [],
  copy_from: "",
  currency_id: "",
  day_use: [],
  remove_word: "",
  replace_word_from: "",
  replace_word_to: "",
  remark: "",
  status: "active",
  dts_modified: "",
  modified_by: "",
  dts_created: "",
  created_by: "",
  /** Edit UI only (legacy: hide DTS Modified when never changed) */
  dts_modified_display: "",
  dts_modified_user_display: "",
  currency_warning: null,
};

export function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

/** One pill per display `company_id`; API duplicates collapse. Prefer the row whose `id` matches `preferredPk`. */
export function dedupeCompanyRowsForSwitcher(companies, preferredPk) {
  const filtered = normalizeRows(companies).filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const byLabel = new Map();
  for (const c of filtered) {
    const label = String(c.company_id || "").trim().toUpperCase();
    if (!label) continue;
    let arr = byLabel.get(label);
    if (!arr) {
      arr = [];
      byLabel.set(label, arr);
    }
    const idNum = Number(c.id);
    if (Number.isFinite(idNum) && arr.some((e) => Number(e.id) === idNum)) continue;
    arr.push(c);
  }
  const pref = Number(preferredPk);
  const out = [];
  for (const arr of byLabel.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    const sorted = [...arr].sort((a, b) => Number(a.id) - Number(b.id));
    if (Number.isFinite(pref)) {
      const hit = sorted.find((e) => Number(e.id) === pref);
      out.push(hit ?? sorted[0]);
    } else {
      out.push(sorted[0]);
    }
  }
  return out;
}

function tiebreakProcessDefault(a, b) {
  const aPn = String(a.process_name || "").toLowerCase();
  const bPn = String(b.process_name || "").toLowerCase();
  if (aPn < bPn) return -1;
  if (aPn > bPn) return 1;
  const aD = String(a.description || a.description_name || "").toLowerCase();
  const bD = String(b.description || b.description_name || "").toLowerCase();
  if (aD < bD) return -1;
  if (aD > bD) return 1;
  return Number(a.id || 0) - Number(b.id || 0);
}

/**
 * Games process table client sort (column keys match ProcessTable headers).
 * @param {"processId"|"description"|"status"|"currency"|"dayUse"} sortColumn
 */
export function sortProcessTableRows(rows, sortColumn, sortDirection) {
  const dir = sortDirection === "desc" ? -1 : 1;
  const copy = [...normalizeRows(rows)];
  const sortPrimary = (primary) => {
    copy.sort((a, b) => {
      let c = primary(a, b);
      if (c === 0) c = tiebreakProcessDefault(a, b);
      return c * dir;
    });
  };

  if (sortColumn === "processId") {
    sortPrimary((a, b) => {
      const aKey = String(a.process_name || "").toLowerCase();
      const bKey = String(b.process_name || "").toLowerCase();
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
  } else if (sortColumn === "description") {
    sortPrimary((a, b) =>
      String(a.description || a.description_name || "").localeCompare(String(b.description || b.description_name || ""), undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
  } else if (sortColumn === "status") {
    sortPrimary((a, b) =>
      String(a.status || "")
        .toLowerCase()
        .localeCompare(String(b.status || "").toLowerCase(), undefined, { sensitivity: "base" }),
    );
  } else if (sortColumn === "currency") {
    sortPrimary((a, b) =>
      String(a.currency || "").localeCompare(String(b.currency || ""), undefined, { sensitivity: "base" }),
    );
  } else if (sortColumn === "dayUse") {
    sortPrimary((a, b) =>
      String(a.day_use || "").localeCompare(String(b.day_use || ""), undefined, { sensitivity: "base", numeric: true }),
    );
  } else {
    sortPrimary(() => 0);
  }
  return copy;
}

/** Same ordering as js/processlist.js after fetch (Games). */
export function sortProcessRows(rows) {
  return sortProcessTableRows(rows, "processId", "asc");
}

/** Legacy editProcess remarks handling (JSON meta.user_remarks). */
export function parseRemarkForForm(remarks) {
  if (remarks == null || remarks === "") return "";
  try {
    const meta = JSON.parse(remarks);
    if (meta && meta.user_remarks != null && meta.user_remarks !== "") return String(meta.user_remarks);
  } catch {
    /* plain text */
  }
  return String(remarks);
}

export function buildEditDescriptionSelection(p, descriptionsList) {
  let names = [];
  if (Array.isArray(p.description_names) && p.description_names.length > 0) {
    names = p.description_names.map((x) => String(x).trim()).filter(Boolean);
  } else if (p.description_names && typeof p.description_names === "string") {
    names = p.description_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  } else if (p.description_name) {
    names = [String(p.description_name).trim()].filter(Boolean);
  }

  const selected = [];
  names.forEach((name, idx) => {
    const fromApi = descriptionsList.find((d) => String(d.name) === String(name));
    const id = idx === 0 && p.description_id ? p.description_id : fromApi?.id ?? `${name}_${idx}`;
    selected.push({ id, name });
  });
  return selected;
}

export function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "processlist" } })
    );
  } catch {
    /* ignore */
  }
}
