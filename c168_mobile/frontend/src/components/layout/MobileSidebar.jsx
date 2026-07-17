import { NavLink } from "react-router-dom";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { brandWhiteLogoUrl, onBrandLogoError } from "../../lib/brandAssets.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileLangSwitch from "./MobileLangSwitch.jsx";
import "./mobile-sidebar.css";

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

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
      className={`m-sidebar-overlay ${open ? "m-sidebar-overlay--open" : "m-sidebar-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button
        type="button"
        aria-label={i18n?.dismissMenu || "Dismiss menu"}
        onClick={onClose}
        className="m-sidebar-backdrop"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={i18n?.menu || "Menu"}
        className={`m-sidebar-panel ${open ? "m-sidebar-panel--open" : "m-sidebar-panel--closed"}`}
      >
        <div className="m-sidebar-header">
          <img
            src={brandWhiteLogoUrl()}
            alt="EazyCount"
            className="m-sidebar-logo"
            draggable={false}
            data-logo-idx="0"
            data-logo-kind="white"
            onError={onBrandLogoError}
          />
          <div className="m-sidebar-header-actions">
            {typeof onLangChange === "function" ? (
              <MobileLangSwitch lang={lang} onChange={onLangChange} ariaLabel={i18n?.language || "Language"} />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="m-sidebar-close"
              aria-label={i18n?.closeMenu || "Close"}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="m-sidebar-user">
          <div className="m-sidebar-avatar" aria-hidden="true">
            {initials(name)}
          </div>
          <div className="m-sidebar-user-main">
            <p className="m-sidebar-user-name">{name}</p>
            <p className="m-sidebar-user-role">{role || "USER"}</p>
            {(companyCode || groupId) && (
              <p className="m-sidebar-user-scope">{[companyCode, groupId].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>

        <div className="m-sidebar-divider" aria-hidden="true" />

        <nav className="m-sidebar-nav" aria-label={i18n?.menu || "Menu"}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              onClick={onClose}
              className={({ isActive }) =>
                `m-sidebar-nav-link${isActive ? " m-sidebar-nav-link--active" : ""}`
              }
            >
              <i className={`fas ${item.icon}`} aria-hidden="true" />
              <span>{i18n?.[item.key] || item.key}</span>
            </NavLink>
          ))}
        </nav>

        <div className="m-sidebar-footer">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="m-sidebar-logout tap-scale"
          >
            <i className="fas fa-right-from-bracket" aria-hidden="true" />
            {i18n?.logout || "Logout"}
          </button>
        </div>
      </aside>
    </div>
  );
}
