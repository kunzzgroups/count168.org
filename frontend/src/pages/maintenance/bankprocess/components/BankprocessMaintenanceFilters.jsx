import { useMemo } from "react";
import {
  buildMaintenancePeriodPresets,
  formatDmyFromYmd,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";

export default function BankprocessMaintenanceFilters({
  permissions,
  selectedPermission,
  setSelectedPermission,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  today,
  query,
  setQuery,
  onSearch,
  groupedIds,
  groupFilterKind,
  selectedGroup,
  onGroupClick,
  onPickAllGroups,
  companies,
  visibleCompanies,
  companyId,
  handleSwitchCompany,
  currencies,
  allCurrenciesSelected,
  selectedCurrencies,
  onCurrencyToggle,
  onCurrencySelectAll,
  confirmDelete,
  setConfirmDelete,
  selectedIds,
  onDelete,
  pageTitle,
  m,
}) {
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(m), [m]);

  return (
    <>
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{pageTitle}</h1>
        {permissions.length > 1 && (
          <div id="bankprocess-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
            <div id="bankprocess-permission-buttons" className="maintenance-company-buttons">
              {permissions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`maintenance-company-btn ${selectedPermission === p ? "active" : ""}`}
                  onClick={() => setSelectedPermission(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="customer-report-filter-container">
        <div className="customer-report-filters">
          <ReportDatePicker
            dateFrom={parseDmy(dateFrom || today)}
            dateTo={parseDmy(dateTo || today)}
            onRangeChange={(start, end) => {
              setDateFrom(formatDmyFromYmd(start));
              setDateTo(formatDmyFromYmd(end));
            }}
            containerClass="customer-report-filter-group"
            label={m.dateRange}
            placeholder={m.selectDateRange}
            selectEndDateHint={m.selectEndDate}
            outlinedFloatingLabel
            captureDateStyle
            periodPresets={periodPresets}
            periodShortcutsAria={m.period}
            monthLabels={m.monthsShort}
            weekdaysShort={m.weekdaysShort}
          />

          <div className="customer-report-filter-group report-outlined-anchor">
            <div className="report-outlined-shell">
              <span id="bankprocess-maint-search-legend" className="report-outlined-label">
                {m.search}
              </span>
              <div className="report-outlined-inner">
                <div className="search-container maintenance-search-container">
                  <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input
                    type="text"
                    id="filter_from_search"
                    placeholder={m.bankSearchPlaceholder}
                    className="search-input maintenance-search-input"
                    autoComplete="off"
                    value={query}
                    aria-labelledby="bankprocess-maint-search-legend"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSearch();
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="maintenance-actions-top">
            <button
              type="button"
              className="maintenance-delete-btn"
              id="deleteBtn"
              onClick={onDelete}
              disabled={selectedIds.length === 0}
            >
              {m.delete}
            </button>
          </div>
        </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left-full">
          <ReportGcFilterPanel
              groupIds={groupedIds}
              groupFilterKind={groupFilterKind}
              selectedGroupKey={selectedGroup}
              onPickAllGroups={onPickAllGroups}
              onPickGroup={(g) => onGroupClick(g)}
              companyButtons={visibleCompanies}
              companyId={companyId}
              highlightCompanyId={companyId}
              onSwitchCompany={handleSwitchCompany}
              currencyList={currencies}
              showAllCurrencies={allCurrenciesSelected}
              selectedCurrencies={selectedCurrencies}
              toggleAllCurrencies={onCurrencySelectAll}
              toggleCurrency={onCurrencyToggle}
              t={(key) => {
                if (key === "groupId") return m.groupId;
                if (key === "company") return m.company;
                if (key === "currency") return m.currency;
                if (key === "currencyAll") return m.currencyAll;
                if (key === "groupFilterAll") return m.all || "All";
                return m[key] || key;
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
