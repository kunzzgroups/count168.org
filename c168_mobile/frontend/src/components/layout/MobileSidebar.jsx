import { NavLink } from "react-router-dom";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { brandWhiteLogoUrl, onBrandLogoError } from "../../lib/brandAssets.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileLangSwitch from "./MobileLangSwitch.jsx";

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/**
 * Mobile drawer mirroring desktop `.informationmenu`:
 * dark shell, white logo, avatar + name/role, nav, logout.
 * Company switching stays in Filter (desktop does not list companies in sidebar).
 */
export default function MobileSidebar({
  open,
  onClose,
  i18n,
  me,
  companyCode,
  groupId,
  onLogout,
  lang = "en",
  onLangChange,
}) {
  const navItems = mobileNavItems(me);
  const name = me?.nickname || me?.username || me?.name || "—";
  const role = String(me?.role || me?.user_type || "").toUpperCase();
  useOverlayLock(open, onClose);

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label={i18n?.dismissMenu || "Dismiss menu"}
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/45 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={i18n?.menu || "Menu"}
        className={`absolute inset-y-0 left-0 flex w-[min(82vw,300px)] max-w-full flex-col bg-[#002d49] text-white shadow-[12px_0_40px_-12px_rgba(0,20,40,0.65)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
          <img
            src={brandWhiteLogoUrl()}
            alt="EazyCount"
            className="h-8 max-w-[140px] object-contain"
            draggable={false}
            data-logo-idx="0"
            data-logo-kind="white"
            onError={onBrandLogoError}
          />
          <div className="flex shrink-0 items-center gap-2">
            {typeof onLangChange === "function" ? (
              <MobileLangSwitch
                lang={lang}
                onChange={onLangChange}
                ariaLabel={i18n?.language || "Language"}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/90"
              aria-label={i18n?.closeMenu || "Close"}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 pb-4 pt-2">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
            aria-hidden="true"
          >
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-white">{name}</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {role || "USER"}
            </p>
            {(companyCode || groupId) && (
              <p className="mt-1 truncate text-[11px] font-semibold text-[#63C4FF]">
                {[companyCode, groupId].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden="true" />

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label={i18n?.menu || "Menu"}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-l-full py-3 pl-4 pr-3 text-[14px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[#0e93f3] text-white shadow-[0_8px_20px_-10px_rgba(14,147,243,0.8)]"
                    : "text-white/85 hover:bg-white/10"
                }`
              }
            >
              <i className={`fas ${item.icon} w-5 text-center text-[16px]`} aria-hidden="true" />
              <span>{i18n?.[item.key] || item.key}</span>
            </NavLink>
          ))}
        </nav>

        <div
          className="border-t border-white/15 px-3 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="tap-scale flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-bold text-white"
            style={{ background: "linear-gradient(90deg, #63C4FF 0%, #0D60FF 100%)" }}
          >
            <i className="fas fa-right-from-bracket" aria-hidden="true" />
            {i18n?.logout || "Logout"}
          </button>
        </div>
      </aside>
    </div>
  );
}
