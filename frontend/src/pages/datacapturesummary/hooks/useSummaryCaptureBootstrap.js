import { useEffect, useMemo, useRef } from "react";
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
  loadSummaryCaptureSession,
} from "../lib/summaryStorage.js";
import { clearSuppressedRowKeys } from "../lib/summarySuppressedRows.js";

/** Capture session read + optional server state prefetch for pure React Summary. */
export function useSummaryCaptureBootstrap({ captureScope, companyId, searchParams, enabled }) {
  const freshFromCapture = isSummaryFreshFromCapture(searchParams);
  /** Sticky for this mount — URL ?success=1 is stripped after toast, must not flip mid-populate. */
  const freshPinnedRef = useRef(false);
  if (freshFromCapture) {
    freshPinnedRef.current = true;
  }
  const isFreshCaptureRound = freshPinnedRef.current;

  useEffect(() => {
    if (isFreshCaptureRound) {
      clearStaleCaptureIdForFreshRound();
      clearSuppressedRowKeys();
    }
  }, [isFreshCaptureRound]);

  const captureSession = useMemo(() => {
    if (!enabled) return null;
    const session = loadSummaryCaptureSession(captureScope);
    if (!session?.tableData || !session?.processData) return null;
    return {
      tableData: session.tableData,
      processData: session.processData,
    };
  }, [enabled, captureScope]);

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
      fetchSummaryServerState({ captureScope, processId, processCode, signal }),
    enabled: serverStateQueryEnabled,
    staleTime: 0,
  });

  const hasCaptureData = !!captureSession && !!transformed && !!processData;

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
  };
}
