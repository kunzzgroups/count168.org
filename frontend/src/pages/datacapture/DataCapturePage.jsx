import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { injectStylesheet } from "../../utils/core/injectStylesheet.js";
import {
  applySharedGroupClickWithCompanySwitch,
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  isCompanyVisibleForSharedFilter,
  normalizeOwnerCompanyRow,
  persistDashboardGroupFilter,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
} from "../../utils/company/sharedCompanyFilter.js";

import "../../../public/css/userlist.css";
import "../../../public/css/global-13inch.css";
import "../../../public/css/datacapture.css";

import { formatSubmittedProcessDateTime } from "./lib/dataCaptureApi.js";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveCompanyGamesAccess,
  syncDataCaptureCompanySession,
} from "./lib/dataCaptureCompanyAccess.js";
import DataCaptureContextMenus from "./components/DataCaptureContextMenus.jsx";
import DataCaptureDeleteDialog from "./components/DataCaptureDeleteDialog.jsx";
import DataCaptureTableSection from "./components/DataCaptureTableSection.jsx";
import DescriptionSelectionModal from "./components/DescriptionSelectionModal.jsx";
import ProcessNotificationContainer from "./components/ProcessNotificationContainer.jsx";
import { useDataCaptureCategoryPermissions } from "./hooks/useDataCaptureCategoryPermissions.js";
import { useDataCaptureFormEngine } from "./hooks/useDataCaptureFormEngine.js";
import { useDataCaptureGrid } from "./hooks/useDataCaptureGrid.js";
import { useDataCaptureGridInteraction } from "./hooks/useDataCaptureGridInteraction.js";
import { useDataCapturePaste } from "./hooks/useDataCapturePaste.js";
import { useDataCaptureCaptureType } from "./hooks/useDataCaptureCaptureType.js";
import { useDataCaptureFormatPaste } from "./hooks/useDataCaptureFormatPaste.js";
import { useDataCaptureFormatDisplay } from "./hooks/useDataCaptureFormatDisplay.js";
import { useDataCaptureGlobalShims } from "./hooks/useDataCaptureGlobalShims.js";
import { useDataCaptureGridHeader } from "./hooks/useDataCaptureGridHeader.js";
import { useDataCaptureLegacyChrome } from "./hooks/useDataCaptureLegacyChrome.js";
import { useDataCaptureSubmitReset } from "./hooks/useDataCaptureSubmitReset.js";
import { usePartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { useDataCaptureSubmittedList } from "./hooks/useDataCaptureSubmittedList.js";
import { useDataCaptureSubmittedPanelHeight } from "./hooks/useDataCaptureSubmittedPanelHeight.js";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { preloadSummaryLegacyScriptsInBackground } from "../datacapturesummary/lib/preloadSummaryLegacyScripts.js";
import { getDataCaptureText } from "../../translateFile/pages/dataCaptureTranslate.js";

/** Avoid hanging when a script tag already fired `load` before listeners attach (SPA revisit / cache). */
function loadScriptOnce(src, isAlreadyLoaded) {
  return new Promise((resolve, reject) => {
    const clean = src.split(/[?#]/)[0];
    const finish = (node) => {
      node.dataset.loaded = "1";
      resolve();
    };
    const nodes = document.querySelectorAll("script[src]");
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const ns = n.getAttribute("src") || "";
      if (ns.split(/[?#]/)[0] !== clean) continue;
      if (n.dataset.loaded === "1") {
        resolve();
        return;
      }
      n.addEventListener("load", () => finish(n), { once: true });
      n.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      queueMicrotask(() => {
        if (n.dataset.loaded === "1") return;
        if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) finish(n);
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => finish(s);
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

class DataCaptureErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("DataCaptureErrorBoundary", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div className="container" style={{ padding: "24px" }}>
          <h2 style={{ marginTop: 0 }}>{getDataCaptureText(lang, "renderFailedTitle")}</h2>
          <p style={{ color: "#b91c1c", marginBottom: 12 }} role="alert">
            {msg}
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            {getDataCaptureText(lang, "renderFailedHint")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DataCapturePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { me, sessionReady } = useAuthSession();
  const companyIdFromUrl = searchParams.get("company_id");
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getDataCaptureText(lang, key, params), [lang]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const next = e?.detail?.lang;
      setLang(next === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const [bootLoading, setBootLoading] = useState(true);
  const [engineError, setEngineError] = useState("");
  const [scriptsReady, setScriptsReady] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  /** Set as soon as this route mounts (including Loading…), before scripts run — legacy uses it to skip DOM that React owns. */
  useLayoutEffect(() => {
    window.__DATA_CAPTURE_SPA_BOOTSTRAP__ = true;
    window.isNavigatingAwayByBackOrSubmit = false;
    return () => {
      try {
        delete window.__DATA_CAPTURE_SPA_BOOTSTRAP__;
      } catch {
        window.__DATA_CAPTURE_SPA_BOOTSTRAP__ = undefined;
      }
    };
  }, []);

  const companiesNormalized = useMemo(() => companies.map(normalizeOwnerCompanyRow), [companies]);

  const companiesDeduped = useMemo(
    () => dedupeOwnerCompaniesByCode(companiesNormalized, companyId),
    [companiesNormalized, companyId]
  );

  const groups = useMemo(() => sortedUniqueGroupIds(companiesDeduped), [companiesDeduped]);

  /** Full list: deduped strips rows without display code; URL session can still target a valid numeric id. */
  const currentCompanyRow = useMemo(
    () => companiesNormalized.find((c) => Number(c.id) === Number(companyId)) || null,
    [companiesNormalized, companyId]
  );

  const companyCode = useMemo(() => {
    const raw = currentCompanyRow?.company_id;
    if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    if (companyId != null && Number(companyId) > 0) return String(companyId);
    return "";
  }, [currentCompanyRow, companyId]);

  const form = useDataCaptureFormEngine(companyId);

  const { submittedItems } = useDataCaptureSubmittedList(companyId, form.captureDate);

  const { topSectionRef, formColumnRef } = useDataCaptureSubmittedPanelHeight();

  const { permissions, selectedPermission, selectPermission, showPermissionFilter } =
    useDataCaptureCategoryPermissions(companyCode);

  const {
    captureType,
    citibetMode,
    formatGridReady,
    handleCaptureTypeChange,
  } = useDataCaptureCaptureType();

  const {
    deleteOpen,
    deleteOption,
    setDeleteOption,
    handleConfirmDelete,
    closeDeleteDialog,
  } = useDataCaptureLegacyChrome();

  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(me);
  const submitReset = useDataCaptureSubmitReset({
    companyId,
    form,
    captureType,
    mutationsBlocked,
    navigate,
    t,
  });

  useDataCaptureGrid(scriptsReady);
  useDataCaptureGridInteraction(scriptsReady);
  useDataCapturePaste();
  useDataCaptureFormatPaste();
  useDataCaptureFormatDisplay();
  useDataCaptureGlobalShims();

  useEffect(() => {
    if (!scriptsReady) return;

    const pageReadyTimer = setTimeout(() => {
      document.body.classList.add("page-ready");
    }, 50);

    const updateMenuPosition = () => {
      if (typeof window.updateActiveContextMenuPosition === "function") {
        window.updateActiveContextMenuPosition();
      }
    };

    const scrollContainer = document.querySelector(".excel-table-container");
    scrollContainer?.addEventListener("scroll", updateMenuPosition, { passive: true });
    window.addEventListener("resize", updateMenuPosition);

    return () => {
      clearTimeout(pageReadyTimer);
      scrollContainer?.removeEventListener("scroll", updateMenuPosition);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [scriptsReady]);
  useDataCaptureGridHeader();

  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);

  const openDescriptionModal = useCallback(() => {
    if (!companyId) return;
    setDescriptionModalOpen(true);
  }, [companyId]);

  const closeDescriptionModal = useCallback(() => setDescriptionModalOpen(false), []);

  const handleDescriptionsConfirmed = useCallback((names) => {
    window.selectedDescriptions = [...names];
    if (typeof window.__DC_ON_DESCRIPTIONS_CONFIRMED__ === "function") {
      window.__DC_ON_DESCRIPTIONS_CONFIRMED__(names);
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
    setDescriptionModalOpen(false);
  }, []);

  useLayoutEffect(() => {
    window.__DC_OPEN_DESCRIPTION_MODAL__ = openDescriptionModal;
    window.__DC_CLOSE_DESCRIPTION_MODAL__ = closeDescriptionModal;
    /** Legacy onclick / scripts expect expandDescription() */
    window.expandDescription = openDescriptionModal;
    return () => {
      try {
        delete window.__DC_OPEN_DESCRIPTION_MODAL__;
        delete window.__DC_CLOSE_DESCRIPTION_MODAL__;
        delete window.expandDescription;
      } catch {
        window.__DC_OPEN_DESCRIPTION_MODAL__ = undefined;
        window.__DC_CLOSE_DESCRIPTION_MODAL__ = undefined;
        window.expandDescription = undefined;
      }
    };
  }, [openDescriptionModal, closeDescriptionModal]);

  useEffect(() => {
    if (!form.processOpen) return;
    const onDoc = (e) => {
      const btn = document.getElementById("capture_process");
      const dd = document.getElementById("capture_process_dropdown");
      if (btn?.contains(e.target) || dd?.contains(e.target)) return;
      form.setProcessOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [form.processOpen, form.setProcessOpen]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page");
    document.body.classList.add("dashboard-page", "datacapture-page");
    return () => {
      document.body.classList.remove("datacapture-page", "page-ready");
      document.getElementById("dataCaptureForm")?.removeAttribute("data-dc-page-init");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
      } catch {
        /* ignore */
      }
      try {
        const u = me;
        const companiesRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
          credentials: "include",
        });
        const companiesJson = await companiesRes.json();

        const perms = Array.isArray(u.company_permissions) ? u.company_permissions : [];
        if (cancelled) return;
        if (perms.length === 0) {
          navigate("/process-list?error=no_permission", { replace: true });
          return;
        }

        const raw = Array.isArray(companiesJson?.data) ? companiesJson.data.map(normalizeOwnerCompanyRow) : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effectiveCompany = queryCompany || u.company_id || raw[0]?.id || null;
        effectiveCompany = effectiveCompany ? Number(effectiveCompany) : null;

        if (queryCompany && effectiveCompany && Number(effectiveCompany) !== Number(u.company_id)) {
          try {
            const syncRes = await fetch(
              buildApiUrl(`api/session/update_company_session_api.php?company_id=${effectiveCompany}`),
              { credentials: "include" }
            );
            const syncJson = await syncRes.json();
            if (!syncJson.success) {
              effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
          }
        }

        const rowForPick = raw.find((c) => Number(c.id) === Number(effectiveCompany)) || null;
        const pickCode =
          rowForPick?.company_id != null && String(rowForPick.company_id).trim() !== ""
            ? String(rowForPick.company_id).trim()
            : effectiveCompany
              ? String(effectiveCompany)
              : "";

        const hasGamesAccess = await resolveCompanyGamesAccess({
          companyId: effectiveCompany,
          companyCode: pickCode,
          sessionUser: u,
        });
        if (cancelled) return;
        if (!hasGamesAccess) {
          navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
          return;
        }

        const initialGroup = resolveInitialSelectedGroupFromSession(raw, rowForPick);

        setCompanies(raw);
        setCompanyId(effectiveCompany);
        setSelectedGroup(initialGroup);
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  useEffect(() => {
    if (bootLoading || !companyIdFromUrl || companies.length === 0) return;
    const id = Number(companyIdFromUrl);
    if (!Number.isFinite(id) || id <= 0) return;
    const allowed = companies.some((c) => Number(c.id) === id);
    if (!allowed || Number(companyId) === id) return;

    let cancelled = false;
    (async () => {
      try {
        const syncJson = await syncDataCaptureCompanySession(id);
        if (!syncJson.success) return;
        if (syncJson.data?.has_gambling === false) {
          navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
          return;
        }
      } catch {
        return;
      }
      if (!cancelled) {
        setCompanyId(id);
        notifyCompanySessionUpdated();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyIdFromUrl, companies, companyId]);

  const switchCompanySessionAndNavigate = useCallback(async (nextCompanyId) => {
    const id = Number(nextCompanyId);
    if (!id) return;

    try {
      const syncJson = await syncDataCaptureCompanySession(id);
      if (!syncJson.success) return;

      notifyCompanySessionUpdated();

      if (syncJson.data?.has_gambling === false) {
        navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
        return;
      }
    } catch {
      navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
      return;
    }

    navigate(`/datacapture?company_id=${encodeURIComponent(id)}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (bootLoading || !me || !companyId) return;

    window.DATACAPTURE_COMPANY_ID = companyId;
    window.DATACAPTURE_USER_ROLE = String(me.role || "").toLowerCase();
    window.DATACAPTURE_COMPANY_CODE = companyCode || String(companyId);

    window.__DATA_CAPTURE_SPA_NAVIGATE_COMPANY__ = async (rawId) => {
      await switchCompanySessionAndNavigate(Number(rawId));
    };

    window.onSharedCompanyFilterChanged = (cid) => {
      if (cid) window.switchDataCaptureCompany?.(Number(cid));
    };

    let alive = true;
    setEngineError("");
    setScriptsReady(false);

    (async () => {
      try {
        await loadScriptOnce(buildApiUrl("js/decimal.min.js"), () => typeof window.Decimal !== "undefined");
        await loadScriptOnce(buildApiUrl("js/money-decimal.js"), () => typeof window.MoneyDecimal !== "undefined");
        if (!alive) return;
        if (typeof window.__DC_SPA_INIT_PAGE__ === "function") {
          await window.__DC_SPA_INIT_PAGE__();
        }
        if (!alive) return;
        if (typeof window.__DC_ENSURE_GRID_READY__ === "function") {
          window.__DC_ENSURE_GRID_READY__(26, 20);
        }
        if (typeof window.__DC_RECOMPUTE_SUBMIT_STATE__ === "function") {
          window.__DC_RECOMPUTE_SUBMIT_STATE__();
        }
        if (alive) setScriptsReady(true);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setEngineError("Failed to load Data Capture scripts.");
        setScriptsReady(false);
      }
    })();

    return () => {
      alive = false;
      setScriptsReady(false);
      document.getElementById("dataCaptureForm")?.removeAttribute("data-dc-page-init");
      try {
        delete window.__DATA_CAPTURE_SPA_NAVIGATE_COMPANY__;
      } catch {
        window.__DATA_CAPTURE_SPA_NAVIGATE_COMPANY__ = undefined;
      }
      try {
        delete window.onSharedCompanyFilterChanged;
      } catch {
        window.onSharedCompanyFilterChanged = undefined;
      }
    };
  }, [bootLoading, me, companyId, switchCompanySessionAndNavigate]);

  useEffect(() => {
    if (!scriptsReady) return;
    preloadSummaryLegacyScriptsInBackground();
  }, [scriptsReady]);

  useEffect(() => {
    if (!companyId) return;
    window.DATACAPTURE_COMPANY_ID = companyId;
    window.DATACAPTURE_COMPANY_CODE = companyCode || String(companyId);
  }, [companyId, companyCode]);

  const onGroupClick = async (gid) => {
    await applySharedGroupClickWithCompanySwitch({
      clickedGroupId: gid,
      currentSelectedGroup: selectedGroup,
      companies: companiesDeduped,
      currentCompanyId: companyId,
      setSelectedGroup,
      switchCompany: async (comp) => switchCompanySessionAndNavigate(comp.id),
    });
  };

  const onCompanyClick = async (comp) => {
    if (!comp?.id) return;
    persistDashboardGroupFilter(selectedGroup);
    await switchCompanySessionAndNavigate(comp.id);
  };

  if (bootLoading) {
    return <PageContentLoader />;
  }

  const list = filterCompaniesWithDisplayId(companiesDeduped);

  return (
    <DataCaptureErrorBoundary key={companyId ?? "none"}>
      <div className="container" key={companyId ?? "none"}>
      <div className="dc-page-toolbar">
        <h1>{t("pageTitle")}</h1>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div
            id="data-capture-permission-filter"
            className="data-capture-company-filter data-capture-permission-filter-header"
            style={{ display: showPermissionFilter ? "flex" : "none" }}
          >
            <span className="data-capture-company-label">{t("category")}</span>
            <div id="data-capture-permission-buttons" className="data-capture-company-buttons">
              {permissions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`data-capture-company-btn${selectedPermission === p ? " active" : ""}`.trim()}
                  data-permission={p}
                  onClick={() => selectPermission(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {engineError ? (
        <div style={{ marginBottom: 12, color: "#b91c1c" }} role="alert">
          {engineError}
        </div>
      ) : null}

      <div className="top-section" ref={topSectionRef}>
        <div className="form-column" ref={formColumnRef}>
          <div className="form-container">
            <form
              id="dataCaptureForm"
              data-ezc-spa="1"
              className="process-form"
              method="POST"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              {(groups.length > 0 || list.length > 0) && (
                <div className="user-gc-inline-panel dc-data-capture-gc-panel">
                  {groups.length > 0 ? (
                    <div id="group-buttons-wrapper" className="user-gc-inline-row shared-group-wrapper">
                      <span className="user-gc-inline-label">{t("groupId")}</span>
                      <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                        <div id="group-buttons-container" className="user-gc-segment-group" role="group" aria-label={t("groupAria")}>
                          {groups.map((gid) => (
                            <button
                              key={gid}
                              type="button"
                              className={`user-gc-segment shared-group-btn ${selectedGroup === gid ? "active is-on" : ""}`.trim()}
                              data-group-id={gid}
                              onClick={() => void onGroupClick(gid)}
                            >
                              {gid}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {list.length > 0 ? (
                    <div id="company-buttons-wrapper" className="user-gc-inline-row shared-company-wrapper">
                      <span className="user-gc-inline-label">{t("company")}</span>
                      <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                        <div id="company-buttons-container" className="user-gc-segment-group" role="group" aria-label={t("companyAria")}>
                          {list.map((comp) => {
                            const gid = String(comp.group_id || "").trim().toUpperCase();
                            const visible = isCompanyVisibleForSharedFilter(comp, selectedGroup, false, "follow");
                            const active = Number(comp.id) === Number(companyId);
                            return (
                              <button
                                key={comp.id}
                                type="button"
                                style={{ display: visible ? undefined : "none" }}
                                className={`user-gc-segment shared-company-btn ${active ? "active is-on" : ""}`.trim()}
                                data-company-id={comp.id}
                                data-group-id={gid}
                                data-company-code={comp.company_id || ""}
                                onClick={() => void onCompanyClick(comp)}
                              >
                                {comp.company_id}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="dc-form-two-col dc-form-two-col--stacked">
                <div className="form-group">
                  <label htmlFor="capture_date">{t("date")}</label>
                  <select id="capture_date" name="capture_date" required value={form.captureDate} onChange={(e) => void form.onDateChange(e)}>
                    {form.dateOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_process">{t("process")}</label>
                  <div className="custom-select-wrapper">
                    <button
                      type="button"
                      className={`custom-select-button${form.processOpen ? " open" : ""}`.trim()}
                      id="capture_process"
                      data-placeholder={t("selectProcess")}
                      name="process"
                      {...(form.selectedProcess?.id
                        ? {
                            "data-value": form.selectedProcess.id,
                            "data-process-code": form.selectedProcess.process_id || "",
                            ...(form.selectedProcess.description_name
                              ? { "data-description-name": form.selectedProcess.description_name }
                              : {}),
                          }
                        : {})}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof window.tableActive !== "undefined") window.tableActive = false;
                        form.setProcessOpen((o) => !o);
                      }}
                    >
                      {form.selectedProcess?.displayText || t("selectProcess")}
                    </button>
                    <div
                      className={`custom-select-dropdown${form.processOpen ? " show" : ""}`.trim()}
                      id="capture_process_dropdown"
                    >
                      <div className="custom-select-search">
                        <input
                          ref={form.processSearchInputRef}
                          type="text"
                          placeholder={t("searchProcess")}
                          autoComplete="off"
                          value={form.processFilter}
                          onChange={(e) => form.setProcessFilter(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              form.setProcessOpen(false);
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              const first = form.filteredProcesses[0];
                              if (first) void form.selectProcessRow(first);
                            }
                          }}
                        />
                      </div>
                      {/* Legacy `loadProcessesByDate` clears the first `.custom-select-options` — keep an empty decoy. */}
                      <div
                        className="custom-select-options dc-legacy-process-options-host"
                        aria-hidden="true"
                        style={{ display: "none" }}
                      />
                      <div className="custom-select-options dc-react-process-options">
                        {form.processListTruncated ? (
                          <div className="custom-select-option custom-select-option--hint" style={{ cursor: "default", opacity: 0.85 }}>
                            {t("typeToSearchProcesses", { count: form.processRowsCount })}
                          </div>
                        ) : null}
                        {form.visibleProcesses.map((row) => (
                          <div
                            key={row.id}
                            role="presentation"
                            className="custom-select-option"
                            onClick={() => void form.selectProcessRow(row)}
                          >
                            {form.displayTextFromProcessRow(row)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dc-form-two-col dc-form-two-col--stacked">
                <div className="form-group">
                  <label htmlFor="capture_description">{t("description")}</label>
                  <div className="input-with-icon">
                    <input
                      type="text"
                      id="capture_description"
                      name="description"
                      required
                      readOnly
                      placeholder={t("clickToSelectDescriptions")}
                      value={form.descriptionDisplay}
                    />
                    <button
                      type="button"
                      className="add-icon"
                      onClick={() => openDescriptionModal()}
                      title={t("selectDescriptions")}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_currency">{t("currency")}</label>
                  <select
                    id="capture_currency"
                    name="currency"
                    value={form.currencyId}
                    onChange={(e) => {
                      form.setCurrencyId(e.target.value);
                      setTimeout(() => window.updateSubmitButtonState?.(), 0);
                    }}
                  >
                    <option value="">{t("selectCurrency")}</option>
                    {form.currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dc-form-bottom-block">
                <div className="form-group replace-word-group dc-replace-word-field">
                  <label htmlFor="capture_replace_word_from">{t("replaceWord")}</label>
                  <div className="replace-word-fields">
                    <input
                      type="text"
                      id="capture_replace_word_from"
                      name="replace_word_from"
                      placeholder={t("oldWord")}
                      value={form.replaceFrom}
                      onChange={(e) => form.setReplaceFrom(e.target.value.toUpperCase())}
                    />
                    <span className="replace-arrow">→</span>
                    <input
                      type="text"
                      id="capture_replace_word_to"
                      name="replace_word_to"
                      placeholder={t("newWord")}
                      value={form.replaceTo}
                      onChange={(e) => form.setReplaceTo(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="dc-form-remove-remark-grid">
                  <label htmlFor="capture_remove_word" className="dc-remove-remark__label dc-remove-remark__label--rm">
                    {t("removeWord")}
                  </label>
                  <label htmlFor="capture_remark" className="dc-remove-remark__label dc-remove-remark__label--mk">
                    {t("remark")}
                  </label>
                  <input
                    type="text"
                    id="capture_remove_word"
                    name="remove_word"
                    className="dc-remove-remark__input dc-remove-remark__input--rm"
                    placeholder={t("enterWordsToRemove")}
                    value={form.removeWord}
                    onChange={(e) => form.setRemoveWord(e.target.value.toUpperCase())}
                  />
                  <input
                    type="text"
                    id="capture_remark"
                    name="remark"
                    className="dc-remove-remark__input dc-remove-remark__input--mk"
                    placeholder={t("enterRemark")}
                    value={form.remark}
                    onChange={(e) => form.setRemark(e.target.value.toUpperCase())}
                  />
                  <small className="field-help dc-remove-remark__help" style={{ display: "block", marginTop: 0, fontStyle: "italic", color: "#666" }}>
                    {t("removeWordHelp")}
                  </small>
                  <div className="dc-remove-remark__slot" aria-hidden="true" />
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="submitted-column">
          <div className="submitted-container">
            <h2 className="submitted-title">{t("submittedProcesses")}</h2>
            <div className="submitted-list">
              {/* Legacy `renderSubmittedProcesses` sets innerHTML on `#submittedProcessesList` — decoy only. */}
              <div id="submittedProcessesList" className="dc-legacy-submitted-host" aria-hidden="true" style={{ display: "none" }} />
              <div className="dc-react-submitted-list">
              {submittedItems.length === 0 ? (
                <div className="no-data">{t("noProcessesSubmitted")}</div>
              ) : (
                submittedItems.map((process, index) => (
                  <div
                    key={
                      process.id != null
                        ? String(process.id)
                        : `sub-${index}-${process.process_code}-${process.created_at || ""}-${process.submitted_by || ""}`
                    }
                    className="submitted-item"
                  >
                    <div className="submitted-details">
                      <div className="detail-row">
                        <strong>
                          {process.process_code}
                          {process.description_name ? ` (${process.description_name})` : ""}
                        </strong>
                        <div className="submitted-meta">
                          <span className="submitted-by">{process.submitted_by}</span>
                          <span className="submitted-date">{formatSubmittedProcessDateTime(process)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DataCaptureTableSection
        t={t}
        captureType={captureType}
        citibetMode={citibetMode}
        formatGridReady={formatGridReady}
        tableHasData={submitReset.tableHasData}
        onCaptureTypeChange={handleCaptureTypeChange}
        submitDisabled={submitReset.submitDisabled || mutationsBlocked}
        onSubmit={() => void submitReset.submit()}
        onReset={submitReset.reset}
      />

      <DescriptionSelectionModal
        t={t}
        open={descriptionModalOpen}
        onClose={closeDescriptionModal}
        companyId={companyId}
        onConfirm={handleDescriptionsConfirmed}
      />

      <ProcessNotificationContainer />

      <DataCaptureContextMenus t={t} />

      <DataCaptureDeleteDialog
        t={t}
        open={deleteOpen}
        deleteOption={deleteOption}
        onDeleteOptionChange={setDeleteOption}
        onConfirm={handleConfirmDelete}
        onClose={closeDeleteDialog}
      />
    </div>
    </DataCaptureErrorBoundary>
  );
}
