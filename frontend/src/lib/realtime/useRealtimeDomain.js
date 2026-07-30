import { useEffect, useRef } from "react";
import { onRealtimeInvalidate } from "./realtimeEvents.js";

/**
 * Run handler when the app SSE bus invalidates matching domain(s).
 * Debounced 200ms (same as TX ledger sync).
 *
 * @param {string|string[]} domains
 * @param {(detail: object) => void} onInvalidate
 * @param {{ enabled?: boolean }} [opts]
 */
export function useRealtimeDomain(domains, onInvalidate, { enabled = true } = {}) {
  const handlerRef = useRef(onInvalidate);
  handlerRef.current = onInvalidate;

  useEffect(() => {
    if (!enabled) return undefined;
    let debounceTimer = null;

    const unsub = onRealtimeInvalidate(domains, (detail) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (document.visibilityState !== "visible") return;
        handlerRef.current?.(detail);
      }, 200);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [enabled, Array.isArray(domains) ? domains.join("|") : String(domains || "")]);
}
