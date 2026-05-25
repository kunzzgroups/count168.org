import ProcessSelect from "../../shared/ProcessSelect.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";
import { normalizeMaintenanceSearchInput } from "../../shared/maintenanceSearchInput.js";

export default function FormulaMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  searchFilter,
  setSearchFilter,
  companyId,
  groupFilterKind,
  snapGroupIds,
  visibleCompanies,
  selectedGroup,
  onGroupClick,
  onPickAllGroups,
  onSwitchCompany,
  onClearFilters,
  selectedIds,
  confirmDelete,
  setConfirmDelete,
  onDelete,
  m,
}) {
  const showClear = Boolean(searchFilter || selectedProcess !== null);

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="formula-maint-process-legend" className="report-outlined-label">
              {m.process}
            </span>
            <div className="report-outlined-inner custom-select-wrapper formula-process-control">
              <ProcessSelect
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                unsetPlaceholder={m.selectProcessPrompt}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="formula-maint-process-legend"
              />
              <button
                type="button"
                id="clear_filters_btn"
                title={m.clearFiltersTitle}
                className="formula-clear-icon-btn"
                onClick={onClearFilters}
                style={{ opacity: showClear ? 1 : 0, pointerEvents: showClear ? "auto" : "none" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="formula-maint-search-legend" className="report-outlined-label">
              {m.search}
            </span>
            <div className="report-outlined-inner">
              <div className="search-input-container formula-search-input-container" style={{ width: "100%", position: "relative" }}>
                <i className="fas fa-search search-icon" aria-hidden={true} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="text"
                  id="search_filter"
                  className="maintenance-input"
                  placeholder={m.searchFormulaPlaceholder}
                  value={searchFilter}
                  aria-labelledby="formula-maint-search-legend"
                  onChange={(e) => setSearchFilter(normalizeMaintenanceSearchInput(e.target.value))}
                  style={{ paddingLeft: "30px", width: "100%", border: "none", outline: "none", background: "transparent", minHeight: "38px", textTransform: "uppercase" }}
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
            groupIds={snapGroupIds}
            groupFilterKind={groupFilterKind}
            selectedGroupKey={selectedGroup}
            onPickAllGroups={onPickAllGroups}
            onPickGroup={(g) => onGroupClick(g)}
            companyButtons={visibleCompanies}
            companyId={companyId}
            highlightCompanyId={companyId}
            onSwitchCompany={onSwitchCompany}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
