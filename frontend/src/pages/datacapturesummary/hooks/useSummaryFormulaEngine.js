import { useEffect } from "react";
import {
  registerSummaryFormulaEngineShims,
  unregisterSummaryFormulaEngineShims,
} from "../formula/summaryFormulaEngineBridge.js";

/**
 * Phase 9: React-owned formula parse/evaluate utilities (legacy delegates via window bridges).
 */
export function useSummaryFormulaEngine() {
  useEffect(() => {
    registerSummaryFormulaEngineShims();
    return () => {
      unregisterSummaryFormulaEngineShims();
    };
  }, []);
}
