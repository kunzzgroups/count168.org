import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileAppBar from "./MobileAppBar.jsx";
import MobileNotifications, { fetchMobileAnnouncements } from "./MobileNotifications.jsx";
import MobileSidebar from "./MobileSidebar.jsx";

function CompanyScopeBar({ i18n, companyCode, groupId }) {
  if (!companyCode && !groupId) return null;
  const isAll = String(companyCode || "").toLowerCase() === String(i18n?.all || "all").toLowerCase();

  return (
    <div className="shrink-0 border-b border-slate-200/60 bg-gradient-to-r from-[#eff4ff] to-white px-3.5 py-2">
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          {i18n?.viewingCompany || "Viewing company"}
        </p>
        <p
          className={`truncate text-[15px] font-bold tracking-tight ${
            isAll ? "text-violet-700" : "text-slate-900"
          }`}
        >
          {companyCode || "—"}
        </p>
        {groupId ? (
          <span className="rounded-full bg-[#2f6bf6]/12 px-2 py-0.5 text-[11px] font-bold text-[#2f6bf6]">
            {groupId}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function MobileShell({
  children,
  overlay = null,
  stickyBar = null,
  i18n,
  me,
  companyCode = "",
  groupId = "",
  onLogout,
  showBottomNav = true,
  lang = "en",
  onLangChange,
  onChromeOpen,
  overlayOpen = false,
}) {
  const labels = i18n || {
    navHome: "Home",
    navReport: "Report",
    navTransaction: "Transaction",
    navMore: "More",
  };
  const navItems = mobileNavItems(me);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);

  const openSidebar = () => {
    onChromeOpen?.();
    setNotifyOpen(false);
    setSidebarOpen(true);
  };
  const openNotifications = () => {
    onChromeOpen?.();
    setSidebarOpen(false);
    setNotifyOpen(true);
  };

  // Opening Filter (or any page overlay) dismisses menu / notifications.
  useEffect(() => {
    if (!overlayOpen) return;
    setSidebarOpen(false);
    setNotifyOpen(false);
  }, [overlayOpen]);

  useEffect(() => {
    if (!me) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) setAnnouncements(rows);
      } catch {
        if (!ac.signal.aborted) setAnnouncements([]);
      }
    })();
    return () => ac.abort();
  }, [me]);

  useEffect(() => {
    if (!notifyOpen) return undefined;
    setNotifyLoading(true);
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) setAnnouncements(rows);
      } catch {
        /* keep previous */
      } finally {
        if (!ac.signal.aborted) setNotifyLoading(false);
      }
    })();
    return () => ac.abort();
  }, [notifyOpen]);

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f2f5fb]">
      <MobileAppBar
        i18n={labels}
        notificationCount={announcements.length}
        onOpenSidebar={openSidebar}
        onOpenNotifications={openNotifications}
      />

      <CompanyScopeBar i18n={labels} companyCode={companyCode} groupId={groupId} />

      {/* Filter / date tools stay pinned under company context (outside scroll main) */}
      {stickyBar ? (
        <div className="z-[15] shrink-0 border-b border-slate-200/50 bg-[#f2f5fb]/95 px-3.5 py-2 backdrop-blur-md">
          <div className="mx-auto max-w-lg">{stickyBar}</div>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">{children}</main>

      {showBottomNav ? (
        <nav
          className="relative z-10 shrink-0 border-t border-slate-200/70 bg-white/85 px-2 pt-1.5 backdrop-blur-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          aria-label="Main"
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-around">
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
      ) : null}

      {overlay}
      <MobileSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        i18n={labels}
        me={me}
        companyCode={companyCode}
        groupId={groupId}
        onLogout={onLogout}
        lang={lang}
        onLangChange={onLangChange}
      />
      <MobileNotifications
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        i18n={labels}
        items={announcements}
        loading={notifyLoading}
      />
    </div>
  );
}
