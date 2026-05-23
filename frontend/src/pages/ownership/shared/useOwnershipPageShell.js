import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getOwnershipText } from "../../../translateFile/pages/ownershipTranslate.js";
import { getApiMessage, isApiSuccess } from "./ownershipHelpers.js";

export function useOwnershipPageShell() {
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getOwnershipText(lang, key, params), [lang]);
  const [boot, setBoot] = useState(true);
  const [cssReady, setCssReady] = useState(false);
  const [activeTab, setActiveTab] = useState("account-ownership");
  const [loadingList, setLoadingList] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]);
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "ownership-page");
    setCssReady(true);
    return () => {
      document.body.classList.remove("ownership-page");
      setCssReady(false);
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_companies_api.php?all=1"), {
        credentials: "include",
      });
      const json = await res.json();
      if (isApiSuccess(json)) setAllCompanies(json.data || []);
      else showToast(getApiMessage(json, "Failed to load companies"), "error");
      setReadOnlyMode(false);
    } catch {
      showToast("Server error", "error");
    } finally {
      setLoadingList(false);
      setBoot(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  return {
    lang,
    t,
    boot,
    cssReady,
    activeTab,
    setActiveTab,
    loadingList,
    allCompanies,
    setAllCompanies,
    fetchCompanies,
    toast,
    showToast,
    conflict,
    setConflict,
    readOnlyMode,
  };
}
