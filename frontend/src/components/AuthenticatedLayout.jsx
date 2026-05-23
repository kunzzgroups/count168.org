import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/core/apiUrl.js";
import { clearDataCaptureRoundLocalStorage } from "../utils/capture/dataCaptureRoundStorage.js";
import AppBootLoading from "./AppBootLoading.jsx";
import ConfirmLogoutModal from "./ConfirmLogoutModal.jsx";
import { AuthSessionProvider } from "../context/AuthSessionContext.jsx";
import SidebarLangSwitch from "./SidebarLangSwitch.jsx";
import { DASHBOARD_I18N } from "../translateFile/shell/dashboardTranslate.js";
import { applyLoginLang } from "../utils/i18n/useLoginLang.js";
import {
  canAccessFullMaintenance,
  canAccessLimitedMaintenance,
  canAccessPermission,
  showMaintenanceInSidebar,
} from "../utils/auth/sidebarPermissions.js";
import "../../public/css/modal-close-unified.css";

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "ec_sidebar_collapsed";
/** iPad Air 11" (M2) landscape Safari ≈ 1180px; use 1200px to include that viewport. */
/** Galaxy Tab S7 横屏约 1280px，需纳入平板侧栏逻辑 */
const TABLET_MEDIA_QUERY = "(max-width: 1280px)";

