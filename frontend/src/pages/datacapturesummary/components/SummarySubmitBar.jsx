import { assetUrl } from "../../../utils/core/apiUrl.js";

export default function SummarySubmitBar({
  t,
  submitting = false,
  onSubmit,
  onBack,
  onRefresh,
}) {
  return (
    <div className="summary-submit-container" id="summarySubmitContainer" style={{ display: "none" }}>
      <button
        type="button"
        className="btn btn-save"
        id="summarySubmitBtn"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("submit")}
      </button>
      <button type="button" className="btn btn-cancel" onClick={onBack}>
        {t("back")}
      </button>
      <button type="button" className="btn btn-refresh" onClick={onRefresh} title={t("refreshPage")}>
        <img
          src={assetUrl("images/refresh.svg")}
          alt={t("refresh")}
          style={{ width: "clamp(23px, 1.8vw, 35px)", height: "clamp(23px, 1.8vw, 35px)" }}
        />
      </button>
    </div>
  );
}
