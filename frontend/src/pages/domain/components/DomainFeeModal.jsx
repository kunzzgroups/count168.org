import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { formatDomainFeeEdit2, DEFAULT_DOMAIN_FEE_PRICE } from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Fee Settings Modal — Group / Company price for domain list
 * Props:
 *   onClose()
 *   onFeeSaved(data) — called after successful save with { price, group_price, company_price }
 */
/** Overlay z：与 DomainFormModal 同源内联写法，防止生产包 Tailwind arbitrary 失效时整块遮罩掉到侧栏下层，表现为「点了 Price 无反应」 */
const FEE_MODAL_OVERLAY_Z = 2147482998;

function resolveFeeEditValue(raw) {
  const formatted = formatDomainFeeEdit2(raw);
  return formatted !== "" ? formatted : DEFAULT_DOMAIN_FEE_PRICE;
}

export default function DomainFeeModal({ onClose, onFeeSaved, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [groupPrice, setGroupPrice] = useState(DEFAULT_DOMAIN_FEE_PRICE);
  const [companyPrice, setCompanyPrice] = useState(DEFAULT_DOMAIN_FEE_PRICE);

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
          setGroupPrice(resolveFeeEditValue(res.data.group_price ?? res.data.price));
          setCompanyPrice(resolveFeeEditValue(res.data.company_price ?? res.data.price));
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
      body: JSON.stringify({
        action: "save_domain_fee_settings",
        group_price: groupPrice,
        company_price: companyPrice,
      }),
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
          <p className="domain-fee-edit-hint">{t("editFieldHint")}</p>
          <div className="form-group">
            <label htmlFor="domainFeeGroupPrice">
              {t("groupPrice")}
            </label>
            <input
              type="number"
              id="domainFeeGroupPrice"
              className="form-group-input"
              step="0.01"
              placeholder={t("pricePlaceholder")}
              value={groupPrice}
              onChange={(e) => setGroupPrice(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="domainFeeCompanyPrice">
              {t("companyPrice")}
            </label>
            <input
              type="number"
              id="domainFeeCompanyPrice"
              className="form-group-input"
              step="0.01"
              placeholder={t("pricePlaceholder")}
              value={companyPrice}
              onChange={(e) => setCompanyPrice(e.target.value)}
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
