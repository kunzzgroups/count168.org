import { fetchAutoRenewApprovals } from "./autoRenewLogic.js";

const cache = new Map();

function cacheKey(status, dateFrom, dateTo) {
  return `${status}|${dateFrom || ""}|${dateTo || ""}`;
}

/** Read warm list payload from sidebar hover prefetch (same shape as fetchAutoRenewApprovals). */
export function consumeAutoRenewPrefetch(status, { dateFrom, dateTo } = {}) {
  const key = cacheKey(status, dateFrom, dateTo);
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  return hit;
}

export function stashAutoRenewPrefetch(status, range, data) {
  cache.set(cacheKey(status, range?.dateFrom, range?.dateTo), data);
}

export async function prefetchAutoRenewApprovals(status = "pending", range = {}) {
  const key = cacheKey(status, range.dateFrom, range.dateTo);
  if (cache.has(key)) return cache.get(key);
  const data = await fetchAutoRenewApprovals(status, range);
  cache.set(key, data);
  return data;
}
