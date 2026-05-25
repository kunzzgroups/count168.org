import { useLayoutEffect } from "react";
import {
  clearFormatStyles,
  getFormatGridReady,
  getFormatPreviewHtml,
  setFormatGridReady,
  shouldRestoreFormatFromPreview,
  syncFormatPreviewFromDom,
  toggleTableDisplayForFormat,
} from "../format/dataCaptureFormat.js";
import { readInitialCaptureType } from "../lib/dataCaptureFormRules.js";

/**
 * Phase 5g: 2.Format display toggling + format grid ready bridges.
 */
export function useDataCaptureFormatDisplay() {
  useLayoutEffect(() => {
    if (readInitialFormatReady()) {
      setFormatGridReady(true);
    }

    window.__DC_TOGGLE_FORMAT_DISPLAY__ = toggleTableDisplayForFormat;
    window.__DC_CLEAR_FORMAT_STYLES__ = clearFormatStyles;
    window.__DC_SET_FORMAT_GRID_READY__ = setFormatGridReady;
    window.__DC_GET_FORMAT_GRID_READY__ = getFormatGridReady;
    window.__DC_SYNC_FORMAT_PREVIEW_FROM_DOM__ = syncFormatPreviewFromDom;

    return () => {
      if (window.__DC_TOGGLE_FORMAT_DISPLAY__ === toggleTableDisplayForFormat) {
        delete window.__DC_TOGGLE_FORMAT_DISPLAY__;
      }
      if (window.__DC_CLEAR_FORMAT_STYLES__ === clearFormatStyles) {
        delete window.__DC_CLEAR_FORMAT_STYLES__;
      }
      if (window.__DC_SET_FORMAT_GRID_READY__ === setFormatGridReady) {
        delete window.__DC_SET_FORMAT_GRID_READY__;
      }
      if (window.__DC_GET_FORMAT_GRID_READY__ === getFormatGridReady) {
        delete window.__DC_GET_FORMAT_GRID_READY__;
      }
      if (window.__DC_SYNC_FORMAT_PREVIEW_FROM_DOM__ === syncFormatPreviewFromDom) {
        delete window.__DC_SYNC_FORMAT_PREVIEW_FROM_DOM__;
      }
    };
  }, []);
}

function readInitialFormatReady() {
  if (readInitialCaptureType() !== "2.Format") return false;
  if (!shouldRestoreFormatFromPreview()) return false;
  return Boolean(getFormatPreviewHtml());
}
