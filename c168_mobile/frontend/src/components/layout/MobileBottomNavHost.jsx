import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMobileSession } from "../../hooks/useMobileSession.js";
import { DASHBOARD_I18N } from "../../translateFile/dashboardTranslate.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileBottomNav from "./MobileBottomNav.jsx";
import "./mobile-shell.css";

function shouldShowBottomNav(pathname) {
  if (pathname === "/" || pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/owner-secondary-password")) return false;
  if (pathname.startsWith("/user-secondary-password")) return false;
  if (pathname.startsWith("/reset-password")) return false;
  if (pathname.startsWith("/member")) return false;
  if (pathname.startsWith("/transaction/history")) return false;
  return true;
}

/**
 * Persistent bottom nav — stays mounted across route changes so layoutId
 * indicator animation does not flash when switching tabs.
 */
export default function MobileBottomNavHost() {
  const { pathname } = useLocation();
  const me = useMobileSession();
  const [lang, setLang] = useState(() => localStorage.getItem("login_lang") || "en");

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang" && e.newValue) setLang(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const labels = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const items = me ? mobileNavItems(me) : [];
  const visible = Boolean(me) && items.length > 0 && shouldShowBottomNav(pathname);

  if (!visible) return null;

  return (
    <nav className="m-shell-nav" data-persistent-nav aria-label="Main">
      <MobileBottomNav items={items} labels={labels} />
    </nav>
  );
}
