import { useState, useEffect, useCallback } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import {
  SINGLE_CATEGORY_MODE,
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  normalizeFeeShareFromServer,
  ensureCompanyFeeShare,
  isFeeShareAllocationsEmpty,
  pruneEmptyShareRows,
  sumFeeShareRolePercentages,
  computeShareTotals,
  formatShareRowAmount2,
} from "../domainHelpers.js";
import AddAccountModal from "./AddAccountModal.jsx";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

const PERMISSION_LIST = [
  { value: "Games", id: "permGambling", labelSuffix: "Gambling" },
  { value: "Bank", id: "permBank", labelSuffix: "Bank" },
  { value: "Loan", id: "permLoan", labelSuffix: "Loan" },
  { value: "Rate", id: "permRate", labelSuffix: "Rate" },
  { value: "Money", id: "permMoney", labelSuffix: "Money" },
];

const SHARE_ROLES = ["profit", "sales", "cs", "it"];

/**
 * Company Settings Modal — expiration date + permissions + share %
 *
 * Props:
 *   company          — the tempCompanies entry being edited (snapshot for cancel)
 *   domainFeePrice   — number, for share amount calculation
 *   sessionCompanyId — fallback if company.company_id is missing
 *   sessionCompanyCode — used for adding accounts
 *   onSave(updatedCompany) — callback with updated company data
 *   onClose()
 */
