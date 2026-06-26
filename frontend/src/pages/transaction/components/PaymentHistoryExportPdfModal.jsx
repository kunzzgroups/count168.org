import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../../translateFile/pages/transactionTranslate.js";
import { MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import ReportDatePicker from "../../report/common/ReportDatePicker.jsx";
import {
  buildMaintenancePeriodPresets,
  parseDmy,
} from "../../maintenance/shared/maintenanceDateHelpers.js";
import {
  buildMemberReportFilename,
  buildMemberReportPrintHtml,
  fetchMemberReportHistory,
  fetchPaymentHistoryExportCurrencies,
  openReportPrintWindow,
  renderReportToWindow,
  resolveExportCurrencyDefault,
  ymdRangeToDmy,
} from "../lib/paymentHistoryMemberReportExport.js";

export default function PaymentHistoryExportPdfModal({ open, onClose, scope, accountTitle }) {
  const lang = useLoginLang();
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);
  const maintenanceLocale = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(maintenanceLocale), [maintenanceLocale]);

  const initialFromYmd = useMemo(() => parseDmy(scope?.dateFrom || ""), [scope?.dateFrom]);
  const initialToYmd = useMemo(() => parseDmy(scope?.dateTo || ""), [scope?.dateTo]);

  const [dateFromYmd, setDateFromYmd] = useState(initialFromYmd);
  const [dateToYmd, setDateToYmd] = useState(initialToYmd);
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDateFromYmd(initialFromYmd);
    setDateToYmd(initialToYmd);
    setError("");
  }, [open, initialFromYmd, initialToYmd]);

  useEffect(() => {
    if (!open) return undefined;
    const accountId = scope?.accountDbId;
    const companyId = scope?.companyId;
    if (!accountId || !companyId) {
      setCurrencies([]);
      setSelectedCurrency("");
      return undefined;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingCurrencies(true);
    setError("");
    void fetchPaymentHistoryExportCurrencies(accountId, companyId, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setCurrencies(list);
        setSelectedCurrency(resolveExportCurrencyDefault(scope?.currency, list));
      })
      .catch((err) => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        setCurrencies([]);
        setSelectedCurrency("");
        setError(err?.message || m.exportPdfLoadCurrenciesFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCurrencies(false);
      });
    return () => controller.abort();
  }, [open, scope?.accountDbId, scope?.companyId, scope?.currency, m.exportPdfLoadCurrenciesFailed]);

  const handleRangeChange = useCallback((fromYmd, toYmd) => {
    setDateFromYmd(fromYmd || "");
    setDateToYmd(toYmd || "");
    setError("");
  }, []);

  const handleExport = useCallback(async () => {
    const accountId = scope?.accountDbId;
    const companyId = scope?.companyId;
    const { dateFrom, dateTo } = ymdRangeToDmy(dateFromYmd, dateToYmd);
    const currency = String(selectedCurrency || "")
      .trim()
      .toUpperCase();
    if (!dateFrom || !dateTo) {
      setError(m.pleaseSelectDateRange);
      return;
    }
    if (!currency) {
      setError(m.pleaseSelectCurrency);
      return;
    }
    if (!accountId || !companyId) {
      setError(m.exportPdfMissingAccount);
      return;
    }
    // Open the print window synchronously so it keeps the user-gesture context.
    const printWin = openReportPrintWindow(m.exportPdfExporting);
    if (!printWin) {
      setError(m.exportPdfPopupBlocked);
      return;
    }
    setExporting(true);
    setError("");
    try {
      const rows = await fetchMemberReportHistory({
        accountId,
        companyId,
        dateFrom,
        dateTo,
        currency,
      });
      const accountCode = String(scope?.accountCode || "").trim();
      const accountName = String(scope?.accountName || "").trim();
      const html = buildMemberReportPrintHtml({
        rows,
        currency,
        accountCode,
        accountName,
        dateFrom,
        dateTo,
        lang,
      });
      const filename = buildMemberReportFilename({ accountCode, currency, dateFrom, dateTo });
      renderReportToWindow(printWin, { html, documentTitle: filename });
      onClose?.();
    } catch (err) {
      try {
        if (printWin && !printWin.closed) printWin.close();
      } catch {
        /* ignore */
      }
      if (err?.name === "AbortError") return;
      if (err?.message === "Popup blocked") {
        setError(m.exportPdfPopupBlocked);
        return;
      }
      setError(err?.message || m.exportPdfFailed);
    } finally {
      setExporting(false);
    }
  }, [
    scope,
    dateFromYmd,
    dateToYmd,
    selectedCurrency,
    lang,
    m,
    onClose,
  ]);

  if (!open) return null;

  return portalToDocumentBody(
    <div
      className="transaction-payment-history-export-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-history-export-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose?.();
      }}
    >
      <div className="transaction-payment-history-export-modal">
        <div className="transaction-payment-history-export-modal__header">
          <div className="transaction-payment-history-export-modal__heading">
            <h3 id="payment-history-export-title">{m.exportPdfTitle}</h3>
            {accountTitle ? (
              <p className="transaction-payment-history-export-modal__subtitle">{accountTitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="transaction-modal-close transaction-payment-history-export-modal__close"
            aria-label={m.close}
            disabled={exporting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="transaction-payment-history-export-modal__body">
          <p className="transaction-payment-history-export-modal__hint">{m.exportPdfHint}</p>
          <div className="transaction-payment-history-export-modal__form">
            <div className="transaction-payment-history-export-modal__field">
              <ReportDatePicker
                dateFrom={dateFromYmd}
                dateTo={dateToYmd}
                onRangeChange={handleRangeChange}
                containerClass="transaction-payment-history-export-date"
                label={m.exportPdfDateRange}
                placeholder={m.exportPdfSelectDateRange}
                selectEndDateHint={m.exportPdfSelectEndDate}
                outlinedFloatingLabel
                captureDateStyle={false}
                periodPresets={periodPresets}
                periodShortcutsAria={m.exportPdfPeriod}
                monthLabels={m.monthsShort}
                weekdaysShort={m.weekdaysShort}
              />
            </div>
            <div className="transaction-payment-history-export-modal__field">
              <span className="transaction-payment-history-export-modal__label">{m.currency}</span>
              {loadingCurrencies ? (
                <p className="transaction-payment-history-export-modal__loading">{m.loading}</p>
              ) : currencies.length === 0 ? (
                <p className="transaction-payment-history-export-modal__empty">{m.exportPdfNoCurrencies}</p>
              ) : (
                <div className="transaction-payment-history-export-chips" role="group" aria-label={m.currency}>
                  {currencies.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`transaction-payment-history-export-chip${selectedCurrency === code ? " is-on" : ""}`}
                      onClick={() => {
                        setSelectedCurrency(code);
                        setError("");
                      }}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error ? (
            <p className="transaction-payment-history-export-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="transaction-payment-history-export-modal__actions">
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--ghost"
            disabled={exporting}
            onClick={onClose}
          >
            {m.exportPdfCancel}
          </button>
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--primary"
            disabled={exporting || loadingCurrencies || !selectedCurrency}
            onClick={() => void handleExport()}
          >
            {exporting ? m.exportPdfExporting : m.exportPdf}
          </button>
        </div>
      </div>
    </div>,
  );
}
