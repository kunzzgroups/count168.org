import { useMemo } from "react";
import ProcessSelect from "../../shared/ProcessSelect.jsx";
import {
  buildMaintenancePeriodPresets,
  formatDmyFromYmd,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  today,
  companyId,
  groupFilterKind,
  snapGroupIds,
  visibleCompanies,
  selectedGroup,
  onGroupClick,
  onPickAllGroups,
  onSwitchCompany,
  m,
}) {
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(m), [m]);

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span
              id="transaction-maintenance-process-legend"
              className="report-outlined-label"
            >
              {m.process}
            </span>
            <div className="report-outlined-inner">
              <ProcessSelect
                key={`process-select-${companyId ?? "none"}`}
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="transaction-maintenance-process-legend"
              />
            </div>
          </div>
        </div>

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
