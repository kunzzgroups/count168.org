import { useEffect, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  formatBankAccountDisplay,
  formatBankMoneyFixed2,
  sanitizeBankMoneyTyping,
} from "../../lib/bankProcessApi.js";

function accountOptionLabel(a) {
  return formatBankAccountDisplay(a.account_id || a.code, a.name, String(a.id));
}

/**
 * Nested sheet: Account + Amount rows → confirm serializes to parent.
 */
export function BankProcessProfitSharingSheet({
  open,
  onClose,
  i18n,
  accounts,
  initialRows,
  onConfirm,
}) {
  useOverlayLock(open, onClose);
  const [rows, setRows] = useState([{ accountId: "", accountLabel: "", amount: "" }]);

  useEffect(() => {
    if (!open) return;
    const seed =
      Array.isArray(initialRows) && initialRows.length > 0
        ? initialRows.map((r) => ({
            accountId: String(r.accountId || ""),
            accountLabel: String(r.accountLabel || ""),
            amount: String(r.amount || ""),
          }))
        : [{ accountId: "", accountLabel: "", amount: "" }];
    setRows(seed);
  }, [open, initialRows]);

  const patchRow = (idx, partial) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...partial } : r)));
  };

  const blurAmount = (idx, raw) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      patchRow(idx, { amount: "" });
      return;
    }
    patchRow(idx, { amount: formatBankMoneyFixed2(trimmed, { emptyAsZero: false }) });
  };

  const addRow = () => {
    setRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "" }]);
  };

  const removeRow = (idx) => {
    if (idx <= 0) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      className={`m-sheet-overlay m-bp-ps-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={i18n.bankAddProfitSharing}
        className={`m-sheet-panel m-sheet-panel--tall${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{i18n.bankAddProfitSharing}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-sheet-body--spaced">
          <div className="m-bp-ps-rows">
            {rows.map((row, idx) => (
              <div key={`ps-${idx}`} className="m-bp-ps-row">
                <label className="m-bp-field">
                  <span>{i18n.account}</span>
                  <select
                    value={row.accountId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      const acc = accounts.find((a) => String(a.id) === String(id));
                      patchRow(idx, {
                        accountId: id,
                        accountLabel: acc?.account_id || acc?.code || "",
                      });
                    }}
                  >
                    <option value="">{i18n.bankSelectAccount}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {accountOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="m-bp-ps-amount-wrap">
                  <label className="m-bp-field">
                    <span>{i18n.amount}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={row.amount || ""}
                      onChange={(e) => patchRow(idx, { amount: sanitizeBankMoneyTyping(e.target.value) })}
                      onBlur={(e) => blurAmount(idx, e.target.value)}
                    />
                  </label>
                  {idx > 0 ? (
                    <button
                      type="button"
                      className="m-bp-ps-remove tap-scale"
                      onClick={() => removeRow(idx)}
                      aria-label={i18n.bankRemoveRow}
                      title={i18n.bankRemoveRow}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="m-bp-ps-add-account tap-scale" onClick={addRow}>
            <i className="fas fa-plus" aria-hidden="true" />
            {i18n.bankAddAccountRow}
          </button>
        </div>
        <div className="m-sheet-footer">
          <button type="button" className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale" onClick={onClose}>
            {i18n.cancel}
          </button>
          <button
            type="button"
            className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale"
            onClick={() => onConfirm?.(rows)}
          >
            {i18n.bankAddConfirm || i18n.apply}
          </button>
        </div>
      </section>
    </div>
  );
}
