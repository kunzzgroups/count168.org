const FRANKFURTER_API = "https://api.frankfurter.dev/v2/rates";

function normalizeQuotes(baseCode, quoteCodes) {
  const base = String(baseCode || "").trim().toUpperCase();
  return [
    ...new Set(
      (quoteCodes || [])
        .map((c) => String(c || "").trim().toUpperCase())
        .filter((c) => c && c !== base),
    ),
  ];
}

export async function fetchFrankfurterRates(baseCode, quoteCodes, { signal, date = null } = {}) {
  const base = String(baseCode || "").trim().toUpperCase();
  const quotes = normalizeQuotes(base, quoteCodes);
  if (!base) return { rates: {}, date: null };
  if (!quotes.length) return { rates: { [base]: 1 }, date: null };

  const params = new URLSearchParams({ base, quotes: quotes.join(",") });
  if (date) params.set("date", String(date));
  const url = `${FRANKFURTER_API}?${params}`;

  // Always enforce timeout even when AbortSignal.any is unavailable.
  const timeoutMs = 8000;
  const res = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DOMException("Exchange rate request timed out", "TimeoutError"));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    fetch(url, { signal, cache: "no-store" })
      .then((response) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });

  if (!res.ok) throw new Error("Failed to load exchange rates");
  const json = await res.json();
  const rows = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
  const rates = { [base]: 1 };
  for (const row of rows) {
    const quote = String(row.quote || "").toUpperCase();
    const rate = parseFloat(row.rate);
    if (quote && Number.isFinite(rate) && rate > 0) rates[quote] = rate;
  }
  return {
    rates,
    date: rows[0]?.date || date || null,
  };
}

/** Pick rate date: use range end if not in the future, else latest. */
export function resolveFrankfurterDate(endYmd) {
  if (!endYmd) return null;
  const end = new Date(`${endYmd}T12:00:00`);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (Number.isNaN(end.getTime()) || end > today) return null;
  return endYmd;
}

export function convertToBaseAmount(amount, fromCode, baseCode, rates) {
  const from = String(fromCode || "").trim().toUpperCase();
  const base = String(baseCode || "").trim().toUpperCase();
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  if (from === base) return n;
  const rate = rates?.[from];
  if (!rate || rate <= 0) return null;
  return n / rate;
}

function frankfurterUnitRate(fromCode, baseCode, rates) {
  const from = String(fromCode || "").trim().toUpperCase();
  const base = String(baseCode || "").trim().toUpperCase();
  if (from === base) return 1;
  const rate = rates?.[from];
  if (!rate || rate <= 0) return null;
  return 1 / rate;
}

export function formatFrankfurterUnitRate(fromCode, baseCode, rates) {
  const unitRate = frankfurterUnitRate(fromCode, baseCode, rates);
  if (unitRate == null) return "—";
  if (unitRate === 1) return "1";
  const abs = Math.abs(unitRate);
  if (abs >= 1000) return unitRate.toFixed(2);
  if (abs >= 100) return unitRate.toFixed(4);
  return unitRate.toFixed(6);
}

export function computeDisplayConvertedAmount(amount, fromCode, baseCode, rates) {
  const formatted = formatFrankfurterUnitRate(fromCode, baseCode, rates);
  if (formatted === "—") return null;
  const unitRate = parseFloat(formatted);
  const n = parseFloat(amount);
  if (!Number.isFinite(unitRate) || !Number.isFinite(n)) return null;
  return n * unitRate;
}
