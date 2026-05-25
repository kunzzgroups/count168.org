import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSummaryServerState } from "../lib/summaryApi.js";
import { summaryQueryKeys } from "../lib/summaryQueryKeys.js";
import {
  applyTransformationsToTableData,
  parseSummaryProcessMeta,
} from "../lib/summaryTransform.js";
import {
  clearStaleCaptureIdForFreshRound,
  isSummaryFreshFromCapture,
  readCaptureSessionFromStorage,
} from "../lib/summaryStorage.js";

/**
 * Phase 1: React owns capture-session read + server state prefetch.
 * Legacy script still renders the table; globals are hydrated before init.
 */
export function useSummaryCaptureBootstrap({ companyId, searchParams, enabled }) {
  const freshFromCapture = isSummaryFreshFromCapture(searchParams);
  /** Sticky for this mount — URL ?success=1 is stripped after toast, must not flip hydrate mid-populate. */
  const freshPinnedRef = useRef(false);
  if (freshFromCapture) {
    freshPinnedRef.current = true;
  }
  const isFreshCaptureRound = freshPinnedRef.current;

  const captureSession = useMemo(() => {
    if (!enabled) return null;
    return readCaptureSessionFromStorage();
  }, [enabled]);

  const transformed = useMemo(() => {
    if (!captureSession) return null;
    const { processData, tableData } = captureSession;
    return applyTransformationsToTableData(
      tableData,
      processData.removeWord,
      processData.replaceWordFrom,
      processData.replaceWordTo
    );
  }, [captureSession]);

  const { processId, processCode, processData } = useMemo(
    () => parseSummaryProcessMeta(captureSession?.processData ?? null),
    [captureSession]
  );

  const serverStateQueryEnabled =
    enabled &&
    !!captureSession &&
    !isFreshCaptureRound &&
    (processId != null || !!processCode);

  const serverStateQuery = useQuery({
    queryKey: summaryQueryKeys.serverState(companyId, processId, processCode),
    queryFn: ({ signal }) =>
      fetchSummaryServerState({ companyId, processId, processCode, signal }),
    enabled: serverStateQueryEnabled,
    staleTime: 0,
  });

  const hasCaptureData = !!captureSession && !!transformed && !!processData;

  /** Call immediately before legacy initDataCaptureSummaryPage(). */
  function hydrateLegacyGlobals() {
    if (isFreshCaptureRound) {
      clearStaleCaptureIdForFreshRound();
      window.DATACAPTURESUMMARY_CAPTURE_ID = null;
    }

    window.__summaryFreshFromCapture = isFreshCaptureRound;

    if (companyId != null) {
      window.DATACAPTURESUMMARY_COMPANY_ID = companyId;
    }

    if (!hasCaptureData) {
      window.capturedProcessData = null;
      window.transformedTableData = null;
      window.currentProcessId = null;
      window.currentProcessCode = null;
      window._summaryStateFromServer = null;
      return;
    }

    window.capturedProcessData = processData;
    window.transformedTableData = transformed;
    window.currentProcessId = processId;
    window.currentProcessCode = processCode;
    window._summaryStateFromServer = serverStateQuery.data ?? null;
  }

  return {
    freshFromCapture: isFreshCaptureRound,
    hasCaptureData,
    processData,
    transformedTableData: transformed,
    processId,
    processCode,
    serverState: serverStateQuery.data ?? null,
    serverStateLoading: serverStateQuery.isLoading,
    serverStateQueryEnabled,
    hydrateLegacyGlobals,
  };
}
