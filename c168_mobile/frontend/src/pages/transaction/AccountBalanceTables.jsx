import { useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

function MoneyCell({ value }) {
  return (
    <span className={moneyToneClass(value)}>
      {formatTransactionGridMoneyHalfUp(value)}
    </span>
  );
}

function MetricCell({
  label,
  value,
  onClick,
  title,
  ariaLabel,
}) {
  const interactive = typeof onClick === "function";
  const Comp = interactive ? "button" : "div";
  const display = formatTransactionGridMoneyHalfUp(value);
  return (
    <Comp
      type={interactive ? "button" : undefined}
      className={`m-tx-metric tap-scale${interactive ? " m-tx-metric--interactive" : ""}`}
      onClick={onClick}
      title={title}
      aria-label={interactive ? ariaLabel || title || `${label} ${display}` : undefined}
    >
      <p className="m-tx-metric-label">{label}</p>
      <p className="m-tx-metric-value">
        <MoneyCell value={value} />
      </p>
    </Comp>
  );
}

function AccountCardList({ side, rows, showName, m, onOpenHistory, onPickBalance }) {
  if (rows.length === 0) {
    return <p className="m-tx-card-empty">{m.noAccountsFound}</p>;
  }

  return (
    <ul className="m-tx-card-list">
      {rows.map((row) => {
        const roleCls = getRoleClass(row?.role);
        const code = String(row?.account_id || "").toUpperCase();
        const name = String(row?.account_name || "").trim();
        const cur = String(row?.currency || "").toUpperCase();
        const isAlert = Number(row?.is_alert) === 1;
        const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
        return (
          <li key={key} className={`m-tx-card${isAlert ? " m-tx-card--alert" : ""}`}>
            <button
              type="button"
              className={`m-tx-card-account m-account-role tap-scale${roleCls ? ` ${roleCls}` : ""}`}
              onClick={() => onOpenHistory?.(row)}
              title={m.tapForHistory}
              aria-label={`${m.tapForHistory}: ${code}`}
            >
              <span className="m-tx-card-account-main">
                <span className="m-tx-card-code">{code}</span>
                {showName && name ? <span className="m-tx-card-name">{name}</span> : null}
              </span>
              <span className="m-tx-card-currency">{cur}</span>
            </button>

            <div className="m-tx-card-metrics">
              <MetricCell label={m.bfTable} value={row?.bf} />
              <MetricCell label={m.winLossTableCompact} value={row?.win_loss} />
              <MetricCell label={m.crDrTable} value={row?.cr_dr} />
              <MetricCell
                label={m.balanceTableCompact}
                value={row?.balance}
                onClick={() => onPickBalance?.(row, side)}
                title={m.tapBalanceToFill || m.balanceTable}
                ariaLabel={
                  m.tapBalanceAria
                    ? m.tapBalanceAria
                        .replace("{account}", code)
                        .replace("{amount}", formatTransactionGridMoneyHalfUp(row?.balance))
                    : `${m.tapBalanceToFill || m.balanceTable}: ${code} ${formatTransactionGridMoneyHalfUp(row?.balance)}`
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop parity: left = balance ≥ 0, right = balance < 0 (sign only — not From/To role). */
export function splitAccountRowsByBalance(rows) {
  const left = [];
  const right = [];
  for (const row of rows || []) {
    const bal = parseBalanceValue(String(row?.balance ?? "").replace(/,/g, ""));
    if (bal != null && bal < 0) right.push(row);
    else left.push(row);
  }
  return { left, right };
}

export default function AccountBalanceTables({
  rows,
  showName,
  m,
  currency,
  onOpenHistory,
  onPickBalance,
}) {
  const { left, right } = splitAccountRowsByBalance(rows);
  const [sideTab, setSideTab] = useState("left");
  const isLeft = sideTab === "left";
  const activeRows = isLeft ? left : right;

  return (
    <div className="m-tx-balance-root">
      <p className="m-tx-balance-currency">
        {m.currencyLabel} {String(currency || "").toUpperCase()}
        {rows?.length ? ` · ${rows.length}` : ""}
      </p>

      <div className="m-tx-side-tabs" role="tablist" aria-label={m.accountSideTabs || "Account balance sides"}>
        <button
          type="button"
          role="tab"
          aria-selected={isLeft}
          className={`m-tx-side-tab tap-scale${isLeft ? " m-tx-side-tab--active-left" : ""}`}
          onClick={() => setSideTab("left")}
        >
          <span className="m-tx-side-tab-label">{m.leftBalanceTab || "Balance +"}</span>
          <span className={`m-tx-side-tab-count${isLeft ? " m-tx-side-tab-count--left-active" : ""}`}>
            {left.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLeft}
          className={`m-tx-side-tab tap-scale${!isLeft ? " m-tx-side-tab--active-right" : ""}`}
          onClick={() => setSideTab("right")}
        >
          <span className="m-tx-side-tab-label">{m.rightBalanceTab || "Balance -"}</span>
          <span className={`m-tx-side-tab-count${!isLeft ? " m-tx-side-tab-count--right-active" : ""}`}>
            {right.length}
          </span>
        </button>
      </div>

      <p className="m-tx-balance-hint">
        {m.cardClickHint ||
          m.tableClickHint ||
          "Tap account → history · Tap balance → fill form (Balance+→From, Balance-→To)"}
      </p>

      <section>
        <AccountCardList
          side={isLeft ? "left" : "right"}
          rows={activeRows}
          showName={showName}
          m={m}
          onOpenHistory={onOpenHistory}
          onPickBalance={onPickBalance}
        />
      </section>
    </div>
  );
}
