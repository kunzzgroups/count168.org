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

export async function fetchFrankfurterRates(baseCode, quoteCodes) {
  const base = String(baseCode || "").trim().toUpperCase();
  const quotes = normalizeQuotes(base, quoteCodes);
  if (!base) return { rates: {}, date: null };
  if (!quotes.length) return { rates: { [base]: 1 }, date: null };

  const params = new URLSearchParams({ base, quotes: quotes.join(",") });
  const url = `${FRANKFURTER_API}?${params}`;
  const res = await fetch(url);
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
    date: rows[0]?.date || null,
  };
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
