import {
  getClipboardPlainText,
  isTypingModeCell,
  resolvePasteCell,
  resolvePastePlainTextForStructuredParsers,
  resolveReturnPastePlainText,
} from "./dataCaptureClipboard.js";
import {
  autoDetectCaptureTypeFromPaste,
  parseCitibetPasteData,
  pastedPlainTextLooksCitibet,
  pastedPlainTextLooksReturn,
} from "./dataCapturePasteDetect.js";
import { buildReturnPasteDataMatrix } from "./dataCaptureApiReturnParsers.js";
import { handleCitibetPaste } from "../vendors/dataCaptureCitibetPaste.js";
import { handleTextModePaste } from "./dataCaptureTextPaste.js";
import { handleFormatCellPaste } from "./dataCaptureFormatPasteHandler.js";
import { handleGenericPaste } from "./dataCaptureGenericPaste.js";
import { handle4ReturnPaste, handleApiReturnPaste } from "../vendors/dataCaptureReturnPaste.js";
import { handleVPowerPaste } from "../vendors/dataCaptureVPowerPaste.js";
import { handleAgentLinkPaste } from "../vendors/dataCaptureAgentLinkPaste.js";
import { handleWbetPaste } from "../vendors/dataCaptureWbetPaste.js";
import { handleWbetApiPaste } from "../vendors/dataCaptureWbetApiPaste.js";
import { handleInvoicePaste } from "../vendors/dataCaptureInvoicePaste.js";
import { handle2SpecialPaste } from "../vendors/dataCapture2SpecialPaste.js";
import { handle3ApiPaste } from "../vendors/dataCapture3ApiPaste.js";
import { handleAwcPaste } from "../vendors/dataCaptureAwcHandlerPaste.js";
import { handlePegasusPaste } from "../vendors/dataCapturePegasusPaste.js";
import { handleAlipayPaste } from "../vendors/dataCaptureAlipayPaste.js";
import { handleC8PlayPaste } from "../vendors/dataCaptureC8PlayPaste.js";
import { handleMaxbetPaste } from "../vendors/dataCaptureMaxbetPaste.js";

/** Capture types with dedicated paste handlers in React. */
export const TYPED_CAPTURE_TYPES = new Set([
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
  "INVOICE",
  "2.SPECIAL",
  "3.API",
  "AWC",
  "PEGASUS",
  "ALIPAY",
  "C8PLAY",
  "MAXBET",
]);

/** @deprecated use TYPED_CAPTURE_TYPES */
export const SPECIAL_CAPTURE_TYPES = TYPED_CAPTURE_TYPES;

/** @deprecated use TYPED_CAPTURE_TYPES */
export const MIGRATED_PASTE_TYPES = new Set([
  "1.Text",
  "2.Format",
  "CITIBET",
  ...TYPED_CAPTURE_TYPES,
]);

function setLegacyPasteContext(captureType, mode = "fallback") {
  window.__DC_LEGACY_PASTE_CTX__ = {
    captureType,
    mode,
    skipAutoDetect: true,
    skipPrimaryBlocks: true,
  };
}

function clearLegacyPasteContext() {
  delete window.__DC_LEGACY_PASTE_CTX__;
}

/**
 * Route typed capture paste to the matching handler.
 * @returns {boolean}
 */
export function handleTypedCapturePaste(e, pastedData, captureType) {
  switch (captureType) {
    case "API_RETURN":
      return handleApiReturnPaste(e, pastedData);
    case "4.RETURN":
      return handle4ReturnPaste(e, pastedData);
    case "VPOWER":
      return handleVPowerPaste(e, pastedData);
    case "AGENT_LINK":
      return handleAgentLinkPaste(e, pastedData);
    case "WBET":
      return handleWbetPaste(e, pastedData);
    case "WBET_API":
      return handleWbetApiPaste(e, pastedData);
    case "INVOICE":
      return handleInvoicePaste(e, pastedData);
    case "2.SPECIAL":
      return handle2SpecialPaste(e, pastedData);
    case "3.API":
      return handle3ApiPaste(e, pastedData);
    case "AWC":
      return handleAwcPaste(e, pastedData);
    case "PEGASUS":
      return handlePegasusPaste(e, pastedData);
    case "ALIPAY":
      return handleAlipayPaste(e, pastedData);
    case "C8PLAY":
      return handleC8PlayPaste(e, pastedData);
    case "MAXBET":
      return handleMaxbetPaste(e, pastedData);
    default:
      return false;
  }
}

/** @deprecated */
export function handleSpecialFormatPaste(e, pastedData, captureType) {
  return handleTypedCapturePaste(e, pastedData, captureType);
}

function getCaptureType() {
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") {
    return window.__DC_GET_CAPTURE_TYPE__() || "1.Text";
  }
  return "1.Text";
}

function applyCaptureType(nextType) {
  if (typeof window.__DC_APPLY_CAPTURE_TYPE__ === "function") {
    window.__DC_APPLY_CAPTURE_TYPE__(nextType);
  } else if (typeof window.applyDataCaptureType === "function") {
    window.applyDataCaptureType(nextType);
  }
}

function invokeGenericPasteFallback(e, pastedData) {
  setLegacyPasteContext(getCaptureType(), "fallback");
  try {
    return handleGenericPaste(e, pastedData);
  } finally {
    clearLegacyPasteContext();
  }
}

/**
 * Full paste orchestrator — all formats in React.
 */
export function handleCellPasteEvent(e) {
  const cell = resolvePasteCell(e.target);

  if (isTypingModeCell(cell)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  e.preventDefault();

  const canParseCitibet = (text) => Boolean(parseCitibetPasteData(text, "CITIBET")?.dataMatrix?.length);
  const canParseReturn = (text) =>
    pastedPlainTextLooksReturn(text) && Boolean(buildReturnPasteDataMatrix(text)?.dataMatrix?.length);
  const pastedData = resolvePastePlainTextForStructuredParsers(
    e,
    (text) => canParseCitibet(text) || canParseReturn(text),
  );
  const clipboard = e.clipboardData || window.clipboardData;

  // Structured CITIBET layout must win over raw Text/Format paste (same as manual 3.CITIBET).
  const citibetParsed = parseCitibetPasteData(pastedData, "CITIBET");
  if (citibetParsed?.dataMatrix?.length) {
    applyCaptureType("CITIBET");
    if (handleCitibetPaste(e, pastedData, cell, "CITIBET", citibetParsed)) return;
  }

  const returnPlain = resolveReturnPastePlainText(e, (text) => canParseReturn(text));
  if (
    !pastedPlainTextLooksCitibet(returnPlain) &&
    pastedPlainTextLooksReturn(returnPlain) &&
    canParseReturn(returnPlain)
  ) {
    applyCaptureType("4.RETURN");
    if (handle4ReturnPaste(e, returnPlain)) return;
  }

  applyCaptureType(autoDetectCaptureTypeFromPaste(pastedData, clipboard));

  const captureType = getCaptureType();

  if (captureType === "2.Format") {
    if (handleFormatCellPaste(e, pastedData)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (TYPED_CAPTURE_TYPES.has(captureType)) {
    if (handleTypedCapturePaste(e, pastedData, captureType)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (captureType === "1.Text") {
    if (handleTextModePaste(e, pastedData, cell)) return;
  }

  if (captureType === "CITIBET") {
    const fallbackCitibet = parseCitibetPasteData(pastedData, "CITIBET");
    if (fallbackCitibet && handleCitibetPaste(e, pastedData, cell, "CITIBET", fallbackCitibet)) {
      return;
    }
  }

  invokeGenericPasteFallback(e, pastedData);
}
