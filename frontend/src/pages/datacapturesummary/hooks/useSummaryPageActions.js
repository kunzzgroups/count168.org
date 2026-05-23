import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildSummaryRestoreCapturePath,
  buildSummarySubmittedCapturePath,
  clearSummarySessionAfterSubmit,
  runLegacyRateBatchSubmit,
  runLegacyRateSelectAll,
  saveSummaryRefreshState,
} from "../lib/summaryPageActions.js";
import { requestSummaryDeleteConfirmation } from "../lib/summaryDeleteFlow.js";
import { syncSummaryDeleteButtonLabel } from "../lib/summaryDeleteButtonLabel.js";
import { useSummarySubmit } from "./useSummarySubmit.js";

/**
 * Phase 4/7: React owns page chrome actions; Submit orchestration in useSummarySubmit.
 */
export function useSummaryPageActions({ companyId, scriptsReady, mutationsBlocked = false, t }) {
  const navigate = useNavigate();
  const rateSelectAllRef = useRef(null);
  const handleRefreshRef = useRef(async () => {});

  const [rateInput, setRateInput] = useState("");
  const [rateSelectAllLabel, setRateSelectAllLabel] = useState(() => t("selectAll"));
  const [deleteCount, setDeleteCount] = useState(0);

  useEffect(() => {
    setRateSelectAllLabel(t("selectAll"));
    const btn = rateSelectAllRef.current;
    if (btn) {
      btn.textContent = t("selectAll");
      btn.dataset.rateSelectMode = "all";
    }
  }, [t]);

  const navigateBack = useCallback(() => {
    saveSummaryRefreshState();
    window.isNavigatingAwayByBackOrSubmit = true;
    navigate(buildSummaryRestoreCapturePath(companyId), { replace: true });
  }, [navigate, companyId]);

  const navigateAfterSubmitSuccess = useCallback(() => {
    clearSummarySessionAfterSubmit();
    navigate(buildSummarySubmittedCapturePath(companyId), { replace: true });
  }, [navigate, companyId]);

  const { submitSummary, isSubmitting } = useSummarySubmit({
    companyId,
    scriptsReady,
    mutationsBlocked,
    onSuccess: navigateAfterSubmitSuccess,
    t,
  });

  const syncDeleteButtonLabel = useCallback(
    (countOverride) => {
      const count = syncSummaryDeleteButtonLabel(t, countOverride);
      setDeleteCount(count);
      return count;
    },
    [t]
  );

  useLayoutEffect(() => {
    if (!scriptsReady) return undefined;

    window.__SUMMARY_REACT_NAV_BACK__ = navigateBack;
    window.__SUMMARY_REACT_REFRESH__ = () => {
      handleRefreshRef.current?.();
    };
    window.__SUMMARY_SYNC_DELETE_BUTTON_LABEL__ = syncDeleteButtonLabel;
    window.__SUMMARY_REACT_ON_DELETE_SELECTION_CHANGE__ = (count) => {
      syncDeleteButtonLabel(count);
    };
    window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__ = (label) => {
      const norm = String(label || "").trim();
      if (norm === "Select All" || norm === t("selectAll")) {
        setRateSelectAllLabel(t("selectAll"));
        if (rateSelectAllRef.current) rateSelectAllRef.current.dataset.rateSelectMode = "all";
        return;
      }
      if (norm === "Clear All" || norm === t("clearAll")) {
        setRateSelectAllLabel(t("clearAll"));
        if (rateSelectAllRef.current) rateSelectAllRef.current.dataset.rateSelectMode = "clear";
      }
    };
    window.__SUMMARY_REACT_ON_SUBMIT_SUCCESS__ = navigateAfterSubmitSuccess;

    syncDeleteButtonLabel();

    return () => {
      delete window.__SUMMARY_REACT_NAV_BACK__;
      delete window.__SUMMARY_REACT_REFRESH__;
      delete window.__SUMMARY_REACT_ON_DELETE_SELECTION_CHANGE__;
      delete window.__SUMMARY_SYNC_DELETE_BUTTON_LABEL__;
      delete window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__;
      delete window.__SUMMARY_REACT_ON_SUBMIT_SUCCESS__;
    };
  }, [scriptsReady, navigateBack, navigateAfterSubmitSuccess, t, syncDeleteButtonLabel]);

  const handleBack = useCallback(() => {
    navigateBack();
  }, [navigateBack]);

  const handleRefresh = useCallback(async () => {
    // Save draft Rate/Formula before reload so Refresh retains edits prior to final Submit.
    saveSummaryRefreshState();
    if (
      window.__SUMMARY_REACT_TABLE__ &&
      typeof window.__SUMMARY_REACT_ON_TABLE_READY__ === "function"
    ) {
      try {
        window.__SUMMARY_REACT_SET_POPULATING__?.(true);
        await window.__SUMMARY_REACT_ON_TABLE_READY__({ reset: true });
        return;
      } catch (error) {
        console.warn("Soft summary refresh failed, falling back to reload:", error);
      }
    }
    window.location.reload();
  }, []);

  handleRefreshRef.current = handleRefresh;

  const handleRateBatchSubmit = useCallback(() => {
    runLegacyRateBatchSubmit();
  }, []);

  const handleToggleRateSelectAll = useCallback(() => {
    const btn = rateSelectAllRef.current;
    if (!btn) return;
    runLegacyRateSelectAll(btn);
    if (window.__SUMMARY_REACT_TABLE__ && typeof window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__ === "function") {
      return;
    }
    setRateSelectAllLabel(btn.textContent.trim() || t("selectAll"));
  }, [t]);

  const handleDeleteSelected = useCallback(() => {
    requestSummaryDeleteConfirmation({ t });
  }, [t]);

  const handleSubmitSummary = useCallback(() => {
    submitSummary();
  }, [submitSummary]);

  return {
    rateInput,
    setRateInput,
    rateSelectAllLabel,
    rateSelectAllRef,
    deleteCount,
    deleteDisabled: deleteCount <= 0,
    submitting: isSubmitting,
    handleBack,
    handleRefresh,
    handleRateBatchSubmit,
    handleToggleRateSelectAll,
    handleDeleteSelected,
    handleSubmitSummary,
  };
}
