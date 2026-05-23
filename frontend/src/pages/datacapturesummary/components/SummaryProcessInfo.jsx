import {
  formatSummaryProcessCurrency,
  formatSummaryProcessDescriptions,
} from "../lib/summaryTransform.js";

export default function SummaryProcessInfo({ t, processData, visible = true }) {
  if (!visible || !processData) return null;

  return (
    <div className="process-info-container" id="processInfoContainer">
      <div className="process-info-row">
        <div className="process-info-item">
          <span className="process-info-label">{t("date")}</span>
          <span className="process-info-value" id="processInfoDate">
            {processData.date || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("process")}</span>
          <span className="process-info-value" id="processInfoProcess">
            {processData.processName || processData.process || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("description")}</span>
          <span className="process-info-value" id="processInfoDescription">
            {formatSummaryProcessDescriptions(processData)}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("currency")}</span>
          <span className="process-info-value" id="processInfoCurrency">
            {formatSummaryProcessCurrency(processData)}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("remark")}</span>
          <span className="process-info-value" id="processInfoRemark">
            {processData.remark || "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
