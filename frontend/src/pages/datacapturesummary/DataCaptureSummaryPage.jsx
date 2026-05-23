import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { injectStylesheet } from "../../utils/core/injectStylesheet.js";
import SummaryProcessInfo from "./components/SummaryProcessInfo.jsx";
import SummaryTable, { SummaryEmptyState } from "./components/SummaryTable.jsx";
import EditFormulaModal from "./components/EditFormulaModal.jsx";
import AccountModal from "../../components/AccountModal.jsx";
import { useSummaryEditFormula } from "./hooks/useSummaryEditFormula.js";
import { useSummaryAddAccount, purgeLegacySummaryAddAccountModal } from "./hooks/useSummaryAddAccount.js";
import SummaryActionBar from "./components/SummaryActionBar.jsx";
import SummarySubmitBar from "./components/SummarySubmitBar.jsx";
import SummaryNotification from "./components/SummaryNotification.jsx";
import SummaryConfirmDeleteModal from "./components/SummaryConfirmDeleteModal.jsx";
import { useSummaryBoot } from "./hooks/useSummaryBoot.js";
import { useSummaryCaptureBootstrap } from "./hooks/useSummaryCaptureBootstrap.js";
import { useSummaryRows } from "./hooks/useSummaryRows.js";
import { useSummaryPageActions } from "./hooks/useSummaryPageActions.js";
import { useSummaryOverlays } from "./hooks/useSummaryOverlays.js";
import { useSummaryLegacyChrome } from "./hooks/useSummaryLegacyChrome.js";
import {
  useSummaryTableBridge,
  hideSummaryLoadingChrome,
  showSummaryTableChrome,
  removeLegacySummaryEmptyStateDom,
} from "./hooks/useSummaryTableBridge.js";
import { useSummaryTablePopulate } from "./hooks/useSummaryTablePopulate.js";
import { useSummaryFormulaEngine } from "./hooks/useSummaryFormulaEngine.js";
import { clearSummaryCaptureRoundStorage } from "./lib/summaryStorage.js";
import { applySummaryDomLabels } from "./lib/summaryDomI18n.js";
import {
  getDataCaptureSummaryText,
  getSummaryRateSelectLabels,
  translateDataCaptureSummaryNotification,
} from "../../translateFile/pages/dataCaptureSummaryTranslate.js";
import {
  areSummaryLegacyScriptsLoaded,
  ensureSummaryLegacyScriptsLoaded,
} from "./lib/preloadSummaryLegacyScripts.js";

import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/datacapturesummary.css";
import "../../../public/css/global-13inch.css";

class SummaryPageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
      return (
        <div className="container">
          <h1>{getDataCaptureSummaryText(lang, "pageTitle")}</h1>
          <p role="alert" style={{ color: "#b91c1c", padding: "12px 0" }}>
            {getDataCaptureSummaryText(lang, "loadPageFailed")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DataCaptureSummaryPageInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getDataCaptureSummaryText(lang, key, params), [lang]);

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

  useLayoutEffect(() => {
    window.__SUMMARY_RATE_SELECT_LABELS__ = getSummaryRateSelectLabels(lang);
    window.__SUMMARY_TRANSLATE_NOTIFICATION__ = ({ title, message }) =>
      translateDataCaptureSummaryNotification(lang, title, message);
    window.__SUMMARY_I18N_TEXT__ = (key, params) => getDataCaptureSummaryText(lang, key, params);
    window.__SUMMARY_SYNC_DELETE_BUTTON_LABEL__?.();
    window.updateDeleteButton?.();
    return () => {
      delete window.__SUMMARY_RATE_SELECT_LABELS__;
      delete window.__SUMMARY_TRANSLATE_NOTIFICATION__;
      delete window.__SUMMARY_I18N_TEXT__;
    };
  }, [lang]);

  const { companyId, mutationsBlocked, bootLoading: sessionBootLoading, bootError } = useSummaryBoot();

  const [scriptsReady, setScriptsReady] = useState(() => areSummaryLegacyScriptsLoaded());
  const [engineError, setEngineError] = useState("");
  const [legacyInitDone, setLegacyInitDone] = useState(false);
  const [dataPopulating, setDataPopulating] = useState(false);

  const sessionReady = !sessionBootLoading && !bootError && companyId != null;

  const capture = useSummaryCaptureBootstrap({
    companyId,
    searchParams,
    enabled: sessionReady,
  });

  const { rows: summaryRows, syncFromDom, resetToInitialRows } = useSummaryRows(
    capture.transformedTableData,
    capture.hasCaptureData
  );

  useSummaryTableBridge({
    hasCaptureData: capture.hasCaptureData,
    processData: capture.processData,
  });

  useSummaryTablePopulate({
    tableData: capture.transformedTableData,
    hasCaptureData: capture.hasCaptureData,
    scriptsReady,
    legacyInitDone,
    syncFromDom,
    resetToInitialRows,
    onPopulatingChange: setDataPopulating,
  });

  useEffect(() => {
    if (capture.hasCaptureData && scriptsReady) {
      setDataPopulating(true);
    } else if (!capture.hasCaptureData) {
      setDataPopulating(false);
    }
  }, [capture.hasCaptureData, scriptsReady]);

  const pageActions = useSummaryPageActions({ companyId, scriptsReady, mutationsBlocked, t });
  const editFormula = useSummaryEditFormula({ scriptsReady, t });
  const overlays = useSummaryOverlays();
  const addAccount = useSummaryAddAccount({
    companyId,
    scriptsReady,
    notify: overlays.showNotification,
  });
  useSummaryFormulaEngine();
  useSummaryLegacyChrome(scriptsReady);

  useEffect(() => {
    if (!scriptsReady) return;
    applySummaryDomLabels(t);
  }, [lang, t, scriptsReady, legacyInitDone, editFormula.open]);

  const showEmptyState =
    sessionReady &&
    scriptsReady &&
    !engineError &&
    !capture.hasCaptureData &&
    !(capture.serverStateQueryEnabled && capture.serverStateLoading);

  /** Revisit only: wait for saved summary state. Fresh capture (?success=1) must not block init. */
  const waitForServerStateBeforeInit =
    capture.hasCaptureData &&
    !capture.freshFromCapture &&
    capture.serverStateQueryEnabled &&
    capture.serverStateLoading;

  const hydrateRef = useRef(capture.hydrateLegacyGlobals);
  hydrateRef.current = capture.hydrateLegacyGlobals;
  const initGenerationRef = useRef(0);
  const legacyInitDoneRef = useRef(false);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page", "datacapture-page", "datacapture-summary-page");
    document.body.classList.add("dashboard-page", "datacapture-summary-page");
    purgeLegacySummaryAddAccountModal();
    return () => {
      document.body.classList.remove("page-ready", "datacapture-summary-page");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = true;
    setEngineError("");

    void injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth").catch(() => {
      /* non-blocking */
    });

    if (areSummaryLegacyScriptsLoaded()) {
      setScriptsReady(true);
      return undefined;
    }

    let alive = true;

    (async () => {
      try {
        await ensureSummaryLegacyScriptsLoaded();
        if (alive) setScriptsReady(true);
      } catch (e) {
        if (!alive) return;
        if (areSummaryLegacyScriptsLoaded()) {
          setScriptsReady(true);
          return;
        }
        console.error(e);
        setEngineError(t("loadScriptsFailed"));
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionReady]);

  /** Hydrate React-loaded capture state, then run legacy table init after full shell mounts. */
  useEffect(() => {
    if (!sessionReady || !scriptsReady || engineError) return;
    if (waitForServerStateBeforeInit) return;

    const generation = initGenerationRef.current + 1;
    initGenerationRef.current = generation;
    let cancelled = false;

    const runInit = () => {
      if (cancelled || initGenerationRef.current !== generation) return;
      if (legacyInitDoneRef.current) return;
      legacyInitDoneRef.current = true;

      hydrateRef.current();
      const shell = document.querySelector(".container");
      if (shell) delete shell.dataset.summaryPageInit;
      if (typeof window.initDataCaptureSummaryPage === "function") {
        window.initDataCaptureSummaryPage();
      }
      if (capture.hasCaptureData) {
        removeLegacySummaryEmptyStateDom();
      }
      setLegacyInitDone(true);
    };

    const id = requestAnimationFrame(runInit);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [
    sessionReady,
    scriptsReady,
    engineError,
    waitForServerStateBeforeInit,
    capture.hasCaptureData,
  ]);

  useEffect(() => {
    return () => {
      legacyInitDoneRef.current = false;
      setLegacyInitDone(false);
      setDataPopulating(false);
      const shell = document.querySelector(".container");
      if (shell) delete shell.dataset.summaryPageInit;
    };
  }, []);

  /** Apply server state when it arrives after init (revisit / refresh paths). */
  useEffect(() => {
    if (!sessionReady || !scriptsReady || capture.freshFromCapture) return;
    if (capture.serverState == null) return;

    window._summaryStateFromServer = capture.serverState;

    const shell = document.querySelector(".container");
    if (shell?.dataset.summaryPageInit !== "1") return;

    try {
      window.restoreFormulaSourceFromRefresh?.();
      window.restoreRateValuesFromRefresh?.();
    } catch (e) {
      console.warn("Late summary server-state restore failed:", e);
    }
  }, [sessionReady, scriptsReady, capture.serverState, capture.freshFromCapture]);

  /** React-owned loading fallback when legacy init is delayed or skipped. */
  useLayoutEffect(() => {
    if (!sessionReady || !scriptsReady || engineError) return;
    if (waitForServerStateBeforeInit) return;

    if (!capture.hasCaptureData) {
      hideSummaryLoadingChrome();
      showSummaryTableChrome();
    }
  }, [
    sessionReady,
    scriptsReady,
    engineError,
    waitForServerStateBeforeInit,
    capture.hasCaptureData,
  ]);

  /** Sidebar Data Capture → fresh capture round (SPA navigate). */
  useEffect(() => {
    function navigateToDataCaptureFresh() {
      window.isNavigatingAwayByBackOrSubmit = true;
      clearSummaryCaptureRoundStorage();
      navigate("/datacapture", { replace: true });
    }

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const dcSection = document.getElementById("sidebar-datacapture-section");
      const dcTitle = dcSection?.querySelector(".informationmenu-section-title");
      if (dcTitle && dcTitle.dataset.summaryFreshNavBound !== "1") {
        dcTitle.dataset.summaryFreshNavBound = "1";
        dcTitle.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateToDataCaptureFresh();
          },
          true
        );
        window.clearInterval(timer);
      }
      if (tries >= 50) window.clearInterval(timer);
    }, 100);

    return () => window.clearInterval(timer);
  }, [navigate]);

  const pageBootLoading = sessionBootLoading || (sessionReady && !scriptsReady && !engineError);

  const showPageBootOverlay = pageBootLoading;
  const showDataLoading =
    !showPageBootOverlay && capture.hasCaptureData && dataPopulating && !engineError;

  return (
    <div className="container">
      <h1>{t("pageTitle")}</h1>

      {showPageBootOverlay ? (
        <div
          className="loading-container"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px" }}
          aria-busy="true"
        >
          <div className="loading-spinner" />
          <p style={{ margin: "12px 0 0" }}>{t("loading")}</p>
        </div>
      ) : null}

      {engineError ? (
        <div style={{ marginBottom: 12, color: "#b91c1c" }} role="alert">
          {engineError}
        </div>
      ) : null}

      <div
        id="loadingState"
        className="loading-container"
        style={{ display: showDataLoading ? undefined : "none" }}
      >
        <div className="loading-spinner" />
        <p>{t("loadingData")}</p>
      </div>

      <SummaryActionBar
        t={t}
        lang={lang}
        rateInput={pageActions.rateInput}
        onRateInputChange={pageActions.setRateInput}
        rateSelectAllLabel={pageActions.rateSelectAllLabel}
        rateSelectAllRef={pageActions.rateSelectAllRef}
        onToggleRateSelectAll={pageActions.handleToggleRateSelectAll}
        onRateBatchSubmit={pageActions.handleRateBatchSubmit}
        deleteCount={pageActions.deleteCount}
        deleteDisabled={pageActions.deleteDisabled}
        onDeleteSelected={pageActions.handleDeleteSelected}
      />

      <div className="summary-table-container" id="summaryTableContainer" style={{ display: "none" }}>
        <SummaryProcessInfo t={t} processData={capture.processData} visible={capture.hasCaptureData} />
        <SummaryTable
          t={t}
          tableData={capture.transformedTableData}
          rows={summaryRows}
          visible={capture.hasCaptureData}
        />
      </div>

      {showEmptyState ? <SummaryEmptyState t={t} /> : null}

      <EditFormulaModal
        t={t}
        key={editFormula.sessionKey}
        open={editFormula.open}
        productValue={editFormula.productValue}
        onClose={() => window.closeEditFormulaForm?.()}
        onOpenAddAccount={addAccount.showAddAccount}
      />

      <AccountModal {...addAccount.accountModalProps} />

      <SummarySubmitBar
        t={t}
        submitting={pageActions.submitting}
        onSubmit={pageActions.handleSubmitSummary}
        onBack={pageActions.handleBack}
        onRefresh={pageActions.handleRefresh}
      />

      <SummaryNotification
        notification={overlays.notification}
        shown={overlays.notificationShown}
        onClose={overlays.hideNotification}
      />

      <SummaryConfirmDeleteModal
        t={t}
        open={overlays.confirmOpen}
        message={overlays.confirmMessage}
        onCancel={overlays.closeConfirmDelete}
        onConfirm={overlays.confirmDelete}
      />
    </div>
  );
}

export default function DataCaptureSummaryPage() {
  return (
    <SummaryPageErrorBoundary>
      <DataCaptureSummaryPageInner />
    </SummaryPageErrorBoundary>
  );
}
