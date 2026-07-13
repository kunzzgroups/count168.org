import { NavLink } from "react-router-dom";
import { mobileNavItems } from "../../utils/mobilePermissions.js";

export default function MobileShell({ children, overlay = null, i18n, me }) {
  const labels = i18n || { navHome: "Home", navReport: "Report", navTransaction: "Transaction", navMore: "More" };
  const navItems = mobileNavItems(me);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f2f5fb]">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">{children}</main>

      <nav
        className="relative z-10 shrink-0 border-t border-slate-200/70 bg-white/85 px-2 pt-1.5 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                  isActive ? "text-[#2f80ed]" : "text-slate-400"
                }`
              }
            >
              <i className={`fas ${item.icon} text-[18px]`} aria-hidden="true" />
              <span>{labels[item.key]}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Overlay after nav so FilterSheet covers the tab bar (z-50). */}
      {overlay}
    </div>
  );
}
