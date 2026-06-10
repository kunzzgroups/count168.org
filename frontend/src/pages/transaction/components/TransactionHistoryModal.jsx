import { useEffect } from "react";
import { createPortal } from "react-dom";
import { getHistoryRemark, toUpperDisplay, formatRateForHistoryDisplay } from "../lib/transactionFormat.js";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

export default function TransactionHistoryModal({
  history,
  setHistory,
  histMoney,
  showDescriptionColumn,
  m,
  t,
}) {
  // Align `js/transaction.js`: close Payment History on × and on ESC (document keydown when modal visible).
  useEffect(() => {
    if (!history.open) return;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setHistory((h) => ({ ...h, open: false }));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [history.open, setHistory]);

  // Portal to body: `.transaction-container` has transform (premiumEntrance), which breaks
  // `position: fixed` and centers the modal against the full page height instead of the viewport.
  useEffect(() => {
    if (!history.open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [history.open]);

  const closeModal = () => setHistory((h) => ({ ...h, open: false }));

  if (!history.open) return null;

  const modal = (
    <div
      id="historyModal"
      className="transaction-modal"
      style={{ display: "flex" }}
      role="presentation"
      onClick={closeModal}
    >
      <div
        className="transaction-modal-content transaction-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal_title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="transaction-modal-header">
          <h3 id="modal_title">{history.title}</h3>
          <button
            type="button"
            id="modal_close"
            className="transaction-modal-close"
            onClick={closeModal}
          >
            ×
          </button>
        </div>
        <div className="transaction-modal-body" style={{ position: "relative" }}>
          {history.loading ? (
            <div
              className="transaction-tables-loading"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.75)",
                zIndex: 2,
              }}
              aria-live="polite"
            >
              {m.loadingHistory}
            </div>
          ) : null}
          <div className="transaction-history-table-frame">
            <table
              className={`transaction-table ${showDescriptionColumn ? "transaction-history-table--with-desc" : "transaction-history-table--no-desc"}`}
            >
              <thead>
                <tr className="transaction-table-header">
                  <th className="transaction-history-col-date">{m.date}</th>
                  <th className="transaction-history-col-product">{m.idProduct}</th>
                  <th className="transaction-history-col-currency">{m.currency}</th>
                  <th className="transaction-history-col-rate">{m.rate}</th>
                  <th className="transaction-history-col-winloss">{m.winLossTable}</th>
                  <th className="transaction-history-col-crdr">{m.crDrTable}</th>
                  <th className="transaction-history-col-balance">{m.balanceTable}</th>
                  {showDescriptionColumn ? (
                    <th className="transaction-history-col-description">{m.description}</th>
                  ) : null}
                  <th className="transaction-history-col-remark">{m.remark}</th>
                  <th className="transaction-history-col-created">{m.createdBy}</th>
                </tr>
              </thead>
              <tbody id="modal_tbody">
                {history.rows.map((r, idx) => {
                  const isBf = r.row_type === "bf";
                  const idProductDisplay = r.is_bank_process_transaction ? r.card_owner || "-" : r.product || "-";
                  const createdRaw = r.created_by;
                  const createdByDisplay =
                    createdRaw === null ||
                    createdRaw === undefined ||
                    String(createdRaw).trim() === "" ||
                    String(createdRaw).toLowerCase() === "null"
                      ? "-"
                      : String(createdRaw);
                  return (
                    <tr
                      key={r.id ?? `${idx}-${r.date || ""}-${r.balance || ""}`}
                      className={isBf ? "transaction-bf-row transaction-history-bf-row" : "transaction-table-row"}
                    >
                      <td className="transaction-history-col-date">{r.date || "-"}</td>
                      <td className="transaction-history-col-product">{String(idProductDisplay)}</td>
                      <td className="transaction-history-col-currency">{r.currency || "-"}</td>
                      <td className="transaction-history-col-rate">
                        {r.rate && r.rate !== "-" ? formatRateForHistoryDisplay(r.rate) : "-"}
                      </td>
                      <td className="transaction-history-col-winloss">
                        <TransactionWinLossCell value={r.win_loss} formatMoney={histMoney} />
                      </td>
                      <td className="transaction-history-col-crdr">
                        <TransactionWinLossCell value={r.cr_dr} formatMoney={histMoney} />
                      </td>
                      <td className="transaction-history-col-balance">
                        <TransactionWinLossCell value={r.balance} formatMoney={histMoney} />
                      </td>
                      {showDescriptionColumn ? (
                        <td className="transaction-history-col-description text-uppercase">{toUpperDisplay(r.description)}</td>
                      ) : null}
                      <td className="transaction-history-col-remark text-uppercase">{getHistoryRemark(r)}</td>
                      <td className="transaction-history-col-created">{createdByDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(modal, document.body);
}
