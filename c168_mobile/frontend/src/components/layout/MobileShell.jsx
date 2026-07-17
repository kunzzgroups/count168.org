import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { usePullToRefresh } from "../../hooks/usePullToRefresh.js";
import { useScrollChromeOffset } from "../../hooks/useScrollChromeOffset.js";
import { useScrollIdleVisible } from "../../hooks/useScrollIdleVisible.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileAppBar from "./MobileAppBar.jsx";
import MobileNotifications, { fetchMobileAnnouncements } from "./MobileNotifications.jsx";
import MobileSidebar from "./MobileSidebar.jsx";
import PullRefreshIndicator from "./PullRefreshIndicator.jsx";
import "./mobile-shell.css";

export default function MobileShell({
  children,
  overlay = null,
  stickyBar = null,
  floatingAction = null,
  onMainScrollStart,
  i18n,
  me,
  companyCode = "",
  groupId = "",
  onLogout,
  onRefresh,
  refreshing = false,
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
    navAccount: "Account",
    navMore: "More",
  };
  const navItems = mobileNavItems(me);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const mainRef = useRef(null);
  const topChromeRef = useRef(null);
  const [topChromeH, setTopChromeH] = useState(118);

  const refreshPage = useCallback(async () => {
    if (typeof onRefresh === "function") {
      await onRefresh();
      return;
    }
    try {
      const rows = await fetchMobileAnnouncements();
      setAnnouncements(rows);
    } catch {
      /* ignore */
    }
  }, [onRefresh]);

  const { pullPx, progress, phase, active, isAnimating } = usePullToRefresh(mainRef, {
    onRefresh: refreshPage,
    enabled: typeof onRefresh === "function",
    refreshing,
  });

  const floatingIdleVisible = useScrollIdleVisible(mainRef, {
    idleMs: 320,
    onScrollStart: onMainScrollStart,
  });
  const showFloating = Boolean(floatingAction) && floatingIdleVisible && !overlayOpen;

  useLayoutEffect(() => {
    const el = topChromeRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) setTopChromeH(h);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stickyBar, refreshing]);

  const chromeOffsetRaw = useScrollChromeOffset(mainRef, {
    maxOffset: Math.max(topChromeH, 1),
    topReveal: 12,
  });

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

  const forceChrome =
    active || isAnimating || overlayOpen || sidebarOpen || notifyOpen || refreshing;
  const chromeOffset = forceChrome ? 0 : chromeOffsetRaw;
  const chromeProgress = topChromeH > 0 ? Math.min(1, chromeOffset / topChromeH) : 0;
  const navHidden = showBottomNav && chromeProgress > 0.88;
  const contentShift = pullPx > 0.5 ? pullPx : 0;
  const contentTransition = isAnimating && phase !== "pulling" && phase !== "armed";
  const mainPadTop = topChromeH;

  return (
    <div className="m-shell">
      <div
        ref={topChromeRef}
        className="m-shell-chrome"
        style={{ transform: `translate3d(0, ${-chromeOffset}px, 0)` }}
        aria-hidden={chromeProgress > 0.95}
      >
        <MobileAppBar
          i18n={labels}
          notificationCount={announcements.length}
          onOpenSidebar={openSidebar}
          onOpenNotifications={openNotifications}
          onRefresh={typeof onRefresh === "function" ? refreshPage : undefined}
          refreshing={refreshing}
        />

        {stickyBar ? (
          <div className="m-shell-sticky-wrap">
            <div className="m-shell-sticky-inner">{stickyBar}</div>
          </div>
        ) : null}
      </div>

      <main
        ref={mainRef}
        className="m-shell-main"
        style={{
          paddingTop: mainPadTop,
          paddingBottom: showBottomNav
            ? "calc(env(safe-area-inset-bottom, 0px) + 88px)"
            : "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div
          style={{
            transform: contentShift ? `translate3d(0, ${contentShift}px, 0)` : undefined,
            transition: contentTransition ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          }}
        >
          <PullRefreshIndicator pullPx={pullPx} progress={progress} phase={phase} labels={labels} />
          <div className={refreshing ? "m-shell-main--refreshing" : ""}>{children}</div>
        </div>
      </main>

      {showBottomNav ? (
        <nav
          className={`m-shell-nav${navHidden ? " m-shell-nav--hidden" : ""}`}
          style={{
            transform: `translate3d(0, ${chromeProgress * 120}%, 0)`,
            opacity: Math.max(0, 1 - chromeProgress * 1.15),
          }}
          aria-label="Main"
          aria-hidden={navHidden}
        >
          <div className="m-shell-nav-pill">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                tabIndex={navHidden ? -1 : undefined}
                className={({ isActive }) =>
                  `m-shell-nav-link tap-scale${isActive ? " m-shell-nav-link--active" : ""}`
                }
              >
                <i className={`fas ${item.icon}`} aria-hidden="true" />
                <span>{labels[item.key]}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      {floatingAction ? (
        <div
          className={`m-shell-fab-slot ${showFloating ? "m-shell-fab-slot--visible" : "m-shell-fab-slot--hidden"}`}
          aria-hidden={!showFloating}
        >
          {floatingAction}
        </div>
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
