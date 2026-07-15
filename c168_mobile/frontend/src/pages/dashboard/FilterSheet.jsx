import { useEffect, useRef } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  formatDisplayDate,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";

function Pill({ active, disabled, onClick, block, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`tap-scale rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
        block ? "w-full text-center" : "shrink-0"
      } ${
        active
          ? "border-transparent bg-[#2f6bf6] text-white shadow-[0_6px_14px_-4px_rgba(47,107,246,0.5)]"
          : "border-slate-200 bg-white text-slate-600"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function SegmentedControl({ options, disabled }) {
  return (
    <div className="flex w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      {options.map((opt, index) => (
        <button
          key={opt.key}
          type="button"
          disabled={disabled || opt.disabled}
          onClick={opt.onClick}
          className={`relative min-w-[3.25rem] flex-1 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            index > 0 ? "border-l border-slate-200" : ""
          } ${
            opt.active
              ? "bg-gradient-to-b from-[#4f8cff] to-[#2f6bf6] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
              : "bg-white text-slate-700"
          } ${disabled || opt.disabled ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, trailing, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

/** Large phone-friendly date row — display formatted date, native picker overlays the row. */
function DateTapRow({ label, value, min, max, onChange }) {
  return (
    <label className="relative flex min-h-[56px] cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 transition-colors focus-within:border-[#2f6bf6] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2f6bf6]/20 active:bg-slate-100">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#2f6bf6] shadow-sm ring-1 ring-slate-100">
        <i className="far fa-calendar text-[15px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="mt-0.5 block truncate text-[16px] font-bold tabular-nums text-slate-900">
          {value ? formatDisplayDate(value) : "—"}
        </span>
      </span>
      <i className="fas fa-chevron-right text-[11px] text-slate-300" aria-hidden="true" />
      <input
        type="date"
        value={value || ""}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}

export default function FilterSheet({ open, onClose, dash }) {
  const { i18n } = dash;
  const bodyRef = useRef(null);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [open]);

  const handleReset = () => {
    dash.resetFilters();
  };

  const applyPresetAndClose = (key) => {
    dash.applyPreset(key);
    onClose?.();
  };

  const switchCompanyAndClose = (id) => {
    void dash.switchCompany(id);
    onClose?.();
  };

  const setCurrencyAndClose = (code) => {
    dash.setCurrency(code);
    onClose?.();
  };

  const pickAllGroupsAndClose = () => {
    dash.pickAllGroups();
    onClose?.();
  };

  const pickAllInGroupAndClose = () => {
    dash.pickAllInGroup();
    onClose?.();
  };

  const maxDay = todayYmd();
  const span = daysInclusive(dash.dateFrom, dash.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));

  return (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label="Close filter"
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/30 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`absolute inset-x-0 bottom-0 flex max-h-[82%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <h2 className="text-[18px] font-semibold text-slate-900">{i18n.filter}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 space-y-6 overflow-y-auto px-5 pb-4">
          <Section
            title={i18n.dateRange}
            trailing={
              span > 0 ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    dash.activePreset
                      ? "bg-slate-100 text-slate-500"
                      : "bg-[#2f6bf6]/12 text-[#2f6bf6]"
                  }`}
                >
                  {dash.activePreset ? daysLabel : `${i18n.customRange} · ${daysLabel}`}
                </span>
              ) : null
            }
          >
            <div className="space-y-2.5">
              <DateTapRow
                label={i18n.from}
                value={dash.dateFrom}
                max={dash.dateTo || maxDay}
                onChange={(from) => dash.setCustomDateRange(from, dash.dateTo || from)}
              />
              <DateTapRow
                label={i18n.toDate}
                value={dash.dateTo}
                min={dash.dateFrom || undefined}
                max={maxDay}
                onChange={(to) => dash.setCustomDateRange(dash.dateFrom || to, to)}
              />
            </div>
          </Section>

          <Section title={i18n.quickSelect}>
            <div className="grid grid-cols-3 gap-2">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill
                  key={key}
                  active={dash.activePreset === key}
                  onClick={() => applyPresetAndClose(key)}
                  block
                >
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {dash.groupIds.length > 0 && (
            <Section title={`${i18n.groupId}:`}>
              <SegmentedControl
                options={[
                  {
                    key: "all-groups",
                    label: i18n.all,
                    active: dash.groupsAllMode,
                    onClick: pickAllGroupsAndClose,
                  },
                  ...dash.groupIds.map((gid) => ({
                    key: gid,
                    label: gid,
                    active: dash.selectedGroup === gid && !dash.groupsAllMode,
                    onClick: () => {
                      dash.pickGroup(gid);
                      onClose?.();
                    },
                  })),
                ]}
              />
            </Section>
          )}

          <Section title={`${i18n.company}:`}>
            <SegmentedControl
              options={[
                ...(dash.companiesForPicker.length > 1 || dash.selectedGroup
                  ? [
                      {
                        key: "all-companies",
                        label: i18n.all,
                        active: dash.groupAllMode,
                        disabled: !dash.selectedGroup || dash.groupsAllMode,
                        onClick: pickAllInGroupAndClose,
                      },
                    ]
                  : []),
                ...dash.companiesForPicker.map((c) => ({
                  key: String(c.id),
                  label: String(c.company_id || c.name || c.id).toUpperCase(),
                  active:
                    !dash.groupAllMode &&
                    !dash.groupOnlyMode &&
                    Number(dash.companyId) === Number(c.id),
                  onClick: () => switchCompanyAndClose(c.id),
                })),
              ]}
            />
          </Section>

          {dash.currencies.length > 0 && (
            <Section title={i18n.currency}>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {dash.currencies.map((code) => (
                  <Pill key={code} active={dash.currency === code} onClick={() => setCurrencyAndClose(code)}>
                    {code}
                  </Pill>
                ))}
              </div>
            </Section>
          )}
        </div>
        <div
          className="flex gap-3 border-t border-slate-100 px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <button
            type="button"
            onClick={handleReset}
            className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3.5 text-[14px] font-semibold text-slate-600"
          >
            {i18n.reset}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale flex-[2] rounded-2xl bg-[#2f6bf6] py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(47,107,246,0.6)]"
          >
            {i18n.applyFilter}
          </button>
        </div>
      </div>
    </div>
  );
}
