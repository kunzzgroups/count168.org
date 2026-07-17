import { useEffect, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  formatRangeLabel,
  periodPresetRange,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import {
  companiesForPicker,
  resolveCompanyPickForGroup,
} from "../../lib/dashboardScope.js";
import { fetchMaintenanceProcessOptions } from "../../lib/maintenanceApi.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";
import {
  DateRangeCalendarSheet,
  DateRangeRow,
  Pill,
  Section,
} from "../dashboard/FilterSheet.jsx";
import ScopeBreadcrumb from "../dashboard/ScopeBreadcrumb.jsx";

/**
 * Dashboard/Transaction-style sticky filter bar: one button (date range +
 * scope breadcrumb + Switch) opening the unified maintenance filter sheet.
 */
export function MaintenanceFilterBar({
  i18n,
  dateFrom,
  dateTo,
  groupMode,
  selectedGroup,
  selectedCompany,
  onOpen,
}) {
  const groupId = String(
    (groupMode ? selectedGroup : selectedCompany?.group_id) || "",
  )
    .trim()
    .toUpperCase();
  const companyCode = groupMode
    ? ""
    : String(selectedCompany?.company_id || "").trim().toUpperCase();

  return (
    <button type="button" onClick={onOpen} className="m-filter-bar tap-scale" aria-label={i18n.filter}>
      <div className="m-filter-bar-row">
        <i className="far fa-calendar m-filter-bar-icon" aria-hidden="true" />
        <span className="m-filter-bar-dates">{formatRangeLabel(dateFrom, dateTo)}</span>
        <span className="m-filter-bar-action">
          <i className="fas fa-filter" aria-hidden="true" />
        </span>
      </div>
      <div className="m-filter-bar-scope m-filter-bar-scope-row">
        <div className="m-filter-bar-scope-main">
          <ScopeBreadcrumb
            i18n={i18n}
            groupId={groupId}
            companyCode={companyCode}
            groupOnlyMode={groupMode}
          />
        </div>
        <span className="m-filter-bar-switch">{i18n.switchCompany || "Switch"}</span>
      </div>
    </button>
  );
}

function buildDraft({
  dateFrom,
  dateTo,
  activePreset,
  groupMode,
  selectedGroup,
  companyId,
  category,
  process,
  transactionType,
}) {
  return {
    dateFrom,
    dateTo,
    activePreset: activePreset || "",
    groupMode: Boolean(groupMode),
    groupId: selectedGroup || null,
    companyId: companyId ?? null,
    category: category ?? "",
    process: process ?? "",
    transactionType: transactionType ?? "",
  };
}

function draftScope(draft) {
  if (draft.groupMode && draft.groupId) {
    return { mode: "group", companyId: null, groupId: draft.groupId };
  }
  const cid = Number(draft.companyId);
  return { mode: "company", companyId: Number.isFinite(cid) && cid > 0 ? cid : null, groupId: draft.groupId };
}

/**
 * Unified maintenance filter sheet — mirrors dashboard/transaction FilterSheet
 * (date range + quick select + group/company + apply), plus maintenance-only
 * sections: Category + Process (transaction) or Transaction type (payment).
 */
export function MaintenanceFilterSheet({
  open,
  onClose,
  i18n,
  dateFrom,
  dateTo,
  activePreset = "",
  groupMode = false,
  selectedGroup = null,
  companyId = null,
  companies = [],
  groupIds = [],
  allowedGroupIds = [],
  categories = null,
  category = "",
  withProcess = false,
  process = "",
  types = null,
  transactionType = "",
  readOnlyNote = false,
  onApply,
}) {
  const bodyRef = useRef(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    buildDraft({ dateFrom, dateTo, activePreset, groupMode, selectedGroup, companyId, category, process, transactionType }),
  );
  const [processOptions, setProcessOptions] = useState([]);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) {
      setRangeOpen(false);
      return;
    }
    setDraft(
      buildDraft({ dateFrom, dateTo, activePreset, groupMode, selectedGroup, companyId, category, process, transactionType }),
    );
    bodyRef.current?.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Process options follow the draft scope + category (desktop parity). */
  const scope = draftScope(draft);
  const scopeKey = `${scope.mode}:${scope.companyId ?? ""}:${scope.groupId ?? ""}`;
  useEffect(() => {
    if (!open || !withProcess) return undefined;
    const ac = new AbortController();
    fetchMaintenanceProcessOptions({ scope: draftScope(draft), category: draft.category, signal: ac.signal })
      .then((names) => setProcessOptions(names))
      .catch((e) => {
        if (e?.name !== "AbortError") setProcessOptions([]);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withProcess, scopeKey, draft.category]);

  /** Dashboard parity: company pills follow the selected group. */
  const pickable = companiesForPicker(companies, {
    selectedGroup: draft.groupId,
    groupsAllMode: false,
  });

  /**
   * Dashboard parity: tap a group → group ledger when allowed, otherwise
   * auto-pick a company inside that group (company mode).
   */
  const pickDraftGroup = (gid) => {
    setDraft((prev) => {
      if (allowedGroupIds.includes(gid)) {
        return { ...prev, groupMode: true, groupId: gid, process: "" };
      }
      const pick = resolveCompanyPickForGroup(companies, gid, prev.companyId);
      return {
        ...prev,
        groupMode: false,
        groupId: gid,
        companyId: pick?.id ?? prev.companyId,
        process: "",
      };
    });
  };

  const handleReset = () => {
    const t = todayYmd();
    setDraft((prev) => ({
      ...prev,
      dateFrom: t,
      dateTo: t,
      activePreset: "today",
      category: categories?.[0] ?? prev.category,
      process: "",
      transactionType: "",
    }));
  };

  const handleApply = () => {
    onApply?.({
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      activePreset: draft.activePreset,
      scope: draftScope(draft),
      category: draft.category,
      process: draft.process,
      transactionType: draft.transactionType,
    });
    onClose?.();
  };

  const maxDay = todayYmd();
  const span = daysInclusive(draft.dateFrom, draft.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));

  return (
    <div
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" aria-label="Close filter" onClick={onClose} className="m-sheet-backdrop" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`m-sheet-panel${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>

        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{i18n.filter}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-sheet-close tap-scale">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="m-sheet-body m-sheet-body--spaced">
          <Section
            title={i18n.dateRange}
            trailing={
              span > 0 ? (
                <span
                  className={`m-filter-span-badge${
                    draft.activePreset ? " m-filter-span-badge--preset" : " m-filter-span-badge--custom"
                  }`}
                >
                  {draft.activePreset ? daysLabel : `${i18n.customRange} · ${daysLabel}`}
                </span>
              ) : null
            }
          >
            <DateRangeRow
              fromLabel={i18n.from}
              toLabel={i18n.toDate}
              dateFrom={draft.dateFrom}
              dateTo={draft.dateTo}
              active={rangeOpen}
              onOpen={() => setRangeOpen(true)}
            />
          </Section>

          <Section title={i18n.quickSelect}>
            <div className="m-filter-pill-grid">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill
                  key={key}
                  active={draft.activePreset === key}
                  onClick={() => {
                    const range = periodPresetRange(key);
                    if (!range) return;
                    setDraft((prev) => ({
                      ...prev,
                      activePreset: key,
                      dateFrom: range.dateFrom,
                      dateTo: range.dateTo,
                    }));
                  }}
                  block
                >
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="m-filter-pill-wrap">
                {groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    tone="violet"
                    active={draft.groupId === gid}
                    onClick={() => pickDraftGroup(gid)}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
              <p className="m-filter-hint">
                {allowedGroupIds.length > 0
                  ? i18n.groupHint || "Tap a group for group-only · pick a company below"
                  : i18n.groupCompanyHint || "Pick a group, then choose a company"}
              </p>
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="m-filter-pill-wrap">
              {pickable.map((c) => {
                const label = String(c.company_id).toUpperCase();
                const active = !draft.groupMode && Number(draft.companyId) === Number(c.id);
                return (
                  <Pill
                    key={String(c.id)}
                    active={active}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        groupMode: false,
                        companyId: c.id,
                        groupId: c.group_id ? String(c.group_id).trim().toUpperCase() : null,
                        process: "",
                      }))
                    }
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
          </Section>

          {/* Desktop parity: category buttons only when the company has multiple categories. */}
          {Array.isArray(categories) && categories.length > 1 && (
            <Section title={i18n.category}>
              <div className="m-filter-pill-scroll">
                {categories.map((cat) => (
                  <Pill
                    key={cat}
                    active={draft.category === cat}
                    onClick={() => setDraft((prev) => ({ ...prev, category: cat, process: "" }))}
                  >
                    {cat}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {withProcess && (
            <Section title={i18n.process}>
              <label className="m-mt-field">
                <select
                  value={draft.process}
                  onChange={(e) => setDraft((prev) => ({ ...prev, process: e.target.value }))}
                >
                  <option value="">{i18n.allProcesses}</option>
                  {processOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </Section>
          )}

          {Array.isArray(types) && types.length > 0 && (
            <Section title={i18n.transactionType}>
              <div className="m-filter-pill-scroll">
                <Pill
                  active={draft.transactionType === ""}
                  onClick={() => setDraft((prev) => ({ ...prev, transactionType: "" }))}
                >
                  {i18n.allTypes}
                </Pill>
                {types.map((t) => (
                  <Pill
                    key={t}
                    active={draft.transactionType === t}
                    onClick={() => setDraft((prev) => ({ ...prev, transactionType: t }))}
                  >
                    {t}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {readOnlyNote ? (
            <p className="m-mt-readonly-note">
              <i className="fas fa-circle-info" aria-hidden="true" /> {i18n.readOnlyNote}
            </p>
          ) : null}
        </div>

        <div className="m-sheet-footer">
          <button type="button" onClick={handleReset} className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale">
            {i18n.reset}
          </button>
          <button type="button" onClick={handleApply} className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale">
            {i18n.applyFilter}
          </button>
        </div>
      </div>

      <DateRangeCalendarSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        dateFrom={draft.dateFrom}
        dateTo={draft.dateTo}
        maxYmd={maxDay}
        labels={{
          selectDateRange: i18n.selectDateRange,
          rangePickHint: i18n.rangePickHint,
          from: i18n.from,
          toDate: i18n.toDate,
          today: i18n.today,
          clear: i18n.clear,
          done: i18n.done,
          close: i18n.closeMenu || "Close",
        }}
        onApply={(from, to) =>
          setDraft((prev) => ({
            ...prev,
            dateFrom: from,
            dateTo: to,
            activePreset: "",
          }))
        }
      />
    </div>
  );
}
