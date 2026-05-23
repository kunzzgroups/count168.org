import { useEffect } from "react";

/**
 * Idempotent legacy DOM bindings that must survive React re-renders.
 */
export function useSummaryLegacyChrome(scriptsReady) {
  useEffect(() => {
    if (!scriptsReady) return undefined;

    const rateInput = document.getElementById("rateInput");
    if (rateInput && rateInput.dataset.summaryRateBound !== "1") {
      rateInput.dataset.summaryRateBound = "1";
      rateInput.addEventListener("input", () => {
        window.recalculateAllRowsWithRate?.();
      });
    }

    return undefined;
  }, [scriptsReady]);
}