const AVATAR_MAP = {
  male1: assetUrl("images/avatar1.png"),
  male2: assetUrl("images/avatar2.png"),
  male3: assetUrl("images/avatar3.png"),
  male4: assetUrl("images/avatar4.png"),
  male5: assetUrl("images/avatar5.png"),
  male6: assetUrl("images/avatar6.png"),
  male7: assetUrl("images/avatar7.png"),
  male8: assetUrl("images/avatar8.png"),
  male9: assetUrl("images/avatar9.png"),
  female1: assetUrl("images/female1.png"),
  female2: assetUrl("images/female2.png"),
  female3: assetUrl("images/female3.png"),
  female4: assetUrl("images/female4.png"),
  female5: assetUrl("images/female5.png"),
  female6: assetUrl("images/female6.png"),
  female7: assetUrl("images/female7.png"),
  female8: assetUrl("images/female8.png"),
  female9: assetUrl("images/female9.png"),
};

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoverSection, setHoverSection] = useState(null);
  const [submenuPos, setSubmenuPos] = useState({ report: { top: 0, left: 0 }, maintenance: { top: 0, left: 0 } });
  const reportTitleRef = useRef(null);
  const maintenanceTitleRef = useRef(null);

  // --- Notification Panel State ---
  const [showNotifications, setShowNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [readAnnouncements, setReadAnnouncements] = useState(new Set());

  // --- Avatar Selector State ---
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [selectedGender, setSelectedGender] = useState(initialAvatarId.startsWith("female") ? "female" : "male");
  const avatarContainerRef = useRef(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const [isTabletViewport, setIsTabletViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(TABLET_MEDIA_QUERY).matches : false
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1"
  );
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const sidebarIconOnly = isTabletViewport && sidebarCollapsed;
  const sidebarTabletExpanded = isTabletViewport && !sidebarCollapsed;

  /* Enter dashboard chrome immediately so refresh/route changes never flash login tile bg. */
  useLayoutEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "ec-auth-shell");
    return () => {
      document.body.classList.remove("dashboard-page", "ec-auth-shell");
      document.body.classList.add("bg");
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") {
        setLang(e.newValue === "zh" ? "zh" : "en");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("lang-zh", lang === "zh");
    document.body.classList.toggle("lang-en", lang !== "zh");
    return () => {
      document.body.classList.remove("lang-zh", "lang-en");
    };
  }, [lang]);

  useEffect(() => {
    const mq = window.matchMedia(TABLET_MEDIA_QUERY);
    const onChange = () => setIsTabletViewport(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", sidebarIconOnly);
    document.body.classList.toggle("sidebar-tablet-expanded", sidebarTabletExpanded);
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event("ec:sidebar-layout-changed"));
    }, 280);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove("sidebar-collapsed", "sidebar-tablet-expanded");
    };
  }, [sidebarIconOnly, sidebarTabletExpanded]);

  const collapseSidebar = useCallback(() => {
    setSidebarCollapsed(true);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "0");
  }, []);

  const onHamburgerClick = (e) => {
    e.stopPropagation();
    if (sidebarCollapsed) expandSidebar();
  };

  const path = location.pathname;
  const prevPathRef = useRef(path);
  useEffect(() => {
    if (!isTabletViewport || sidebarCollapsed) {
      prevPathRef.current = path;
      return;
    }
    if (prevPathRef.current !== path) collapseSidebar();
    prevPathRef.current = path;
  }, [path, isTabletViewport, sidebarCollapsed, collapseSidebar]);

  const sidebarMenuTitle = (label) => (sidebarIconOnly ? label : undefined);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = json.data;
        if (u.user_type === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        if (u.needs_owner_secondary) {
          navigate("/owner-secondary-password", { replace: true });
          return;
        }
        if (u.needs_user_secondary) {
          navigate("/user-secondary-password", { replace: true });
          return;
        }
        setMe(u);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        navigate("/login", { replace: true });
      } finally {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [navigate]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setMe(json.data);
        return json.data;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  useEffect(() => {
    const onCompanySession = () => {
      void refreshSession();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, [refreshSession]);

  useEffect(() => {
    setHoverSection(null);
  }, [location.pathname]);

  // --- Click outside handlers ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarContainerRef.current && !avatarContainerRef.current.contains(e.target)) {
        setShowAvatarOptions(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // --- Notification Logic ---
  const toggleNotifications = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!showNotifications) {
      setShowNotifications(true);
      setAnnouncementsLoading(true);
      try {
        const res = await fetch(buildApiUrl("api/announcements/announcement_get_dashboard_api.php"), { credentials: "include" });
        const json = await res.json();
        if (json.success && json.data) {
          setAnnouncements(json.data);
        } else {
          setAnnouncements([]);
        }
      } catch {
        setAnnouncements([]);
      } finally {
        setAnnouncementsLoading(false);
      }
    } else {
      setShowNotifications(false);
    }
  };

  const markAnnouncementRead = (id) => {
    setReadAnnouncements(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // --- Avatar Logic ---
  const handleSelectAvatar = (avatarId) => {
    setSelectedAvatarId(avatarId);
    setShowAvatarOptions(false);
    try {
      localStorage.setItem("selectedAvatar", avatarId);
    } catch (e) {
      /* ignore */
    }
    document.cookie = `selectedAvatar=${encodeURIComponent(avatarId)}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const canAccess = (key) => canAccessPermission(me, key);
  const showFullMaintenanceMenu = canAccessFullMaintenance(me);
  const showLimitedMaintenanceMenu = canAccessLimitedMaintenance(me);
  const showMaintenanceMenu = showMaintenanceInSidebar(me);
  
  const avatarSrc = useMemo(() => AVATAR_MAP[selectedAvatarId] || AVATAR_MAP.male1, [selectedAvatarId]);
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "";
  const webHref = (path) => new URL(path, window.location.origin).href;
  const processSpaPath = me?.company_has_bank && !me?.company_has_gambling ? "/bank-process-list" : "/process-list";
  const performLogout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Even if request fails, clear client route to login.
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      navigate("/login", { replace: true });
    }
  };
  const isProcessPage = path === "/process-list" || path === "/bank-process-list";
  const applyLanguage = (nextLang) => {
    const normalized = nextLang === "zh" ? "zh" : "en";
    setLang(normalized);
    applyLoginLang(normalized);
  };
  const openHoverSubmenu = (section, el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSubmenuPos((prev) => ({
      ...prev,
      [section]: {
        top: Math.max(8, rect.top - 2),
        left: rect.right,
      },
    }));
    setHoverSection(section);
  };

  const sessionContextValue = useMemo(
    () => ({
      me,
      sessionReady: !loading && Boolean(me),
      refreshSession,
      lang,
    }),
    [me, loading, refreshSession, lang]
  );

  if (loading) return <AppBootLoading label={lang === "zh" ? "正在加载…" : "Loading…"} />;
  if (!me) return <Navigate to="/login" replace />;

  return (
    <AuthSessionProvider value={sessionContextValue}>
    <>
      <div
        className={`informationmenu-overlay sidebar-dismiss-overlay${sidebarTabletExpanded ? " show" : ""}`}
        onClick={collapseSidebar}
        aria-hidden={!sidebarTabletExpanded}
      />
      <div className={`informationmenu${sidebarIconOnly ? " is-collapsed" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="informationmenu-header">
          <div className="header-logo-section">
            {isTabletViewport && sidebarCollapsed && (
              <button
                type="button"
                className="sidebar-hamburger-toggle"
                onClick={onHamburgerClick}
                aria-label={i18n.sidebarExpand}
                aria-expanded={false}
                title={i18n.sidebarExpand}
              >
                <span className="sidebar-hamburger-box" aria-hidden="true">
                  <span className="sidebar-hamburger-line" />
                  <span className="sidebar-hamburger-line" />
                  <span className="sidebar-hamburger-line" />
                </span>
              </button>
            )}
            <img src={assetUrl("images/count_whitelogo.png")} alt="EAZYCOUNT" className="header-logo" />
            <div className="notification-bell" title={i18n.notifications} onClick={toggleNotifications}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
                </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container" ref={avatarContainerRef}>
              <div className="current-avatar" onClick={() => setShowAvatarOptions(!showAvatarOptions)}>
                <img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} />
              </div>
              
              <div className={`avatar-options ${showAvatarOptions ? "show" : ""}`} id="avatarOptions">
                  <div className="options-title">{i18n.chooseAvatar}</div>
                  <div className="gender-selection">
                      <button type="button" className={`gender-btn ${selectedGender === 'male' ? 'active' : ''}`} onClick={() => setSelectedGender('male')}>{i18n.male}</button>
                      <button type="button" className={`gender-btn ${selectedGender === 'female' ? 'active' : ''}`} onClick={() => setSelectedGender('female')}>{i18n.female}</button>
                  </div>
                  
                  <div className={`avatar-list ${selectedGender === 'male' ? 'show' : ''}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                          <div key={`male${num}`} className={`avatar-option ${selectedAvatarId === `male${num}` ? 'selected' : ''}`} onClick={() => handleSelectAvatar(`male${num}`)}>
                              <img src={assetUrl(`images/avatar${num}.png`)} alt={`Male Avatar ${num}`} className="avatar-option-img" />
                          </div>
                      ))}
                  </div>
                  <div className={`avatar-list ${selectedGender === 'female' ? 'show' : ''}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                          <div key={`female${num}`} className={`avatar-option ${selectedAvatarId === `female${num}` ? 'selected' : ''}`} onClick={() => handleSelectAvatar(`female${num}`)}>
                              <img src={assetUrl(`images/female${num}.png`)} alt={`Female Avatar ${num}`} className="avatar-option-img" />
                          </div>
                      ))}
                  </div>
              </div>
            </div>
            
            <div className="user-info">
              <div className="user-name">{me?.name || me?.login_id || "-"}</div>
              <div className="user-role">{roleLabel || i18n.user}</div>
            </div>
          </div>
          <SidebarLangSwitch lang={lang} onLanguageChange={applyLanguage} ariaLabel={i18n.switchLanguage} />
        </div>

        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/dashboard" ? "current-page" : "account-direct"}`} title={sidebarMenuTitle(i18n.sidebarHome)} onClick={() => navigate("/dashboard")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarHome}</span>
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/domain" ? "current-page" : "account-direct"}`} title={sidebarMenuTitle(i18n.sidebarDomain)} onClick={() => navigate("/domain")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarDomain}</span>
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/announcement" ? "current-page" : "account-direct"}`} title={sidebarMenuTitle(i18n.sidebarAnnouncement)} onClick={() => navigate("/announcement")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarAnnouncement}</span>
              </div>
            </div>
          )}
          {canAccess("admin") && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/userlist" ? "current-page" : "account-direct"}`} title={sidebarMenuTitle(i18n.sidebarAdmin)} onClick={() => navigate("/userlist")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarAdmin}</span>
              </div>
            </div>
          )}
          {canAccess("account") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/account-list" ? "current-page" : "account-direct"}`}
                title={sidebarMenuTitle(i18n.sidebarAccount)}
                onClick={() => navigate("/account-list")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarAccount}</span>
              </div>
            </div>
          )}
          {canAccess("ownership") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/ownership" ? "current-page" : "account-direct"}`}
                title={sidebarMenuTitle(i18n.sidebarOwnership)}
                onClick={() => navigate("/ownership")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarOwnership}</span>
              </div>
            </div>
          )}
          {canAccess("process") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${isProcessPage ? "current-page" : "account-direct"}`}
                title={sidebarMenuTitle(i18n.sidebarProcess)}
                onClick={() => navigate(processSpaPath)}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarProcess}</span>
              </div>
            </div>
          )}
          {canAccess("datacapture") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/datacapture" ? "current-page" : "account-direct"}`}
                title={sidebarMenuTitle(i18n.sidebarDataCapture)}
                onClick={() => {
                  if (path === "/datacapturesummary") {
                    clearDataCaptureRoundLocalStorage();
                  }
                  navigate("/datacapture");
                }}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarDataCapture}</span>
              </div>
            </div>
          )}
          {canAccess("payment") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/transaction" ? "current-page" : "account-direct"}`}
                title={sidebarMenuTitle(i18n.sidebarTransactionPayment)}
                onClick={() => navigate("/transaction")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                <span className="sidebar-menu-label">{i18n.sidebarTransactionPayment}</span>
              </div>
            </div>
          )}
          {canAccess("report") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={() => setHoverSection(null)}>
                <div
                  ref={reportTitleRef}
                  className={`informationmenu-section-title ${(path === "/customer-report" || path === "/domain-report") ? "active" : ""}`}
                  data-section="report"
                  title={sidebarMenuTitle(i18n.sidebarReport)}
                  onMouseEnter={() => openHoverSubmenu("report", reportTitleRef.current)}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                  </svg>
                  <span className="sidebar-menu-label">{i18n.sidebarReport}</span>
                  <span className="section-arrow">▶</span>
                </div>
                <div
                  className="submenu"
                  id="report-submenu"
                  style={{
                    position: "fixed",
                    top: submenuPos.report.top,
                    left: submenuPos.report.left,
                    opacity: hoverSection === "report" ? 1 : 0,
                    transform: hoverSection === "report" ? "translateX(0)" : "translateX(-10px)",
                    pointerEvents: hoverSection === "report" ? "auto" : "none",
                    zIndex: 4000,
                  }}
                  aria-hidden={hoverSection !== "report"}
                  onMouseEnter={() => setHoverSection("report")}
                  onMouseLeave={() => setHoverSection(null)}
                >
                  <div className="submenu-content">
                    <a
                      href={webHref("/customer-report")}
                      className={`submenu-item ${path === "/customer-report" ? "current-page" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/customer-report");
                      }}
                    >
                      <span>{i18n.sidebarCustomerReport}</span>
                    </a>
                    <a
                      href={webHref("/domain-report")}
                      className={`submenu-item ${path === "/domain-report" ? "current-page" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/domain-report");
                      }}
                    >
                      <span>{i18n.sidebarDomainReport}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          {showMaintenanceMenu && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={() => setHoverSection(null)}>
                <div
                  ref={maintenanceTitleRef}
                  className={`informationmenu-section-title ${(["/payment-maintenance", "/capture-maintenance", "/transaction-maintenance", "/formula-maintenance", "/bankprocess-maintenance"].includes(path)) ? "active" : ""}`}
                  data-section="maintenance"
                  title={sidebarMenuTitle(i18n.sidebarMaintenance)}
                  onMouseEnter={() => openHoverSubmenu("maintenance", maintenanceTitleRef.current)}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                  </svg>
                  <span className="sidebar-menu-label">{i18n.sidebarMaintenance}</span>
                  <span className="section-arrow">▶</span>
                </div>
                <div
                  className="submenu"
                  id="maintenance-submenu"
                  style={{
                    position: "fixed",
                    top: submenuPos.maintenance.top,
                    left: submenuPos.maintenance.left,
                    opacity: hoverSection === "maintenance" ? 1 : 0,
                    transform: hoverSection === "maintenance" ? "translateX(0)" : "translateX(-10px)",
                    pointerEvents: hoverSection === "maintenance" ? "auto" : "none",
                    zIndex: 4000,
                  }}
                  aria-hidden={hoverSection !== "maintenance"}
                  onMouseEnter={() => setHoverSection("maintenance")}
                  onMouseLeave={() => setHoverSection(null)}
                >
                  <div className="submenu-content">
                    {showFullMaintenanceMenu && me?.company_has_gambling && (
                      <a
                        href={webHref("/capture-maintenance")}
                        className={`submenu-item ${path === "/capture-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/capture-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarDataCapture}</span>
                      </a>
                    )}
                    {me?.company_has_gambling && (showFullMaintenanceMenu || showLimitedMaintenanceMenu) && (
                      <a
                        href={webHref("/transaction-maintenance")}
                        className={`submenu-item ${path === "/transaction-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/transaction-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarTransaction}</span>
                      </a>
                    )}
                    {showFullMaintenanceMenu && (
                      <a
                        href={webHref("/payment-maintenance")}
                        className={`submenu-item ${path === "/payment-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/payment-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarPayment}</span>
                      </a>
                    )}
                    {me?.company_has_gambling && (showFullMaintenanceMenu || showLimitedMaintenanceMenu) && (
                      <a
                        href={webHref("/formula-maintenance")}
                        className={`submenu-item ${path === "/formula-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/formula-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarFormula}</span>
                      </a>
                    )}
                    {showFullMaintenanceMenu && me?.company_has_bank && (
                      <a
                        href={webHref("/bankprocess-maintenance")}
                        className={`submenu-item ${path === "/bankprocess-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/bankprocess-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarProcess}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">{i18n.exp}</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button
            type="button"
            className="btn logout-btn"
            title={sidebarMenuTitle(i18n.logout)}
            onClick={() => setShowLogoutConfirm(true)}
          >
            {sidebarIconOnly ? (
              <svg className="logout-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              i18n.logout
            )}
          </button>
        </div>
      </div>

      <div className={`notification-overlay ${showNotifications ? "show" : ""}`} id="notificationOverlay" onClick={toggleNotifications}></div>
      <div className={`notification-panel ${showNotifications ? "show" : ""}`} id="notificationPanel">
        <div className="notification-header">
            <h2>{i18n.announcements}</h2>
            <button className="notification-close" onClick={toggleNotifications} title={i18n.close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div className="notification-content" id="notificationContent">
          {announcementsLoading ? (
            <div className="notification-empty"><p>{i18n.loadingAnnouncements}</p></div>
          ) : announcements.length > 0 ? (
            announcements.map((announcement, index) => (
              <div key={index} className={`notification-item ${readAnnouncements.has(index) ? '' : 'unread'}`} onClick={() => markAnnouncementRead(index)}>
                <div className="notification-title">{announcement.title}</div>
                <div className="notification-message">{announcement.content}</div>
                <div className="notification-time">{announcement.created_at}</div>
              </div>
            ))
          ) : (
            <div className="notification-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              <p>{i18n.noAnnouncements}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmLogoutModal
        open={showLogoutConfirm}
        loading={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={performLogout}
        i18n={i18n}
      />

      <Outlet />
    </>
    </AuthSessionProvider>
  );
}
