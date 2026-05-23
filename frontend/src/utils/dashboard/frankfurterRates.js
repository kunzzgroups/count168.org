const FRANKFURTER_API = "https://api.frankfurter.dev/v2/rates";
const CACHE_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { expires: number, rates: Record<string, number>, date: string | null }>} */
const rateCache = new Map();

function cacheKey(base, quotes, date) {
  const sorted = [...quotes].sort().join(",");
  return `${base}|${sorted}|${date || "latest"}`;
}

/**
 * Fetch Frankfurter rates with base→quote multipliers (1 base = rate quote).
 * @param {string} base - e.g. MYR
 * @param {string[]} quoteCodes - target codes excluding base
 * @param {string | null} [dateYmd] - optional YYYY-MM-DD
 */
export async function fetchFrankfurterRates(base, quoteCodes, dateYmd = null) {
  const baseCode = String(base || "").trim().toUpperCase();
  const quotes = [...new Set(
    (quoteCodes || [])
      .map((c) => String(c || "").trim().toUpperCase())
      .filter((c) => c && c !== baseCode)
  )];

  if (!baseCode) {
    return { rates: {}, date: null, unsupported: quotes };
  }

  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }

  const key = cacheKey(baseCode, quotes, dateYmd);
  const cached = rateCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { rates: cached.rates, date: cached.date, unsupported: cached.unsupported || [] };
  }

  const params = new URLSearchParams({ base: baseCode, quotes: quotes.join(",") });
  if (dateYmd) params.set("date", dateYmd);

  const res = await fetch(`${FRANKFURTER_API}?${params}`);
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error("Frankfurter invalid response");
  }

  const rates = { [baseCode]: 1 };
  const supported = new Set();
  for (const row of rows) {
    const quote = String(row.quote || "").toUpperCase();
    const rate = parseFloat(row.rate);
    if (quote && Number.isFinite(rate) && rate > 0) {
      rates[quote] = rate;
      supported.add(quote);
    }
  }

  const unsupported = quotes.filter((q) => !supported.has(q));
  const date = rows[0]?.date || dateYmd || null;

  rateCache.set(key, {
    expires: Date.now() + CACHE_TTL_MS,
    rates,
    date,
    unsupported,
  });

  return { rates, date, unsupported };
}

/** Return cached Frankfurter rates synchronously, or null if missing/expired. */
export function peekFrankfurterRatesCache(base, quoteCodes, dateYmd = null) {
  const baseCode = String(base || "").trim().toUpperCase();
  const quotes = [...new Set(
    (quoteCodes || [])
      .map((c) => String(c || "").trim().toUpperCase())
      .filter((c) => c && c !== baseCode)
  )];
  if (!baseCode) return null;
  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }
  const key = cacheKey(baseCode, quotes, dateYmd);
  const cached = rateCache.get(key);
  if (!cached || cached.expires <= Date.now()) return null;
  return {
    rates: cached.rates,
    date: cached.date,
    unsupported: cached.unsupported || [],
  };
}

/**
 * Convert amount from `fromCode` into `baseCode` using base→quote rates.
 * rate[fromCode] = how many fromCode per 1 baseCode → amount_in_base = amount / rate
 */
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

export function sumConvertedEarnings(rows, baseCode, rates) {
  let total = 0;
  let hasMissing = false;
  for (const row of rows) {
    const converted = convertToBaseAmount(row.earnings, row.code, baseCode, rates);
    if (converted == null && String(row.code).toUpperCase() !== String(baseCode).toUpperCase()) {
      hasMissing = true;
      continue;
    }
    total += converted ?? 0;
  }
  return { total, hasMissing };
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

/** How many `baseCode` units equal 1 `fromCode` unit (Frankfurter base→quote rates). */
export function frankfurterUnitRate(fromCode, baseCode, rates) {
  const from = String(fromCode || "").trim().toUpperCase();
  const base = String(baseCode || "").trim().toUpperCase();
  if (!from || !base) return null;
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
  if (abs >= 100) return unitRate.toFixed(3);
  if (abs >= 1) return unitRate.toFixed(4);
  if (abs >= 0.01) return unitRate.toFixed(4);
  if (abs >= 0.0001) return unitRate.toFixed(5);
  return unitRate.toExponential(2);
}
