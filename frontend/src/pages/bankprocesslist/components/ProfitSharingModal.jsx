import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { BankSearchableAccountPick } from "./bankProcessFormFields.jsx";
import { formatBankMoneyFixed2, sanitizeBankMoneyTyping } from "../lib/bankProcessHelpers.js";

export default function ProfitSharingModal({
  profitShareRows,
  setProfitShareRows,
  accounts,
  onConfirm,
  onClose,
  onOpenAddAccountForField,
  t,
}) {
  const addRow = () => {
    setProfitShareRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "" }]);
  };

  const blurAmount = (idx, raw) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: "" } : r)));
      return;
    }
    const formatted = formatBankMoneyFixed2(trimmed, { emptyAsZero: false });
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: formatted } : r)));
  };

  const removeRow = (idx) => {
    setProfitShareRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <ProcessModalPortal>
    <div id="profitSharingModal" className="modal" style={{ ...processModalBackdropStyle, zIndex: 10100 }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{t("addProfitSharing")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="bank-form" style={{ display: "block", width: "100%" }}>
            <div id="profitSharingRowsContainer">
              {profitShareRows.map((row, idx) => (
                <div key={`ps-${idx}`} className="form-row profit-sharing-row">
                  <div className="form-group">
                    <label>{t("account")}</label>
                    <div className="account-select-with-buttons">
                      <BankSearchableAccountPick
                        value={row.accountId}
                        onChange={(id) => {
                          const acc = accounts.find((a) => String(a.id) === String(id));
                          setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: id, accountLabel: acc?.account_id || "" } : r)));
                        }}
                        accounts={accounts}
                        disabled={false}
                        t={t}
                      />
                      <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField({ type: "profitRow", index: idx })}>+</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("amount")}</label>
                    <div className="profit-sharing-amount-field">
                      <input
                        type="text"
                        className="bank-input profit-sharing-amount"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: sanitizeBankMoneyTyping(e.target.value) } : r)))}
                        onBlur={(e) => blurAmount(idx, e.target.value)}
                      />
                      <span className="profit-sharing-amount-spacer" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="form-group profit-sharing-delete-cell">
                    <button type="button" className="profit-sharing-delete-row-btn" onClick={() => removeRow(idx)} aria-label={t("removeRow")}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="profit-sharing-add-row-wrap" style={{ marginTop: 10 }}>
              <button type="button" className="bank-add-btn" title={t("addAnotherAccountAmount")} onClick={addRow}>+</button>
            </div>
            <div className="form-actions bank-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-save profit-sharing-modal-btn" onClick={onConfirm}>{t("add")}</button>
              <button type="button" className="btn btn-cancel profit-sharing-modal-btn" onClick={onClose}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
