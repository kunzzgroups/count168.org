import { useMemo } from "react";
import { isCompanyVisibleForSharedFilter } from "../../../utils/company/sharedCompanyFilter.js";

/** GroupID = ALL: show C168 first (same expectation as other owner tools). */
function orderSnapCompaniesForAllGroup(companies) {
  const list = Array.isArray(companies) ? companies : [];
  if (list.length === 0) return [...list];
  const code = (c) => String(c.company_id || "").trim().toUpperCase();
  const i = list.findIndex((c) => code(c) === "C168");
  if (i <= 0) return [...list];
  const next = [...list];
  const [c168] = next.splice(i, 1);
  return [c168, ...next];
}

export default function TransactionSearchSection({
  selectedCategories,
  categoryOpen,
  toggleCategory,
  removeCategoryTag,
  categoryAllCheckboxRef,
  categories,
  onCategoryAllChange,
  toggleCategoryValue,
  searchState,
  setSearchState,
  fs,
  onGroupButtonClick,
  onGroupFilterAllClick,
  onCompanyButtonClick,
  currencyRowsOrdered,
  showAllCurrencies,
  selectedCurrencies,
  toggleAllCurrenciesBtn,
  onCurrencyDragStart,
  onCurrencyDropOn,
  toggleCurrencyBtn,
  m,
  t,
}) {
  const hideGroupFilter = !fs.snapGroupIds?.length;
  const displayFilterChips = useMemo(() => [
    { id: "show_name", key: "showName", label: m.showName },
    { id: "show_capture_only", key: "showCaptureOnly", label: m.showCaptureOnly },
    { id: "show_inactive", key: "showPaymentOnly", label: m.showPaymentOnly },
    { id: "show_zero_balance", key: "showZeroBalance", label: m.showZeroBalance },
  ], [m]);

  const companiesForCompanyStrip = useMemo(() => {
    const list = fs.snapCompanies || [];
    if (fs.groupFilterKind === "all") return orderSnapCompaniesForAllGroup(list);
    return list;
  }, [fs.snapCompanies, fs.groupFilterKind]);

  return (
    <div className="transaction-search-section">
      <div className="transaction-category-date-row">
        <div
          className={`report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--category${categoryOpen ? " is-select-open" : ""}`}
        >
          <div className={`report-outlined-shell${categoryOpen ? " report-outlined-shell--menu-open" : ""}`}>
            <span className="report-outlined-label" id="transaction-category-outlined-label">
              {m.category}
            </span>
            <div className="report-outlined-inner">
              <div id="filter_category" className="transaction-category-multiselect">
                <div className="category-dropdown">
                  <button
                    type="button"
                    className="category-dropdown-button"
                    id="category_dropdown_button"
                    aria-labelledby="transaction-category-outlined-label"
                    onClick={toggleCategory}
                  >
                    <div id="category_selected_tags" className="category-selected-tags">
                      {selectedCategories.length === 0 ? (
                        <span className="category-placeholder">{m.selectAllCategories}</span>
                      ) : (
                        selectedCategories.map((c) => (
                          <div key={c} className="category-tag" data-category-value={c}>
                            <span>{c}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="category-tag-remove"
                              data-category-value={c}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCategoryTag(c);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeCategoryTag(c);
                                }
                              }}
                            >
                              ×
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="category-dropdown-menu" id="category_dropdown_menu" style={{ display: categoryOpen ? "block" : "none" }}>
                    <div className="category-option">
                      <label className="category-checkbox-label">
                        <input
                          ref={categoryAllCheckboxRef}
                          type="checkbox"
                          value=""
                          className="category-checkbox"
                          id="category_all"
                          checked={
                            selectedCategories.length === 0 ||
                            (categories.length > 0 && selectedCategories.length === categories.length)
                          }
                          onChange={(e) => onCategoryAllChange(e.target.checked)}
                        />
                        <span>{m.selectAllCategories}</span>
                      </label>
                    </div>
                    <div id="category_options_container">
                      {categories.map((c) => (
                        <div className="category-option" key={c}>
                          <label className="category-checkbox-label">
                            <input
                              type="checkbox"
                              className="category-checkbox"
                              value={c}
                              checked={selectedCategories.length === 0 ? false : selectedCategories.includes(c)}
                              onChange={() => toggleCategoryValue(c)}
                            />
                            <span>{c}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
          <div className="report-outlined-shell">
            <span className="report-outlined-label report-outlined-label--txn-capture-date" id="transaction-capture-date-outlined-label">
              {m.captureDate}
            </span>
            <div className="report-outlined-inner">
              <div className="transaction-date-range-group">
                <div
                  className="date-range-picker"
                  id="date-range-picker"
                  role="button"
                  tabIndex={0}
                  aria-labelledby="transaction-capture-date-outlined-label"
                >
                  <i className="fas fa-calendar-alt" />
                  {/* Text driven by MaintenanceDateRangePicker — React children would fight DOM updates. */}
                  <span id="date-range-display" aria-live="polite" />
                  <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                </div>
                <input type="hidden" id="date_from" readOnly />
                <input type="hidden" id="date_to" readOnly />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="transaction-checkboxes userlist-filter-chips" role="group" aria-label="Display filters">
        {displayFilterChips.map((chip) => {
          const selected = !!searchState[chip.key];
          return (
            <button
              key={chip.id}
              type="button"
              id={chip.id}
              className={`user-filter-chip${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setSearchState((s) => ({ ...s, [chip.key]: !s[chip.key] }))}
            >
              <span className="user-filter-chip__dot" aria-hidden>
                {selected ? (
                  <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 12l4 4 8-8" />
                  </svg>
                ) : null}
              </span>
              <span className="user-filter-chip__label">{chip.label}</span>
            </button>
          );
        })}
      </div>

      {(fs.snapGroupIds.length > 0 || fs.snapCompanies.length > 0 || currencyRowsOrdered.length > 0) && (
        <div className="transaction-bottom-filters">
          <div className="user-gc-inline-panel">
            {fs.snapGroupIds.length > 0 && (
              <div id="group-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">{m.groupId}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="group-buttons-container" className="user-gc-segment-group" role="group" aria-label="Group ID">
                    <button
                      type="button"
                      className={`user-gc-segment${fs.groupFilterKind === "all" ? " is-on" : ""}`}
                      data-group-filter="all"
                      onClick={() => onGroupFilterAllClick?.()}
                    >
                      {m.all}
                    </button>
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`user-gc-segment${fs.groupFilterKind === "follow" && fs.selectedGroup === gid ? " is-on" : ""}`}
                        data-group-id={gid}
                        onClick={() => onGroupButtonClick(gid)}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {fs.snapCompanies.length > 0 && (
              <div id="company-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">{m.company}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="company-buttons-container" className="user-gc-segment-group" role="group" aria-label="Company">
                    {companiesForCompanyStrip.map((comp) => {
                      const visible = isCompanyVisibleForSharedFilter(
                        comp,
                        fs.selectedGroup,
                        hideGroupFilter,
                        fs.groupFilterKind || "follow",
                      );
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          style={{ display: visible ? undefined : "none" }}
                          className={`user-gc-segment${Number(comp.id) === Number(fs.companyId) ? " is-on" : ""}`}
                          data-company-id={comp.id}
                          data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                          data-company-code={comp.company_id}
                          onClick={() => {
                            if (!visible) return;
                            onCompanyButtonClick(comp);
                          }}
                        >
                          {String(comp.company_id || "").toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {currencyRowsOrdered.length > 0 && (
              <div id="currency-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">{m.currencyLabel}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="currency-buttons-container" className="user-gc-segment-group" role="group" aria-label="Currency">
                    <button
                      type="button"
                      className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                      data-currency-code="ALL"
                      onClick={toggleAllCurrenciesBtn}
                    >
                      {m.all}
                    </button>
                    {currencyRowsOrdered.map((c) => {
                      const code = c.code;
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`user-gc-segment${!showAllCurrencies && selectedCurrencies.includes(code) ? " is-on" : ""}`}
                          data-currency-code={code}
                          draggable
                          onDragStart={() => onCurrencyDragStart(code)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onCurrencyDropOn(code)}
                          onClick={() => toggleCurrencyBtn(code)}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
