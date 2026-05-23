import DataCaptureGrid from "./DataCaptureGrid.jsx";
import { CAPTURE_TYPE_OPTIONS } from "../lib/dataCaptureFormRules.js";

function captureTypeLabel(opt, t) {
  if (opt === "1.Text") return t("captureTypeText");
  if (opt === "2.Format") return t("captureTypeFormat");
  if (opt === "CITIBET") return t("captureTypeCitibet");
  if (opt === "4.RETURN") return t("captureTypeReturn");
  return opt;
}

function captureTypeCssKey(opt) {
  if (opt === "1.Text") return "text";
  if (opt === "2.Format") return "format";
  if (opt === "CITIBET") return "citibet";
  if (opt === "4.RETURN") return "return";
  return "text";
}

/**
 * Bottom section: capture type, grid, submit.
 */
export default function DataCaptureTableSection({
  t,
  captureType,
  citibetMode = false,
  formatGridReady = false,
  tableHasData = false,
  onCaptureTypeChange,
  submitDisabled = true,
  onSubmit,
  onReset,
}) {
  const showFormatPasteHint = captureType === "2.Format" && !formatGridReady && tableHasData;
  const showTypeBadge = tableHasData;

  return (
    <div className="bottom-section">
      <div className={`excel-table-container${citibetMode ? " citibet-mode" : ""}`}>
        <div className="excel-table-header dc-table-header-bar">
          <div className="dc-table-header-main">
            <span className="dc-table-header-title">{t("dataCaptureTable")}</span>
            {showTypeBadge ? (
              <span
                className={`dc-capture-type-badge dc-capture-type-badge--${captureTypeCssKey(captureType)}`}
                aria-live="polite"
              >
                {captureTypeLabel(captureType, t)}
              </span>
            ) : (
              <span className="dc-capture-type-hint">{t("captureTypeAutoDetectHint")}</span>
            )}
            {showFormatPasteHint ? (
              <span className="dc-format-paste-hint">{t("pasteFormattedTableHint")}</span>
            ) : null}
          </div>
          <div className="dc-table-header-controls">
            <select
              id="dataCaptureTypeSelector"
              className="data-capture-type-selector data-capture-type-selector--sr-only"
              value={captureType}
              onChange={onCaptureTypeChange}
              aria-label={t("captureFormatAria")}
              tabIndex={-1}
            >
              {CAPTURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {captureTypeLabel(opt, t)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-cancel" onClick={() => (onReset ? onReset() : window.resetForm?.())}>
              {t("reset")}
            </button>
          </div>
        </div>
        <DataCaptureGrid />
      </div>

      <div className="form-actions">
        <button
          id="dataCaptureSubmitBtn"
          type="button"
          className="btn btn-save"
          disabled={submitDisabled}
          style={{
            opacity: submitDisabled ? 0.6 : 1,
            cursor: submitDisabled ? "not-allowed" : "pointer",
          }}
          onClick={() => {
            if (onSubmit) {
              void onSubmit();
              return;
            }
            void window.submitDataCaptureForm?.();
          }}
        >
          {t("submit")}
        </button>
      </div>
    </div>
  );
}
