/** Parse JSON from API responses that may include leading noise. */
export function parseJsonResponse(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start === -1) throw new Error("Invalid JSON response");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quote = "";
    let end = -1;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error("Invalid JSON response");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

/** Map batch account-currencies API rows to accountId → Set(currency codes). */
export function mapBatchCurrencies(data, currencySortOrderRef) {
  const map = new Map();
  (data || []).forEach((row) => {
    const id = Number(row.account_id);
    if (!id) return;
    const set = new Set();
    (row.currencies || []).forEach((c) => {
      const code = String(c.currency_code || c.code || "")
        .trim()
        .toUpperCase();
      if (code) {
        set.add(code);
        const cid = c.currency_id != null ? Number(c.currency_id) : null;
        if (cid && !currencySortOrderRef.current[code]) {
          currencySortOrderRef.current[code] = cid;
        }
      }
    });
    map.set(id, set);
  });
  return map;
}
