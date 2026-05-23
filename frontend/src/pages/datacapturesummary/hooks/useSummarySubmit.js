import { useCallback, useEffect, useRef, useState } from "react";
import { readCaptureSessionFromStorage } from "../lib/summaryStorage.js";
import { validateSummarySubmitTotal } from "../submit/summarySubmitValidation.js";
import { prepareSummarySubmitCollection } from "../submit/summarySubmitRowCollection.js";
import { executeSummarySubmit } from "../submit/summarySubmitExecution.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";

/**
 * Phase 7: React-owned Summary Submit orchestration.
 */
export function useSummarySubmit({ companyId, scriptsReady, onSuccess, mutationsBlocked = false, t }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const setSubmitting = useCallback((active) => {
    setIsSubmitting(!!active);
    window.__SUMMARY_REACT_ON_SUBMITTING_CHANGE__?.(!!active);
  }, []);

  const submitSummary = useCallback(async () => {
    if (mutationsBlocked) {
      pushSummaryNotification("Error", t("readOnlyBlocked"), "error");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);

    try {
      const totalValidation = validateSummarySubmitTotal();
      if (!totalValidation.ok) {
        pushSummaryNotification(
          "Error",
          totalValidation.message || t("totalValidationFailed"),
          "error"
        );
        return;
      }

      const session = readCaptureSessionFromStorage();
      if (!session?.processData) {
        pushSummaryNotification(
          "Error",
          t("noProcessData"),
          "error"
        );
        return;
      }

      const prep = await prepareSummarySubmitCollection(session.processData);
      if (!prep.ok) {
        pushSummaryNotification(
          prep.warning ? "Warning" : "Error",
          prep.message || t("prepareRowsFailed"),
          "error"
        );
        return;
      }

      const result = await executeSummarySubmit({
        companyId,
        parsedProcessData: session.processData,
        summaryRows: prep.rows,
        onProgress: ({ batchNumber, totalBatches }) => {
          window.__SUMMARY_REACT_ON_SUBMIT_PROGRESS__?.({ batchNumber, totalBatches });
        },
        onSuccess: () => {
          onSuccessRef.current?.();
        },
      });

      if (!result.ok) {
        pushSummaryNotification("Error", result.message || t("submissionFailed"), "error");
      }
    } catch (error) {
      console.error("Summary submit failed:", error);
      let errorMessage = error?.message || String(error);
      if (/JSON|Unexpected token/i.test(errorMessage)) {
        errorMessage =
          "The server returned an invalid response. This may be due to the data size exceeding the server limit (PHP post_max_size). Please reduce the number of rows submitted or contact the administrator.";
      }
      pushSummaryNotification("Error", `${t("submissionFailed")} ${errorMessage}`, "error");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }, [companyId, setSubmitting, mutationsBlocked, t]);

  useEffect(() => {
    if (!scriptsReady) return undefined;

    window.__SUMMARY_REACT_PREPARE_SUBMIT_COLLECTION__ = prepareSummarySubmitCollection;
    window.__SUMMARY_REACT_EXECUTE_SUBMIT__ = submitSummary;

    return () => {
      delete window.__SUMMARY_REACT_PREPARE_SUBMIT_COLLECTION__;
      delete window.__SUMMARY_REACT_EXECUTE_SUBMIT__;
    };
  }, [scriptsReady, submitSummary]);

  return { submitSummary, isSubmitting };
}
