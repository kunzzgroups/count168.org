import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import "./contra-inbox-sheet.css";

export default function ContraInboxSheet({ open, onClose, m, items = [], loading, onApprove, onReject, mutationsBlocked }) {
  useOverlayLock(open, onClose);
  if (!open) return null;

  const count = items.length;
  const awaiting =
    count === 1
      ? m.contraInboxAwaitingApproval.replace("{count}", String(count))
      : m.contraInboxAwaitingApprovalPlural.replace("{count}", String(count));

  return (
    <div className="m-contra-sheet">
      <button type="button" className="m-contra-sheet-spacer" aria-label={m.close} onClick={onClose} />
      <div className="m-contra-sheet-panel">
        <div className="m-contra-sheet-header">
          <div>
            <p className="m-contra-sheet-title">{m.contraInbox}</p>
            <p className="m-contra-sheet-sub">{awaiting}</p>
          </div>
          <button type="button" onClick={onClose} className="m-contra-sheet-close tap-scale">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="m-contra-sheet-body">
          {loading ? (
            <p className="m-contra-sheet-loading">{m.loading}</p>
          ) : count === 0 ? (
            <div className="m-contra-sheet-empty">
              <p className="m-contra-sheet-empty-title">{m.contraInboxEmpty}</p>
              <p className="m-contra-sheet-empty-hint">{m.contraInboxEmptyHint}</p>
            </div>
          ) : (
            items.map((item) => {
              const id = item.transaction_id || item.id;
              return (
                <article key={String(id)} className="m-contra-item">
                  <div>
                    <p className="m-contra-item-type">{String(item.transaction_type || "CONTRA").toUpperCase()}</p>
                    <p className="m-contra-item-meta">
                      {item.transaction_date || item.date || "—"} · {item.currency || ""}
                    </p>
                    <p className="m-contra-item-route">
                      {(item.from_account_id || item.from_account || "?") +
                        " → " +
                        (item.account_id || item.to_account || "?")}
                    </p>
                    <p className="m-contra-item-amount">{item.amount ?? "—"}</p>
                    {item.submitted_by || item.created_by ? (
                      <p className="m-contra-item-by">
                        {m.submittedBy}: {item.submitted_by || item.created_by}
                      </p>
                    ) : null}
                  </div>
                  <div className="m-contra-item-actions">
                    <button
                      type="button"
                      disabled={mutationsBlocked}
                      onClick={() => onApprove?.(id)}
                      className="m-contra-btn m-contra-btn--approve tap-scale"
                    >
                      {m.approve}
                    </button>
                    <button
                      type="button"
                      disabled={mutationsBlocked}
                      onClick={() => {
                        if (window.confirm(m.confirmRejectContra)) onReject?.(id);
                      }}
                      className="m-contra-btn m-contra-btn--reject tap-scale"
                    >
                      {m.reject}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
