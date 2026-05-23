/** Confirm delete modal — pure React replacement */
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

export default function DomainConfirmModal({ message, onConfirm, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  return (
    <DomainModalPortal>
      <div className="domain-confirm-modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 50000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div className="domain-confirm-modal-content" style={{ position: "relative", width: "550px", maxWidth: "90%", overflow: "hidden", borderRadius: 14, border: 0, background: "#ffffff", boxShadow: "0 20px 36px rgba(0,0,0,0.22)" }}>
          <div className="confirm-icon-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "49px 0 24px" }}>
            <svg className="confirm-icon" style={{ width: "76px", height: "76px", borderRadius: "9999px", background: "linear-gradient(135deg,#fee2e2 0%,#fecaca 100%)", padding: "8px", color: "#dc2626" }} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="confirm-title" style={{ margin: 0, marginBottom: "24px", textAlign: "center", fontFamily: "var(--font-heading-page)", fontSize: "40px", fontWeight: 700, letterSpacing: "-0.02em", color: "#1f2937", lineHeight: 1 }}>{t("confirmDeleteTitle")}</h2>
          <p id="confirmMessage" className="confirm-message" style={{ margin: 0, minHeight: "91px", maxHeight: 300, overflowY: "auto", whiteSpace: "pre-line", padding: "0 39.6px", textAlign: "center", fontSize: "18px", fontWeight: 500, lineHeight: 1.4, color: "#475569" }}>{message}</p>
          <div className="confirm-actions" style={{ marginTop: "52px", display: "flex", justifyContent: "center", gap: 4, background: "#f8fafc", padding: "39.93px 0" }}>
            <button type="button" className="btn-cancel-confirm" style={{ cursor: "pointer", width: "120px", minHeight: "35.5px", borderRadius: 6, border: 0, background: "linear-gradient(180deg,#bcbcbc 0%,#585858 100%)", padding: "8px 20px", fontFamily: "var(--font-heading-page)", fontSize: "15.93px", color: "#fff", boxShadow: "0 2px 4px rgba(88,88,88,0.3)" }} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="button" className="confirmDeleteBtn" style={{ cursor: "pointer", width: "120px", minHeight: "35.5px", borderRadius: 6, border: 0, background: "linear-gradient(180deg,#F30E12 0%,#A91215 100%)", padding: "8px 20px", fontFamily: "var(--font-heading-page)", fontSize: "15.93px", color: "#fff", boxShadow: "0 2px 4px rgba(220,53,69,0.3)" }} onClick={onConfirm}>
              {t("delete")}
            </button>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
