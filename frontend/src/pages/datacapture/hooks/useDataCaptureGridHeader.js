import { useLayoutEffect } from "react";
import {
  attachColumnHeaderListeners,
  attachRowHeaderListeners,
  rebindColumnHeadersAfterMutation,
  rebindRowHeadersAfterMutation,
} from "../grid/dataCaptureGridHeaderBinding.js";

/** CITIBET column fix — legacy disabled (early return); kept for bridge parity. */
function fixCitibetAmountColumns() {
  /* no-op: preserve pasted format on submit */
}

/** Phase 5h: grid header attach/rebind + CITIBET fix bridge. */
export function useDataCaptureGridHeader() {
  useLayoutEffect(() => {
    window.__DC_GRID_ATTACH_COLUMN_HEADER__ = attachColumnHeaderListeners;
    window.__DC_GRID_ATTACH_ROW_HEADER__ = attachRowHeaderListeners;
    window.__DC_GRID_REBIND_COLUMN_HEADERS__ = rebindColumnHeadersAfterMutation;
    window.__DC_GRID_REBIND_ROW_HEADERS__ = rebindRowHeadersAfterMutation;
    window.__DC_FIX_CITIBET_AMOUNTS__ = fixCitibetAmountColumns;

    return () => {
      if (window.__DC_GRID_ATTACH_COLUMN_HEADER__ === attachColumnHeaderListeners) {
        delete window.__DC_GRID_ATTACH_COLUMN_HEADER__;
      }
      if (window.__DC_GRID_ATTACH_ROW_HEADER__ === attachRowHeaderListeners) {
        delete window.__DC_GRID_ATTACH_ROW_HEADER__;
      }
      if (window.__DC_GRID_REBIND_COLUMN_HEADERS__ === rebindColumnHeadersAfterMutation) {
        delete window.__DC_GRID_REBIND_COLUMN_HEADERS__;
      }
      if (window.__DC_GRID_REBIND_ROW_HEADERS__ === rebindRowHeadersAfterMutation) {
        delete window.__DC_GRID_REBIND_ROW_HEADERS__;
      }
      if (window.__DC_FIX_CITIBET_AMOUNTS__ === fixCitibetAmountColumns) {
        delete window.__DC_FIX_CITIBET_AMOUNTS__;
      }
    };
  }, []);
}
