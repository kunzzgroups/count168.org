import { useLayoutEffect, useRef } from "react";
import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "../paste/vendors/dataCaptureCitibetParsers.js";
import { handleCellPasteEvent } from "../paste/core/dataCapturePasteHandler.js";
import { handleGenericPaste } from "../paste/core/dataCaptureGenericPaste.js";
import { parseAndFillHtmlTableForText } from "../paste/core/dataCaptureTextHtmlPaste.js";
import { detectHtmlTableInClipboard } from "../paste/core/dataCaptureClipboard.js";
import { parseAndFillHtmlTableForWbet,
  parseAndFillHtmlTableForWbetApi,
} from "../paste/vendors/dataCaptureWbetHtmlPaste.js";
import { parseAndFillHTMLTable } from "../paste/core/dataCaptureParseGenericHtml.js";

/**
 * Phase 4+: Paste orchestration fully in React (no js/datacapture.js).
 */
export function useDataCapturePaste() {
  const handlerRef = useRef(handleCellPasteEvent);
  handlerRef.current = handleCellPasteEvent;

  useLayoutEffect(() => {
    window.__DC_HANDLE_CELL_PASTE__ = (e) => handlerRef.current(e);

    window.__DC_PARSE_CITIBET_MAJOR__ = parseCitibetMajorPaymentReport;
    window.__DC_PARSE_CITIBET_PAYMENT__ = parseCitibetPaymentReport;
    window.__DC_PARSE_CITIBET_FORMAT__ = parseCitibetFormatBasedPaste;
    window.__DC_PARSE_HTML_TEXT__ = parseAndFillHtmlTableForText;
    window.__DC_DETECT_HTML_TABLE__ = detectHtmlTableInClipboard;
    window.__DC_PARSE_HTML_WBET__ = parseAndFillHtmlTableForWbet;
    window.__DC_PARSE_HTML_WBET_API__ = parseAndFillHtmlTableForWbetApi;
    window.__DC_HANDLE_GENERIC_PASTE__ = handleGenericPaste;
    window.__DC_PARSE_GENERIC_HTML__ = parseAndFillHTMLTable;

    return () => {
      delete window.__DC_HANDLE_CELL_PASTE__;
      delete window.__DC_PARSE_CITIBET_MAJOR__;
      delete window.__DC_PARSE_CITIBET_PAYMENT__;
      delete window.__DC_PARSE_CITIBET_FORMAT__;
      delete window.__DC_PARSE_HTML_TEXT__;
      delete window.__DC_DETECT_HTML_TABLE__;
      delete window.__DC_PARSE_HTML_WBET__;
      delete window.__DC_PARSE_HTML_WBET_API__;
      delete window.__DC_HANDLE_GENERIC_PASTE__;
      delete window.__DC_PARSE_GENERIC_HTML__;
    };
  }, []);
}
