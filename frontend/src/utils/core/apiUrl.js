export function buildApiUrl(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const base = window.location.origin + basePath;
  return new URL(pathAndQuery, base).href;
}

/** In-app route path (respects subdirectory deploy). */
export function buildSpaPath(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const url = new URL(String(pathAndQuery || "").replace(/^\//, ""), window.location.origin + basePath);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Static assets (css/js) under Vite base URL / asset folder — stable across SPA routes. */
export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  if (clean.startsWith("images/")) {
    return new URL(`/${clean}`, window.location.origin).href;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL != null && import.meta.env.BASE_URL !== "") {
      const baseHref = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      return new URL(clean, baseHref).href;
    }
  } catch {
    /* fall through */
  }
  const entryScript = document.querySelector('script[type="module"][src*="/assets/"]');
  const src = entryScript?.getAttribute("src");
  if (src) {
    try {
      const pathname = new URL(src, window.location.origin).pathname;
      const marker = "/assets/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const assetBasePath = pathname.slice(0, markerIndex + 1);
        return new URL(`${assetBasePath}${clean}`, window.location.origin).href;
      }
    } catch {
      /* Fallback to legacy path resolution. */
    }
  }
  return buildApiUrl(clean);
}
