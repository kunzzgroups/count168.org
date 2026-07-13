import { PERIOD_PRESET_KEYS } from "../../lib/dashboardDateUtils.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";

function Pill({ active, disabled, onClick, block, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`tap-scale rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-colors ${
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

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-semibold text-slate-900">{title}</p>
      {children}
    </div>
  );
}

export default function FilterSheet({ open, onClose, dash }) {
  const { i18n } = dash;

  const handleReset = () => {
    dash.resetFilters();
  };

  return (
    <div
      className={`absolute inset-0 z-[60] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
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
        className={`absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
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

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-4">
          <Section title={i18n.dateRange}>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
              <i className="fas fa-calendar-alt text-slate-400" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-semibold text-slate-700">{dash.dateRangeText}</span>
            </div>
          </Section>

          <Section title={i18n.quickSelect}>
            <div className="grid grid-cols-3 gap-2">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill
                  key={key}
                  active={dash.activePreset === key}
                  onClick={() => dash.applyPreset(key)}
                  block
                >
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {dash.groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="flex flex-wrap gap-2">
                <Pill active={dash.groupsAllMode} onClick={dash.pickAllGroups}>
                  {i18n.all}
                </Pill>
                {dash.groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    active={dash.selectedGroup === gid && !dash.groupsAllMode}
                    onClick={() => dash.pickGroup(gid)}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="flex flex-wrap gap-2">
              {dash.companiesForPicker.length > 1 && (
                <Pill
                  active={dash.groupAllMode}
                  disabled={!dash.selectedGroup || dash.groupsAllMode}
                  onClick={dash.pickAllInGroup}
                >
                  {i18n.all}
                </Pill>
              )}
              {dash.companiesForPicker.map((c) => (
                <Pill
                  key={c.id}
                  active={!dash.groupAllMode && Number(dash.companyId) === Number(c.id)}
                  onClick={() => dash.switchCompany(c.id)}
                >
                  {String(c.company_id || c.name || c.id).toUpperCase()}
                </Pill>
              ))}
            </div>
          </Section>

          {dash.currencies.length > 0 && (
            <Section title={i18n.currency}>
              <div className="flex flex-wrap gap-2">
                {dash.currencies.map((code) => (
                  <Pill key={code} active={dash.currency === code} onClick={() => dash.setCurrency(code)}>
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