export default function CompanySettingsModal({
  lang = "en",
  company: initCompany,
  domainFeePrice,
  sessionCompanyId,
  sessionCompanyCode,
  onSave,
  onClose,
}) {
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Local copy of company being edited
  const [company, setCompany] = useState(() => JSON.parse(JSON.stringify(initCompany)));
  const [period, setPeriod] = useState("");
  const [startDate, setStartDate] = useState(initCompany.startDate || new Date().toISOString().split("T")[0]);
  const [expDisplay, setExpDisplay] = useState(initCompany.expiration_date ? formatDate(initCompany.expiration_date) : t("notSet"));
  const [permissions, setPermissions] = useState(Array.isArray(initCompany.permissions) ? initCompany.permissions : []);
  const [chargeOnSave, setChargeOnSave] = useState(!!initCompany.apply_commission_payments_on_domain_save);

  // Share %
  const [shareAccounts, setShareAccounts] = useState([]);       // for sales/cs/it
  const [shareAccountsProfit, setShareAccountsProfit] = useState([]); // for profit
  const [fsa, setFsa] = useState(() => {
    const c = JSON.parse(JSON.stringify(initCompany));
    ensureCompanyFeeShare(c);
    return c.fee_share_allocations;
  });
  const [expandedCards, setExpandedCards] = useState({});
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountRole, setAddAccountRole] = useState("");

  const loadAccounts = useCallback(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_share_settings", company_id: company.company_id }),
    })
      .then((r) => r.json())
      .then((res) => {
        setShareAccounts(res.success && Array.isArray(res.data?.accounts) ? res.data.accounts : []);
        setShareAccountsProfit(res.success && Array.isArray(res.data?.accounts_profit) ? res.data.accounts_profit : []);
        // Only overwrite fsa if it was empty
        if (res.success && res.data?.company_exists && isFeeShareAllocationsEmpty(fsa)) {
          setFsa(normalizeFeeShareFromServer(res.data.allocations));
        }
      })
      .catch(() => { setShareAccounts([]); setShareAccountsProfit([]); });
  }, [company.company_id, fsa]);

  // Load share accounts from API
  useEffect(() => {
    loadAccounts();

    // Load permissions if not cached
    if (!Array.isArray(initCompany.permissions) || initCompany.permissions.length === 0) {
      fetch(buildApiUrl("api/domain/domain_api.php"), {
        cache: "no-cache",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_company_permissions", company_id: company.company_id }),
      })
        .then((r) => r.json())
        .then((data) => {
          const perms = data.success && Array.isArray(data.data?.permissions) ? data.data.permissions : [];
          setPermissions(perms);
        })
        .catch(() => setPermissions([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate expiration display whenever period/startDate changes
  useEffect(() => {
    if (!period) {
      setExpDisplay(company.expiration_date ? formatDate(company.expiration_date) : t("notSet"));
      return;
    }
    const base = startDate || new Date().toISOString().split("T")[0];
    const exp = calculateExpirationDate(period, base);
    setExpDisplay(formatDate(exp));
    setCompany((prev) => ({ ...prev, expiration_date: exp, selectedPeriod: period }));
  }, [period, startDate, company.expiration_date, t]);

  function togglePermission(val) {
    if (SINGLE_CATEGORY_MODE) {
      setPermissions([val]);
    } else {
      setPermissions((prev) =>
        prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
      );
    }
  }

  function handleReset() {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setPeriod("");
    setExpDisplay(t("notSet"));
    setCompany((prev) => ({
      ...prev,
      expiration_date: null,
      selectedPeriod: "",
      isExtending: false,
      originalExpirationDate: null,
    }));
    setFsa(defaultFeeShareAllocations());
    setChargeOnSave(false);
    setExpandedCards({});
    if (SINGLE_CATEGORY_MODE) {
      setPermissions(["Games"]);
    } else {
      setPermissions(["Games", "Bank", "Loan", "Rate", "Money"]);
    }
  }

  function handleSave() {
    // Validate permissions
    if (SINGLE_CATEGORY_MODE) {
      if (permissions.length === 0) { showDomainAlert(t("pleaseSelectOneCategory"), "danger"); return; }
      if (permissions.length > 1)  { showDomainAlert(t("onlyOneCategoryAtTime"), "danger"); return; }
    }

    let expDate = company.expiration_date || null;
    if (period) {
      const base = startDate || new Date().toISOString().split("T")[0];
      expDate = calculateExpirationDate(period, base);
    }

    const cleanFsa = pruneEmptyShareRows(fsa);

    const permReq = fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_company_permissions",
        company_id: company.company_id,
        permissions,
        expiration_date: expDate || null,
      }),
    }).then((r) => r.json());

    const shareReq = fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_company_share_settings",
        company_id: company.company_id,
        fee_share_allocations: cleanFsa,
        apply_commission_payments: chargeOnSave,
      }),
    }).then((r) => r.json());

    Promise.all([permReq, shareReq])
      .then(([permData, shareData]) => {
        if (!permData.success) {
          showDomainAlert(permData.message || t("permissionsSaveFailed"), "danger");
          return;
        }
        if (!shareData.success) {
          const msg = shareData.message || "";
          if (msg.includes("not found") || msg.includes("Save the domain first")) {
            showDomainAlert(t("companyUpdatedShareAfterSave"));
          } else {
            showDomainAlert(msg || t("shareSaveFailed"), "danger");
            return;
          }
        } else {
          const hint = chargeOnSave ? t("feePostsHint") : "";
          showDomainAlert(t("companyUpdatedSuccess") + hint);
        }
        onSave({
          ...company,
          expiration_date: expDate,
          selectedPeriod: period || company.selectedPeriod,
          startDate,
          isExtending: company.isExtending,
          originalExpirationDate: company.originalExpirationDate,
          permissions: [...permissions],
          fee_share_allocations: cleanFsa,
          apply_commission_payments_on_domain_save: chargeOnSave,
        });
      })
      .catch(() => {
        showDomainAlert(t("serverUnreachableChangesKept"), "danger");
        onSave({ ...company, permissions: [...permissions], fee_share_allocations: pruneEmptyShareRows(fsa), apply_commission_payments_on_domain_save: chargeOnSave });
      });
  }

  // ─── Share % helpers ───────────────────────────────────────────────────────
  const totals = computeShareTotals(fsa, domainFeePrice);

  function updateShareRow(role, idx, field, value) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [role]: rows };
    });
  }

  function addShareRow(role) {
    setFsa((prev) => {
      const pruned = pruneEmptyShareRows(prev);
      return { ...pruned, [role]: [...(pruned[role] || []), { account_id: 0, percentage: "" }] };
    });
    setExpandedCards((prev) => ({ ...prev, [role]: true }));
  }

  function removeShareRow(role, idx) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows.splice(idx, 1);
      return { ...prev, [role]: rows };
    });
  }

  function toggleCard(role) {
    setExpandedCards((prev) => ({ ...prev, [role]: !prev[role] }));
  }

  function handleOpenAddAccount(role) {
    setAddAccountRole(role);
    setShowAddAccount(true);
  }

  const accountsForRole = (role) => role === "profit" ? shareAccountsProfit : shareAccounts;

  const roleTotals = {
    profit: totals.profitPool,
    sales: totals.salesSum,
    cs: totals.csSum,
    it: totals.itSum,
  };

  const rowAmounts = {
    profit: totals.profitRowAmounts,
    sales: totals.salesRowAmounts,
    cs: totals.csRowAmounts,
    it: totals.itRowAmounts,
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  /* 必须高于 DomainFormModal 遮罩 (2147483000)；勿依赖任意 Tailwind z-[…] 以免生产未生成 */
  const companySettingsOverlayZ = 2147483001;

  return (
    <DomainModalPortal>
      <div
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: companySettingsOverlayZ,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="company-settings-react-modal modal-content company-settings-modal-content--split relative mx-auto mt-[2%] overflow-hidden rounded-2xl border-0 bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
        <div className="modal-header company-settings-modal-header border-b border-slate-200 bg-slate-50 px-[clamp(22px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)]">
          <h2 className="m-0 text-[clamp(14px,1.25vw,24px)] font-bold text-slate-800">{t("companySettings")}</h2>
          <button
            type="button"
            className="account-close"
            aria-label={isZh ? "关闭" : "Close"}
            onClick={onClose}
          />
        </div>
        <div className="company-settings-modal-body">
          <div className="company-settings-split">
            {/* ── Left: General ── */}
            <div id="companySettingsPanelGeneral" className="company-settings-split-left">
              <h3 className="company-settings-column-title">{t("companySettingsLower")}</h3>
              <div className="mb-[clamp(6px,0.625vw,12px)]">
                <label id="expDateCompanyName" className="company-settings-company-name-label">
                  {t("companyPrefix")}{company.company_id}
                </label>
              </div>
              {/* Start Date + Period */}
              <div className="company-settings-date-row">
                <div className="form-group company-settings-field-half">
                  <label className="cs-company-field-label" htmlFor="expDateStartDate">{t("startDate")}</label>
                  <input
                    type="date"
                    id="expDateStartDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <small id="expDateStartDateHelp" className="company-settings-start-hint">
                    {t("selectStartDateHint")}
                  </small>
                </div>
                <div className="form-group company-settings-field-half company-settings-field-half--period">
                  <label className="cs-company-field-label" htmlFor="expDatePeriod">{t("period")}</label>
                  <select
                    id="expDatePeriod"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="">{t("selectPeriod")}</option>
                    <option value="7days">{t("sevenDays")}</option>
                    <option value="1month">{t("oneMonth")}</option>
                    <option value="3months">{t("threeMonths")}</option>
                    <option value="6months">{t("sixMonths")}</option>
                    <option value="1year">{t("oneYear")}</option>
                  </select>
                  <small className="company-settings-start-hint company-settings-start-hint--align-spacer" aria-hidden="true">
                    &#8203;
                  </small>
                </div>
              </div>
              {/* Expiration Date display */}
              <div className="mb-2.5">
                <label className="cs-company-field-label">{t("expirationDate")}</label>
                <div id="expDateDisplay" className={`company-settings-exp-display${expDisplay === t("notSet") ? " is-muted" : ""}`}>
                  {expDisplay}
                </div>
              </div>
              {/* Permissions */}
              <div className="mb-2">
                <label className="cs-company-field-label company-settings-permissions-label">{t("permissionsLabel")}</label>
                <div className="permission-toggle-row">
                  {PERMISSION_LIST.map(({ value, id, labelSuffix }) => (
                    <label
                      key={value}
                      className="permission-toggle-btn"
                      id={`permissionLabel${labelSuffix}`}
                      htmlFor={id}
                    >
                      <input
                        type="checkbox"
                        id={id}
                        value={value}
                        className="permission-checkbox"
                        checked={permissions.includes(value)}
                        onChange={() => togglePermission(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                <p className="company-settings-permissions-hint">{t("permissionsHintLine")}</p>
              </div>
            </div>

            <div className="company-settings-split-divider" role="separator" aria-orientation="vertical" aria-hidden="true" />

            {/* ── Right: Share % ── */}
            <div className="company-settings-split-right">
              <div className="company-settings-share-header">
                <h3 className="company-settings-column-title company-settings-share-title">{t("share")}</h3>
                <div className="company-share-charge-on-save">
                  <span className={`company-share-charge-on-save__state${chargeOnSave ? " company-share-charge-on-save__state--on" : ""}`} aria-hidden="true">
                    {chargeOnSave ? t("on") : t("off")}
                  </span>
                  <label className="company-share-charge-switch">
                    <input
                      type="checkbox"
                      className="company-share-charge-switch__input"
                      id="companyShareChargeToggle"
                      role="switch"
                      aria-label={t("companyShareChargeAria")}
                      aria-checked={chargeOnSave}
                      checked={chargeOnSave}
                      onChange={(e) => setChargeOnSave(e.target.checked)}
                    />
                    <span className="company-share-charge-switch__track" aria-hidden="true">
                      <span className="company-share-charge-switch__thumb" />
                    </span>
                  </label>
                </div>
              </div>

              {/* Grand total bar */}
              <div className="company-share-grand-total" style={{ display: "none" }}>
                <span>{totals.grand.toFixed(2)}%</span>
              </div>

              <div className="company-share-scroll">
                {SHARE_ROLES.map((role) => {
                  const isProfit = role === "profit";
                  const total = roleTotals[role];
                  const rows = fsa[role] || [];
                  const amounts = rowAmounts[role] || [];
                  const accounts = accountsForRole(role);
                  const isExpanded = !!expandedCards[role];
                  const assignedCount = rows.filter((r) => parseInt(r.account_id, 10) !== 0).length;
                  const cardId = `shareRows${role.charAt(0).toUpperCase() + role.slice(1)}`;

                  return (
                    <div key={role}
                      className={`company-share-role-card${isExpanded ? " expanded" : ""}${isProfit ? " company-share-role-card--profit-pool" : ""}${rows.length === 0 ? " company-share-role-card--empty" : ""}`}
                      data-share-card={role}>
                      <div
                        className="company-share-role-header"
                        role="button" tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={cardId}
                        onClick={() => toggleCard(role)}
                        onKeyDown={(e) => e.key === "Enter" && toggleCard(role)}
                      >
                        <div className="company-share-role-header-left">
                          <span className={`company-share-role-badge company-share-role-badge--${role}`}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </span>
                          <span className="company-share-account-count-display">
                            {assignedCount === 1 ? t("oneAccount") : t("accountCount", { count: assignedCount })}
                          </span>
                        </div>
                        <div className="company-share-role-header-middle">
                          <div className="company-share-role-alloc-row">
                            <span className="company-share-role-alloc-label">{t("shareTotal")}</span>
                            <span className={`company-share-card-sum${total > 100 ? " company-share-card-sum--over" : ""}`}>
                              {total.toFixed(2)}%
                            </span>
                          </div>
                          <div className="company-share-progress-track">
                            <div
                              className={`company-share-progress-fill${total > 100 ? " company-share-progress-fill--over" : ""}`}
                              style={{ width: `${Math.min(100, Math.max(0, total))}%` }}
                            />
                          </div>
                        </div>
                        <div className="company-share-role-header-right">
                          <button type="button" className="company-share-btn-manage"
                            onClick={(e) => { e.stopPropagation(); toggleCard(role); }}>
                            {t("manage")}
                          </button>
                          <span className="company-share-icon-chevron" aria-hidden="true">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={`company-share-role-body${isProfit ? " profit-pool company-share-role-body--profit-pool" : ""}`}>
                          <div className={`company-share-column-labels${isProfit ? " company-share-column-labels--profit-pool" : ""}`}>
                            <span>{t("account")}</span>
                            {!isProfit && <span>{t("share")}</span>}
                            <span>{t("total")}</span>
                            <span className="company-share-col-actions" aria-hidden="true" />
                          </div>
                          <div id={cardId} role="list">
                            {rows.map((row, idx) => {
                              const amt = amounts[idx] || { amount: 0, percentage: 0 };
                              return (
                                <div key={idx} className="company-share-data-row" role="listitem">
                                  <div className="company-share-cell company-share-cell-account">
                                    <div className="company-share-account-inline">
                                      <select
                                        className="share-account-select company-share-select"
                                        aria-label={t("account")}
                                        value={row.account_id || ""}
                                        onChange={(e) => updateShareRow(role, idx, "account_id", parseInt(e.target.value, 10) || 0)}
                                      >
                                        <option value="">— Select —</option>
                                        {accounts.map((a) => (
                                          <option key={a.id} value={a.id}>{a.account_id}</option>
                                        ))}
                                      </select>
                                      <button type="button" className="company-share-account-plus-btn"
                                        title={t("addNewAccount")} aria-label={t("addNewAccount")}
                                        onClick={() => handleOpenAddAccount(role)}>+</button>
                                    </div>
                                  </div>
                                  {!isProfit && (
                                    <div className="company-share-cell company-share-cell-pct">
                                      <div className="company-share-pct-wrap">
                                        <input
                                          type="number"
                                          className="share-pct-input company-share-pct-input"
                                          step="0.1" min="0" max="100"
                                          value={row.percentage !== "" ? row.percentage : ""}
                                          placeholder="0"
                                          inputMode="decimal"
                                          aria-label={t("share")}
                                          onChange={(e) => updateShareRow(role, idx, "percentage", e.target.value === "" ? "" : parseFloat(e.target.value))}
                                        />
                                        <span className="company-share-pct-suffix">%</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="company-share-cell company-share-cell-amount">
                                    <input
                                      type="text"
                                      className="company-share-amount-input"
                                      value={formatShareRowAmount2(amt.amount)}
                                      readOnly tabIndex={-1}
                                      aria-label={t("total")}
                                    />
                                  </div>
                                  <div className="company-share-cell company-share-cell-remove">
                                    <button type="button" className="company-share-remove-btn"
                                      title={t("removeRow")} aria-label={t("removeRow")}
                                      onClick={() => removeShareRow(role, idx)}>
                                      <span aria-hidden="true">&times;</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" className="company-share-add-btn"
                            onClick={() => addShareRow(role)}>{t("addAccountInline")}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {shareAccounts.length === 0 && shareAccountsProfit.length === 0 && (
                <div style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 8 }}>
                  {t("noLinkedAccounts")}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions — 与量测图：Save 蓝 / Reset 红 / Cancel 灰 */}
          <div className="form-actions company-settings-form-actions">
            <button type="button" className="btn btn-save" onClick={handleSave}>{t("save")}</button>
            <button type="button" className="btn btn-reset-company" onClick={handleReset}>{t("reset")}</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
          </div>
        </div>
      </div>

        {showAddAccount && (
          <AddAccountModal
            lang={lang}
            companyId={company.id || sessionCompanyId}
            companyCode={company.company_id || sessionCompanyCode}
            preferredRole={addAccountRole}
            onClose={() => setShowAddAccount(false)}
            onSuccess={() => {
              loadAccounts();
            }}
          />
        )}
      </div>
    </DomainModalPortal>
  );
}
