import { useEffect, useLayoutEffect } from "react";
import { parseAndFillHtmlTableForFormat } from "../paste/core/dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  renderFormatPreview,
  sanitizePastedHTML,
} from "../paste/core/dataCaptureFormatPreview.js";
import {
  handleFormatPasteAreaEvent,
  handleFormatPasteFromClipboard,
  handleGlobalFormatPaste,
  processFormatTableHtml,
  processFormatTsv,
} from "../paste/core/dataCaptureFormatPasteHandler.js";

/**
 * Phase 4c: 2.Format paste area + global table-paste intercept in React.
 */
export function useDataCaptureFormatPaste() {
  useLayoutEffect(() => {
    window.__DC_PARSE_HTML_FORMAT__ = parseAndFillHtmlTableForFormat;
    window.__DC_RENDER_FORMAT_PREVIEW__ = renderFormatPreview;
    window.__DC_BUILD_FORMAT_PREVIEW__ = buildFormatPreviewFragmentFromClipboardHtml;
    window.__DC_SANITIZE_PASTED_HTML__ = sanitizePastedHTML;
    window.__DC_PROCESS_FORMAT_HTML__ = processFormatTableHtml;
    window.__DC_PROCESS_FORMAT_TSV__ = processFormatTsv;
    window.__DC_HANDLE_FORMAT_CLIPBOARD__ = handleFormatPasteFromClipboard;
    window.__DC_INIT_FORMAT_PASTE__ = () => {};

    return () => {
      delete window.__DC_PARSE_HTML_FORMAT__;
      delete window.__DC_BUILD_FORMAT_PREVIEW__;
      delete window.__DC_SANITIZE_PASTED_HTML__;
      delete window.__DC_PROCESS_FORMAT_HTML__;
      delete window.__DC_PROCESS_FORMAT_TSV__;
      delete window.__DC_HANDLE_FORMAT_CLIPBOARD__;
      delete window.__DC_INIT_FORMAT_PASTE__;
    };
  }, []);

  useEffect(() => {
    const area = document.getElementById("pasteAreaFormat");
    if (!area) return undefined;

    const onAreaPaste = (e) => handleFormatPasteAreaEvent(e);
    area.addEventListener("paste", onAreaPaste);

    const onGlobalPaste = (e) => handleGlobalFormatPaste(e);
    document.addEventListener("paste", onGlobalPaste);

    return () => {
      area.removeEventListener("paste", onAreaPaste);
      document.removeEventListener("paste", onGlobalPaste);
    };
  }, []);
}
