/**
 * Compact Group › Company path for the sticky filter bar.
 * Modes: groups-all | group-only | group-all | company
 */
export default function ScopeBreadcrumb({
  i18n,
  groupId = "",
  companyCode = "",
  groupsAllMode = false,
  groupAllMode = false,
  groupOnlyMode = false,
}) {
  const g = String(groupId || "").trim().toUpperCase();
  const c = String(companyCode || "").trim().toUpperCase();

  if (groupsAllMode) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ScopeGlyph tone="violet" icon="fa-layer-group" />
        <span className="truncate text-[12px] font-bold text-violet-700">
          {i18n.allGroups || `${i18n.all} Groups`}
        </span>
      </span>
    );
  }

  if (groupOnlyMode && g) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ScopeGlyph tone="violet" icon="fa-layer-group" />
        <span className="truncate text-[12px] font-bold text-violet-700">{g}</span>
        <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">
          {i18n.groupIdShort || "Group"}
        </span>
      </span>
    );
  }

  if (groupAllMode && g) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <ScopeGlyph tone="violet" icon="fa-layer-group" />
        <span className="truncate text-[12px] font-bold text-violet-700">{g}</span>
        <Chevron />
        <ScopeGlyph tone="blue" icon="fa-building" />
        <span className="truncate text-[12px] font-bold text-[#2f6bf6]">{i18n.all}</span>
      </span>
    );
  }

  // Company in a group (e.g. AP › C168) or lone company
  if (g && c) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <ScopeGlyph tone="violet" icon="fa-layer-group" />
        <span className="max-w-[3.25rem] truncate text-[12px] font-bold text-violet-700">{g}</span>
        <Chevron />
        <ScopeGlyph tone="blue" icon="fa-building" />
        <span className="max-w-[4.5rem] truncate text-[12px] font-bold text-[#2f6bf6]">{c}</span>
      </span>
    );
  }

  if (c) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ScopeGlyph tone="blue" icon="fa-building" />
        <span className="truncate text-[12px] font-bold text-[#2f6bf6]">{c}</span>
      </span>
    );
  }

  if (g) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ScopeGlyph tone="violet" icon="fa-layer-group" />
        <span className="truncate text-[12px] font-bold text-violet-700">{g}</span>
      </span>
    );
  }

  return (
    <span className="text-[12px] font-semibold text-slate-400">{i18n.filter}</span>
  );
}

function Chevron() {
  return <i className="fas fa-chevron-right shrink-0 text-[8px] text-slate-300" aria-hidden="true" />;
}

function ScopeGlyph({ tone, icon }) {
  const cls =
    tone === "violet"
      ? "bg-violet-100 text-violet-600"
      : "bg-[#2f6bf6]/12 text-[#2f6bf6]";
  return (
    <span className={`grid size-5 shrink-0 place-items-center rounded-md ${cls}`} aria-hidden="true">
      <i className={`fas ${icon} text-[9px]`} />
    </span>
  );
}
