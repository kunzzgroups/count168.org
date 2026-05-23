import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { formatDomainFeeEdit2 } from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Fee Settings Modal — Price setting for domain list
 * Props:
 *   onClose()
 *   onFeeSaved(data) — called after successful save with { price }
 */
/** Overlay z：与 DomainFormModal 同源内联写法，防止生产包 Tailwind arbitrary 失效时整块遮罩掉到侧栏下层，表现为「点了 Price 无反应」 */
const FEE_MODAL_OVERLAY_Z = 2147482998;

export default function DomainFeeModal({ onClose, onFeeSaved, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [price, setPrice] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_domain_fee_settings" }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const p2 = formatDomainFeeEdit2(res.data.price);
          setSummary(t("feeSummary", { price: p2 }));
          setPrice(formatDomainFeeEdit2(res.data.price));
        } else {
          showDomainAlert(res.message || t("couldNotLoadSettings"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("couldNotLoadSettings"), "danger"));
  }, [lang]);

  function handleSave() {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_domain_fee_settings", price }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          showDomainAlert(res.message || t("saved"));
          if (res.data) onFeeSaved(res.data);
          onClose();
        } else {
          showDomainAlert(res.message || t("saveFailed"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("saveFailed"), "danger"));
  }

  return (
    <DomainModalPortal>
      <div
        className="domain-fee-react-overlay"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: FEE_MODAL_OVERLAY_Z,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="domain-fee-react-modal modal-content">
        <div className="modal-header domain-fee-modal-header">
          <h2>{t("price")}</h2>
          <button type="button" className="account-close" onClick={onClose} aria-label="Close" />
        </div>
        <div className="modal-body">
          <p className="domain-fee-description">
            {t("priceDescription")}
          </p>
          <div id="domainFeeSummaryDisplay" className="domain-fee-summary-display" aria-live="polite"
            dangerouslySetInnerHTML={{ __html: summary }} />
          <p className="domain-fee-edit-hint">{t("editFieldHint")}</p>
          <div className="form-group">
            <label htmlFor="domainFeePrice">
              {t("price")} <span className="domain-fee-decimals-hint">({t("editWord")})</span>
            </label>
            <input
              type="number"
              id="domainFeePrice"
              className="form-group-input"
              step="0.01"
              placeholder={t("pricePlaceholder")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-save" onClick={handleSave}>{t("save")}</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
          </div>
        </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
