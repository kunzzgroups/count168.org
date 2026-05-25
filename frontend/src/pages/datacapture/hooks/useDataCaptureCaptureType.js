import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getFormatPreviewHtml } from "../format/dataCaptureFormat.js";
import {
  isCitibetCaptureType,
  normalizeCaptureType,
  readInitialCaptureType,
} from "../lib/dataCaptureFormRules.js";

/**
 * Phase 2: Capture type switching + 2.Format view orchestration in React.
 * Legacy still owns paste parsing, grid fill, and iframe srcdoc rendering.
 */
export function useDataCaptureCaptureType() {
  const [captureType, setCaptureType] = useState(readInitialCaptureType);
  const [formatGridReady, setFormatGridReady] = useState(() => {
    if (readInitialCaptureType() !== "2.Format") return false;
    return Boolean(getFormatPreviewHtml());
  });

  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  const citibetMode = isCitibetCaptureType(captureType);

  const applyCaptureType = useCallback((nextType) => {
    const t = normalizeCaptureType(nextType) || "1.Text";
    const previous = captureTypeRef.current;

    setCaptureType(t);
    captureTypeRef.current = t;

    const container = document.querySelector(".excel-table-container");
    if (container) {
      if (isCitibetCaptureType(t)) container.classList.add("citibet-mode");
      else container.classList.remove("citibet-mode");
    }

    if (t === "2.Format") {
      const previewHtml = getFormatPreviewHtml();
      const legacyReady =
        typeof window.__DC_GET_FORMAT_GRID_READY__ === "function"
          ? window.__DC_GET_FORMAT_GRID_READY__()
          : false;

      if (previewHtml) {
        window.__DC_RENDER_FORMAT_PREVIEW__?.(previewHtml);
        window.__DC_SET_FORMAT_GRID_READY__?.(true);
        setFormatGridReady(true);
      } else if (legacyReady) {
        setFormatGridReady(true);
      } else {
        window.__DC_SET_FORMAT_GRID_READY__?.(false);
        setFormatGridReady(false);
      }
    } else {
      window.__DC_SET_FORMAT_GRID_READY__?.(false);
      setFormatGridReady(false);
      if (previous === "2.Format") {
        window.__DC_CLEAR_FORMAT_STYLES__?.();
      }
    }

    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
  }, []);

  const handleCaptureTypeChange = useCallback(
    (e) => {
      applyCaptureType(e.target.value);
    },
    [applyCaptureType],
  );

  const handlersRef = useRef({});
  handlersRef.current = { applyCaptureType };

  useLayoutEffect(() => {
    window.__DC_APPLY_CAPTURE_TYPE__ = (t) => handlersRef.current.applyCaptureType(t);
    window.__DC_GET_CAPTURE_TYPE__ = () => captureTypeRef.current;
    window.__DC_ON_FORMAT_GRID_READY__ = (ready) => setFormatGridReady(Boolean(ready));
    window.__DC_ON_CAPTURE_TYPE_APPLIED__ = (t) => {
      const s = normalizeCaptureType(t) || "1.Text";
      setCaptureType(s);
      captureTypeRef.current = s;
    };

    return () => {
      delete window.__DC_APPLY_CAPTURE_TYPE__;
      delete window.__DC_GET_CAPTURE_TYPE__;
      delete window.__DC_ON_FORMAT_GRID_READY__;
      delete window.__DC_ON_CAPTURE_TYPE_APPLIED__;
    };
  }, []);

  useLayoutEffect(() => {
    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  }, [captureType, formatGridReady]);

  return {
    captureType,
    citibetMode,
    formatGridReady,
    applyCaptureType,
    handleCaptureTypeChange,
  };
}
