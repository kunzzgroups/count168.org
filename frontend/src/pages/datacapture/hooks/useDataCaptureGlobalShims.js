import { useLayoutEffect, useRef } from "react";
import { unsetWindowProperty } from "../../../utils/core/unsetWindowProperty.js";
import { initDataCaptureSpaPage } from "../lib/dataCaptureSpaInit.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";

/**
 * Global shims so migrated paste/CRUD code works without js/datacapture.js.
 * Includes SPA page init bridge (formerly useDataCaptureSpaInit).
 */
export function useDataCaptureGlobalShims() {
  const initRef = useRef(initDataCaptureSpaPage);
  initRef.current = initDataCaptureSpaPage;

  useLayoutEffect(() => {
    const resetForm = () => {
      window.__DC_RESET__?.();
    };

    const submitDataCaptureForm = () => {
      window.__DC_SUBMIT__?.();
    };

    window.showNotification = pushDataCaptureNotification;
    window.resetForm = resetForm;
    window.submitDataCaptureForm = submitDataCaptureForm;
    window.__DC_SPA_INIT_PAGE__ = () => initRef.current();

    return () => {
      unsetWindowProperty("showNotification", pushDataCaptureNotification);
      unsetWindowProperty("resetForm", resetForm);
      unsetWindowProperty("submitDataCaptureForm", submitDataCaptureForm);
      delete window.__DC_SPA_INIT_PAGE__;
    };
  }, []);
}
