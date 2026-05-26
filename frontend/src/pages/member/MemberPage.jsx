import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl } from "../../utils/core/apiUrl.js";
import { applyLoginLang, useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { MAINTENANCE_I18N } from "../../translateFile/pages/maintenanceTranslate.js";
import { formatMemberRowDescription, getMemberText } from "../../translateFile/pages/memberTranslate.js";
import SidebarLangSwitch from "../../components/SidebarLangSwitch.jsx";
import ReportDatePicker from "../report/common/ReportDatePicker.jsx";
import {
  buildMaintenancePeriodPresets,
  formatDmyFromDate,
  formatDmyFromYmd,
  parseDmy,
} from "../maintenance/shared/maintenanceDateHelpers.js";
import "../../../public/css/member.css";
import "../../../public/css/userlist.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/report-outlined-fields.css";
import "../../../public/css/transaction.css";
import ConfirmLogoutModal from "../../components/ConfirmLogoutModal.jsx";
import MemberMiniGrid, { MemberMiniGridTotals } from "./components/MemberMiniGrid.jsx";
import MemberMoneyCell from "./components/MemberMoneyCell.jsx";
import MemberLinkedFilterModal from "./components/MemberLinkedFilterModal.jsx";
import {
  computeTableTotals,
  WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS,
  WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS_NARROW,
  WINLOSS_ACCOUNT_SEGMENT_NARROW_MQ,
  WINLOSS_CURRENCY_SEGMENT_MAX_BUTTONS,
} from "./memberPageHelpers.js";
import { useMemberWinLoss } from "./useMemberWinLoss.js";
import { useMemberPageShell } from "./useMemberPageShell.js";

export default function MemberPage() {
  const navigate = useNavigate();
  const lang = useLoginLang();
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);
  const maintenanceLocale = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);

  const wlFiltersColRef = useRef(null);
  const [wlFiltersSyncPx, setWlFiltersSyncPx] = useState(null);
  const [accountNarrowViewport, setAccountNarrowViewport] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((message, type = "info") => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((prev) => {
      const next = [...prev, { id, message, type }];
      return next.slice(-2);
    });
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const {
    viewAccountId,
    companyId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    linkedAccounts,
    wlGridSelectedIds,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    isAllSelected,
    selectedCurrencies,
    availableCurrencies,
    miniGridDisplayCurrencies,
    miniGridShell,
    miniGridBalances,
    miniGridTotals,
    miniGridHint,
    miniGridAccounts,
    showMiniRail,
    groupedRows,
    loadingTable,
    showLinkedFilterModal,
    setShowLinkedFilterModal,
    initSession,
    switchCompany,
    switchAccount,
    persistCurrencyOrder,
    applyWlGridSelection,
    onCurrencyAll,
    onCurrencyToggle,
    formatPaymentHistoryMoney,
  } = useMemberWinLoss({ showNotification, lang });

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => {
    const d = new Date(today);
    const day = d.getDay();
    const toMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - toMonday);
    return d;
  }, [today]);
  const mondayDmy = useMemo(() => formatDmyFromDate(monday), [monday]);
  const todayDmy = useMemo(() => formatDmyFromDate(today), [today]);

  const {
    loading,
    me,
    companies,
    roleLabel,
    avatarSrc,
    selectedAvatarId,
    selectedGender,
    setSelectedGender,
    showAvatarOptions,
    setShowAvatarOptions,
    avatarContainerRef,
    handleSelectAvatar,
    showNotifications,
    toggleNotifications,
    announcements,
    announcementsLoading,
    showLogoutConfirm,
    setShowLogoutConfirm,
    logoutLoading,
    performLogout,
    logoutI18n,
  } = useMemberPageShell({
    navigate,
    initSession,
    mondayDmy,
    todayDmy,
    lang,
  });

  const accountMaxPerBand = accountNarrowViewport
    ? WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS_NARROW
    : WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS;

  /** Account 多段：每段最多 N 格，超出自动换行；窄屏减少每行格数以完整显示户名 */
  const accountFilterBands = useMemo(() => {
    const accounts = Array.isArray(linkedAccounts) ? linkedAccounts : [];
    const bands = [];
    for (let i = 0; i < accounts.length; i += accountMaxPerBand) {
      bands.push(accounts.slice(i, i + accountMaxPerBand));
    }
    return bands;
  }, [linkedAccounts, accountMaxPerBand]);

  useEffect(() => {
    const mq = window.matchMedia(WINLOSS_ACCOUNT_SEGMENT_NARROW_MQ);
    const update = () => setAccountNarrowViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /** Currency 多段：每段最多 8 格（含 All），每满一行新开一条 segment 白底条，列仍按 8 列对齐 */
  const currencyFilterBands = useMemo(() => {
    const codes = Array.isArray(availableCurrencies) ? availableCurrencies : [];
    const showAllBtn = codes.length === 0 || codes.length > 1;
    const maxPerBand = WINLOSS_CURRENCY_SEGMENT_MAX_BUTTONS;

    const cells = [];
    if (showAllBtn) cells.push({ type: "all" });
    codes.forEach((c) => cells.push({ type: "code", code: c }));

    const bands = [];
    for (let i = 0; i < cells.length; i += maxPerBand) {
      bands.push(cells.slice(i, i + maxPerBand));
    }
    return bands;
  }, [availableCurrencies]);

  const handleWinLossCurrencyCodeDrop = useCallback(
    (e) => {
      e.preventDefault();
      const dragged = e.dataTransfer.getData("text/plain");
      const code = e.currentTarget?.dataset?.currency;
      if (!dragged || !code || dragged === code) return;
      const from = availableCurrencies.indexOf(dragged);
      const to = availableCurrencies.indexOf(code);
      if (from < 0 || to < 0) return;
      const next = [...availableCurrencies];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      persistCurrencyOrder(next);
    },
    [availableCurrencies, persistCurrencyOrder],
  );

  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(t), [t]);

  const handleDateRangeChange = useCallback(
    (start, end) => {
      setDateFrom(formatDmyFromYmd(start));
      setDateTo(formatDmyFromYmd(end));
    },
    [setDateFrom, setDateTo],
  );

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("transaction-page", "member-winloss-page", "ec-auth-shell");
    return () => {
      document.body.classList.remove("transaction-page", "member-winloss-page", "ec-auth-shell");
    };
  }, []);

  useLayoutEffect(() => {
    if (!showMiniRail) {
      setWlFiltersSyncPx(null);
      return undefined;
    }
    const el = wlFiltersColRef.current;
    const mq = window.matchMedia("(min-width: 1181px)");
    const update = () => {
      if (!showMiniRail || !mq.matches || !wlFiltersColRef.current) {
        setWlFiltersSyncPx(null);
        return;
      }
      setWlFiltersSyncPx(Math.ceil(wlFiltersColRef.current.scrollHeight));
    };
    update();
    let ro;
    if (el) {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    }
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [
    showMiniRail,
    lang,
    companies,
    linkedAccounts,
    currencyFilterBands,
    dateFrom,
    dateTo,
    companyId,
    viewAccountId,
    miniGridDisplayCurrencies.length,
    selectedCurrencies.length,
  ]);

  if (loading || !me) return null;

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src={assetUrl("images/count_whitelogo.png")} alt="EAZYCOUNT Logo" className="header-logo" />
            <div className="notification-bell" title={t("notifications")} onClick={toggleNotifications}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
              </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container" ref={avatarContainerRef}>
              <div className="current-avatar" onClick={() => setShowAvatarOptions((prev) => !prev)}>
                <img id="currentAvatarImg" className="current-avatar-img" src={avatarSrc} alt="Avatar" />
              </div>
              <div className={`avatar-options ${showAvatarOptions ? "show" : ""}`} id="avatarOptions">
                <div className="options-title">{t("chooseAvatar")}</div>
                <div className="gender-selection">
                  <button type="button" className={`gender-btn ${selectedGender === "male" ? "active" : ""}`} onClick={() => setSelectedGender("male")}>{t("male")}</button>
                  <button type="button" className={`gender-btn ${selectedGender === "female" ? "active" : ""}`} onClick={() => setSelectedGender("female")}>{t("female")}</button>
                </div>
                <div className={`avatar-list ${selectedGender === "male" ? "show" : ""}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <div key={`male-${num}`} className={`avatar-option ${selectedAvatarId === `male${num}` ? "selected" : ""}`} onClick={() => handleSelectAvatar(`male${num}`)}>
                      <img src={assetUrl(`images/avatar${num}.png`)} alt={`Male Avatar ${num}`} className="avatar-option-img" />
                    </div>
                  ))}
                </div>
                <div className={`avatar-list ${selectedGender === "female" ? "show" : ""}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <div key={`female-${num}`} className={`avatar-option ${selectedAvatarId === `female${num}` ? "selected" : ""}`} onClick={() => handleSelectAvatar(`female${num}`)}>
                      <img src={assetUrl(`images/female${num}.png`)} alt={`Female Avatar ${num}`} className="avatar-option-img" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="user-avatar-dropdown">
              <div className="user-info">
                <div className="user-name">{me.login_id || "-"}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
            </div>
          </div>
          <SidebarLangSwitch lang={lang} onLanguageChange={applyLoginLang} ariaLabel={t("switchLanguage")} />
        </div>
        <div className="informationmenu-content">
          <div className="content-separator" />
          <div className="informationmenu-section">
            <div className="informationmenu-section-title current-page">{t("winLoss")}</div>
          </div>
        </div>
        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">{t("exp")}</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button className="btn logout-btn" onClick={() => setShowLogoutConfirm(true)} type="button">{t("logout")}</button>
        </div>
      </div>

      <div className="transaction-container">
        <div className="transaction-separator-line" />
        <div className="transaction-main-content member-winloss-dash">
          <div className="transaction-search-section member-dash-unified-bar">
            <div
              className={`member-dash-columns${showMiniRail ? " member-dash-columns--three-col" : " member-dash-columns--no-mini-rail"}${showMiniRail && miniGridDisplayCurrencies.length === 1 ? " member-dash-columns--single-ccy-rail" : ""}${wlFiltersSyncPx != null ? " member-dash-columns--wl-sync-h" : ""}`}
              style={wlFiltersSyncPx != null ? { ["--member-winloss-filters-h"]: `${wlFiltersSyncPx}px` } : undefined}
            >
              <div className="member-dash-col member-dash-col-filters" ref={wlFiltersColRef}>
            <div className="member-winloss-date-field">
              <ReportDatePicker
                dateFrom={parseDmy(dateFrom || mondayDmy)}
                dateTo={parseDmy(dateTo || todayDmy)}
                onRangeChange={handleDateRangeChange}
                containerClass="customer-report-filter-group"
                label={t("dateRange")}
                placeholder={t("selectDateRange")}
                selectEndDateHint={t("selectEndDate")}
                outlinedFloatingLabel
                captureDateStyle
                periodPresets={periodPresets}
                periodShortcutsAria={t("period")}
                monthLabels={maintenanceLocale.monthsShort}
                weekdaysShort={maintenanceLocale.weekdaysShort}
              />
            </div>
            <div className="user-gc-inline-panel member-winloss-gc-panel" id="member_gc_filter_panel">
              {companies.length > 1 && (
                <div className="user-gc-inline-row" id="member_company_filter">
                  <span className="user-gc-inline-label">{t("company")}</span>
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="member_company_buttons">
                    <div className="user-gc-segment-group" role="group" aria-label={t("ariaCompany")}>
                      {companies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          className={`user-gc-segment${Number(company.company_id) === Number(companyId) ? " is-on" : ""}`}
                          onClick={() => switchCompany(company.company_id, company.company_code)}
                        >
                          {String(company.company_code || "").toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {linkedAccounts.length > 1 && (
                <div className="user-gc-inline-row" id="member_account_filter">
                  <span className="user-gc-inline-label">{t("account")}</span>
                  <div
                    className="user-gc-inline-pills member-winloss-account-pills"
                    id="member_account_buttons"
                    role="group"
                    aria-label={t("ariaAccount")}
                  >
                    {accountFilterBands.map((band, segIdx) => (
                      <div
                        key={`member-acc-band-${segIdx}`}
                        className="user-gc-segment-group member-winloss-account-segments"
                        style={{
                          width: `${(band.length / accountMaxPerBand) * 100}%`,
                          maxWidth: "100%",
                          gridTemplateColumns: `repeat(${band.length}, minmax(max-content, 1fr))`,
                        }}
                      >
                        {band.map((acc) => {
                          const accountLabel = String(acc.account_id || acc.name || acc.id);
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              className={`user-gc-segment${Number(acc.id) === Number(viewAccountId) ? " is-on" : ""}`}
                              onClick={() => switchAccount(acc.id, acc.account_id, acc.name)}
                            >
                              <span className="member-winloss-account-pill-label">{accountLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="user-gc-inline-row" id="member_currency_filter">
                <span className="user-gc-inline-label">{t("currency")}</span>
                <div
                  className="user-gc-inline-pills member-winloss-currency-pills"
                  id="member_currency_buttons"
                  role="group"
                  aria-label={t("ariaCurrency")}
                >
                  {currencyFilterBands.map((band, segIdx) => (
                    <div
                      key={`member-ccy-band-${segIdx}`}
                      className="user-gc-segment-group member-winloss-currency-segments"
                      style={{
                        width: `${(band.length / WINLOSS_CURRENCY_SEGMENT_MAX_BUTTONS) * 100}%`,
                        gridTemplateColumns: `repeat(${band.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {band.map((cell) =>
                        cell.type === "all" ? (
                          <button
                            key="member-ccy-all"
                            type="button"
                            className={`user-gc-segment${isAllSelected ? " is-on" : ""}`}
                            onClick={onCurrencyAll}
                          >
                            {t("all")}
                          </button>
                        ) : (
                          <button
                            key={cell.code}
                            type="button"
                            draggable
                            data-currency={cell.code}
                            className={`user-gc-segment user-gc-segment--draggable-pill${selectedCurrencies.includes(cell.code) ? " is-on" : ""}`}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", cell.code);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleWinLossCurrencyCodeDrop}
                            onClick={() => onCurrencyToggle(cell.code)}
                          >
                            {cell.code}
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
              </div>
              {showMiniRail && (
                <>
                  <div className="member-dash-col member-dash-col-matrix" aria-hidden="false">
                    {linkedAccounts.length > 0 && (
                      <div className="member-dash-rail-toolbar member-dash-matrix-toolbar">
                        <button
                          type="button"
                          className="member-dash-filter-trigger"
                          id="member_linked_filter_btn"
                          title={t("accountsFilterTitle")}
                          onClick={() => setShowLinkedFilterModal(true)}
                        >
                          <i className="fas fa-filter" aria-hidden="true" />
                          <span>{t("accounts")}</span>
                        </button>
                      </div>
                    )}
                    <div className="member-dash-matrix-center-wrap">
                      <div className="member-dash-rail-matrix">
                        <MemberMiniGrid
                          shellMode={miniGridShell}
                          currencies={miniGridDisplayCurrencies}
                          accounts={miniGridAccounts}
                          balanceMap={miniGridBalances}
                          hint={miniGridHint}
                          linkedCurrenciesLoaded={linkedCurrenciesLoaded}
                          linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
                          t={t}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="member-dash-col member-dash-col-total">
                    <div className="member-dash-rail-total">
                      <div className="member-dash-total-matrix" role="region" aria-label={t("balanceTotalsAria")}>
                        <div className="member-dash-total-matrix-hd">{t("total")}</div>
                        <div className="member-dash-total-matrix-body">
                          <div id="member_balance_total_value" className="member-dash-total-values" aria-live="polite">
                            <MemberMiniGridTotals
                              currencyOrder={miniGridDisplayCurrencies}
                              totalsByCu={miniGridTotals}
                              t={t}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        <div className="member-currency-section" id="member_currency_tables_section" style={{ display: "flex", visibility: "visible" }}>
          <div id="member_currency_tables" className="member-currency-tables">
            {loadingTable ? (
              <p className="member-currency-empty" style={{ margin: 0 }}>{t("loading")}</p>
            ) : groupedRows.length === 0 ? (
              <p className="member-currency-empty" style={{ margin: 0 }}>{t("noDataInRange")}</p>
            ) : (
              groupedRows.map(([currency, rows]) => {
                const { totalWinLoss, totalCrDr, closingBalance } = computeTableTotals(rows);
                return (
                  <div className="member-currency-table-wrapper" key={currency}>
                    <h3 className="member-currency-table-title">{t("currencyTitle", { currency })}</h3>
                    <table className="transaction-table member-winloss-table member-winloss-table--by-currency">
                      <colgroup>
                        <col className="transaction-history-col-date" />
                        <col className="transaction-history-col-product" />
                        <col className="transaction-history-col-rate" />
                        <col className="transaction-history-col-winloss" />
                        <col className="transaction-history-col-crdr" />
                        <col className="transaction-history-col-balance" />
                        <col className="transaction-history-col-description" />
                        <col className="transaction-history-col-remark" />
                      </colgroup>
                      <thead>
                        <tr className="transaction-table-header">
                          <th className="transaction-history-col-date">{t("colDate")}</th>
                          <th className="transaction-history-col-product">{t("colIdProduct")}</th>
                          <th className="transaction-history-col-rate">{t("colRate")}</th>
                          <th className="transaction-history-col-winloss">{t("colWinLoss")}</th>
                          <th className="transaction-history-col-crdr">{t("colCrDr")}</th>
                          <th className="transaction-history-col-balance">{t("colBalance")}</th>
                          <th className="transaction-history-col-description">{t("colDescription")}</th>
                          <th className="transaction-history-col-remark">{t("colRemark")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr className="transaction-table-row"><td colSpan={8} style={{ textAlign: "center" }}>{t("noData")}</td></tr>
                        ) : (
                          rows.map((row, idx) => (
                            <tr className={`transaction-table-row ${row.row_type === "bf" ? "member-bf-row" : ""}`} key={`${currency}-${idx}`}>
                              <td className="transaction-history-col-date">{row.date || "-"}</td>
                              <td className="transaction-history-col-product">{row.is_bank_process_transaction ? row.card_owner || "-" : row.product || "-"}</td>
                              <td className="transaction-history-col-rate">{row.rate || "-"}</td>
                              <td className="transaction-history-col-winloss">
                                <MemberMoneyCell value={row.win_loss} formatMoney={formatPaymentHistoryMoney} />
                              </td>
                              <td className="transaction-history-col-crdr">
                                <MemberMoneyCell value={row.cr_dr} formatMoney={formatPaymentHistoryMoney} />
                              </td>
                              <td className="transaction-history-col-balance">
                                <MemberMoneyCell value={row.balance} formatMoney={formatPaymentHistoryMoney} />
                              </td>
                              <td className="transaction-history-col-description text-uppercase">{formatMemberRowDescription(lang, row)}</td>
                              <td className="transaction-history-col-remark text-uppercase">{String(row.remark || row.sms || "-").toUpperCase()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-row transaction-summary-total transaction-summary-total">
                          <td className="transaction-summary-total-label" colSpan={3}>
                            {t("totalRow", { currency })}
                          </td>
                          <td className="transaction-history-col-winloss">
                            <MemberMoneyCell value={totalWinLoss.toString()} formatMoney={formatPaymentHistoryMoney} />
                          </td>
                          <td className="transaction-history-col-crdr">
                            <MemberMoneyCell value={totalCrDr.toString()} formatMoney={formatPaymentHistoryMoney} />
                          </td>
                          <td className="transaction-history-col-balance">
                            <MemberMoneyCell value={closingBalance.toString()} formatMoney={formatPaymentHistoryMoney} />
                          </td>
                          <td className="transaction-history-col-description" colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div id="notificationContainer" className="transaction-notification-container">
          {notifications.map((note) => (
            <div
              key={note.id}
              className={`transaction-notification ${
                note.type === "error"
                  ? "transaction-notification-error"
                  : note.type === "warning"
                    ? "transaction-notification-warning"
                    : "transaction-notification-success"
              } show`}
            >
              {note.message}
            </div>
          ))}
        </div>
      </div>
      </div>

      <div className={`notification-overlay ${showNotifications ? "show" : ""}`} onClick={toggleNotifications} />
      <div className={`notification-panel ${showNotifications ? "show" : ""}`}>
        <div className="notification-header">
          <h2>{t("announcements")}</h2>
          <button className="notification-close" onClick={toggleNotifications} title={t("close")} type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="notification-content">
          {announcementsLoading ? (
            <div className="notification-empty"><p>{t("loadingAnnouncements")}</p></div>
          ) : announcements.length > 0 ? (
            announcements.map((a, idx) => (
              <div key={`${a.title || "announcement"}-${idx}`} className="notification-item unread">
                <div className="notification-title">{a.title}</div>
                <div className="notification-message">{a.content}</div>
                <div className="notification-time">{a.created_at}</div>
              </div>
            ))
          ) : (
            <div className="notification-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
              <p>{t("noAnnouncements")}</p>
            </div>
          )}
        </div>
      </div>

      <MemberLinkedFilterModal
        open={showLinkedFilterModal}
        linkedAccounts={linkedAccounts}
        selectedIds={wlGridSelectedIds}
        onClose={() => setShowLinkedFilterModal(false)}
        onApply={applyWlGridSelection}
        onNotify={showNotification}
        t={t}
      />

      <ConfirmLogoutModal
        open={showLogoutConfirm}
        loading={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={performLogout}
        i18n={logoutI18n}
      />
    </>
  );
}