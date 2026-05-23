import { buildApiUrl } from "../../../utils/core/apiUrl.js";

/** Avoid hanging when `load` already fired before listeners attach (SPA revisit / cache). */
export function loadSummaryScriptOnce(src, isAlreadyLoaded) {
  return new Promise((resolve, reject) => {
    const clean = src.split(/[?#]/)[0];
    const finish = (node) => {
      if (node) node.dataset.loaded = "1";
      resolve();
    };

    if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
      resolve();
      return;
    }

    const nodes = document.querySelectorAll("script[src]");
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const ns = n.getAttribute("src") || "";
      if (ns.split(/[?#]/)[0] !== clean) continue;
      if (n.dataset.loaded === "1") {
        resolve();
        return;
      }
      if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
        finish(n);
        return;
      }
      const onLoad = () => finish(n);
      const timeoutId = window.setTimeout(() => {
        n.removeEventListener("load", onLoad);
        if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
          finish(n);
          return;
        }
        n.remove();
        loadSummaryScriptOnce(src, isAlreadyLoaded).then(resolve).catch(reject);
      }, 10000);
      n.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeoutId);
          onLoad();
        },
        { once: true }
      );
      n.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
          n.remove();
          loadSummaryScriptOnce(src, isAlreadyLoaded).then(resolve).catch(reject);
        },
        { once: true }
      );
      queueMicrotask(() => {
        if (n.dataset.loaded === "1") return;
        if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) finish(n);
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => finish(s);
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export function areSummaryLegacyScriptsLoaded() {
  return (
    typeof window.Decimal !== "undefined" &&
    typeof window.MoneyDecimal !== "undefined" &&
    typeof window.initDataCaptureSummaryPage === "function"
  );
}

/** Bump when js/datacapturesummary.js changes so browsers fetch the latest legacy bundle. */
const SUMMARY_LEGACY_SCRIPT_VERSION = "20260523-delete-i18n";

/** Load decimal + money + summary legacy bundle (parallel). */
export async function ensureSummaryLegacyScriptsLoaded() {
  if (areSummaryLegacyScriptsLoaded()) return;

  const summaryScriptUrl = `${buildApiUrl("js/datacapturesummary.js")}?v=${SUMMARY_LEGACY_SCRIPT_VERSION}`;

  await Promise.all([
    loadSummaryScriptOnce(buildApiUrl("js/decimal.min.js"), () => typeof window.Decimal !== "undefined"),
    loadSummaryScriptOnce(buildApiUrl("js/money-decimal.js"), () => typeof window.MoneyDecimal !== "undefined"),
    loadSummaryScriptOnce(
      summaryScriptUrl,
      () => typeof window.initDataCaptureSummaryPage === "function"
    ),
  ]);
}

/** Fire-and-forget preload while user is still on Data Capture. */
export function preloadSummaryLegacyScriptsInBackground() {
  if (areSummaryLegacyScriptsLoaded()) return;
  void ensureSummaryLegacyScriptsLoaded().catch(() => {
    /* optional warm cache */
  });
}
