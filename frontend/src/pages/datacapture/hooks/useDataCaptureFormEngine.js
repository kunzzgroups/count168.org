import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildDateOptions,
  displayTextFromProcessRow,
  fetchAddProcessFormData,
  fetchGroupCaptureCurrencies,
  fetchProcessDetail,
  fetchProcessesByDay,
  getLocalDateString,
} from "../lib/dataCaptureApi.js";
import { dataCaptureQueryKeys } from "../lib/dataCaptureApi.js";
import { dataCaptureScopeCacheKey, dataCaptureScopeIsReady } from "../lib/dataCaptureScope.js";
import {
  clearGroupOnlyProcessPrefs,
  readGroupOnlyProcessPrefs,
  saveGroupOnlyProcessPrefs,
  selectedProcessFromGroupOnlyPrefs,
} from "../lib/dataCaptureGroupOnlyProcessPersistence.js";
import { selectedProcessFromGroupOnlySession } from "../lib/dataCaptureGroupOnlyProcesses.js";
import {
  cancelAllScheduledServerDraftSaves,
  flushGroupOnlyTableDraftForKey,
  groupOnlyDraftScopeKey,
  groupOnlyTableDraftKey,
  restoreGroupOnlyTableDraft,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { loadActiveCaptureSession } from "../lib/dataCaptureStorage.js";
import { captureTableSnapshot } from "../lib/dataCaptureTableSnapshot.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import {
  callDataCaptureRuntime,
  getDataCaptureRuntime,
  getDataCaptureState,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";

const PROCESS_PLACEHOLDER = "Select Process";
/** Cap initial option nodes when list is huge (e.g. Monday with 200+ processes). */
const PROCESS_OPTIONS_RENDER_CAP = 80;

function readRestoredProcessData() {
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") !== "1") return null;
    const session = loadActiveCaptureSession();
    if (session?.processData) return session.processData;
    const raw = localStorage.getItem("capturedProcessData");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readRestoredSelectedProcess(restoredProcessData, selectedGroup = null) {
  if (restoredProcessData?.groupOnlyCapture) {
    const groupKey =
      restoredProcessData.captureSelectedGroup ||
      selectedGroup ||
      null;
    return (
      selectedProcessFromGroupOnlySession(restoredProcessData) ||
      selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(groupKey))
    );
  }
  if (!restoredProcessData?.process) return null;
  const pid = String(restoredProcessData.process);
  const pcode = String(restoredProcessData.processCode || restoredProcessData.process_code || "").trim();
  const pname = String(restoredProcessData.processName || restoredProcessData.process_name || "").trim();
  return {
    id: pid,
    displayText: pname || pcode || pid,
    process_id: pcode,
    description_name: null,
  };
}

function applyProcessDetailToFields(data, setters, currenciesSnapshot, applyCompanyOnlyFields = true) {
  const {
    setCurrencyId,
    setRemoveWord,
    setReplaceFrom,
    setReplaceTo,
    setRemark,
    setDescriptionDisplay,
  } = setters;

  const pd = data || {};

  if (applyCompanyOnlyFields) {
    if (pd.remove_word) setRemoveWord(String(pd.remove_word).toUpperCase());
    if (pd.replace_word_from) setReplaceFrom(String(pd.replace_word_from).toUpperCase());
    if (pd.replace_word_to) setReplaceTo(String(pd.replace_word_to).toUpperCase());

    if (pd.description_names) {
      const arr = Array.isArray(pd.description_names) ? pd.description_names : [pd.description_names];
      setters.setSelectedDescriptions?.([...arr]);
      setDescriptionDisplay(arr.join(", "));
    }
  }

  if (pd.remarks) setRemark(String(pd.remarks).toUpperCase());

  const currencyIdStr = pd.currency_id != null ? String(pd.currency_id) : "";
  const list = currenciesSnapshot || [];
  if (currencyIdStr && list.length) {
    const exists = list.some((c) => String(c.id) === currencyIdStr);
    if (exists) {
      setCurrencyId(currencyIdStr);
      return;
    }
  }
  if (pd.currency_warning && pd.currency_code && list.length) {
    const code = String(pd.currency_code).toUpperCase();
    const match = list.find((c) => String(c.code).toUpperCase() === code);
    if (match) setCurrencyId(String(match.id));
  }
}

function readInitialGroupOnlyPrefs(selectedGroup, restoredProcessData) {
  if (restoredProcessData?.groupOnlyCapture) return null;
  if (restoredProcessData?.process) return null;
  return readGroupOnlyProcessPrefs(selectedGroup);
}

export function useDataCaptureFormEngine(
  captureScope,
  { applyCompanyOnlyFields = true, selectedGroup = null, engineReady = false } = {},
) {
  const { setSelectedDescriptions, clearSelectedDescriptions } = useDataCaptureContext();
  const queryClient = useQueryClient();
  const scopeKey = dataCaptureScopeCacheKey(captureScope);
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const defaultDate = useMemo(() => getLocalDateString(), []);
  const restoredProcessData = useMemo(() => readRestoredProcessData(), []);
  const initialGroupOnlyPrefs = useMemo(
    () =>
      !applyCompanyOnlyFields
        ? readInitialGroupOnlyPrefs(selectedGroup, restoredProcessData)
        : null,
    [applyCompanyOnlyFields, selectedGroup, restoredProcessData]
  );

  const [captureDate, setCaptureDate] = useState(() => {
    if (restoredProcessData?.date) return restoredProcessData.date;
    if (initialGroupOnlyPrefs?.date) return initialGroupOnlyPrefs.date;
    return defaultDate;
  });
  const companyId = captureScope?.scopeCompanyId ?? null;

  const [currencyId, setCurrencyId] = useState(() => {
    if (restoredProcessData?.currency) return String(restoredProcessData.currency);
    if (initialGroupOnlyPrefs?.currency) return String(initialGroupOnlyPrefs.currency);
    return "";
  });

  const companyCurrenciesQuery = useQuery({
    queryKey: dataCaptureQueryKeys.companyFormCatalog(scopeKey),
    queryFn: async () => {
      const result = await fetchAddProcessFormData(captureScope);
      if (!result.success) return [];
      const list = Array.isArray(result.currencies) ? result.currencies : [];
      return list.map((c) => ({
        id: String(c.id),
        code: String(c.code || "").trim().toUpperCase(),
      }));
    },
    enabled: Boolean(applyCompanyOnlyFields && companyId && dataCaptureScopeIsReady(captureScope)),
  });

  const groupCurrenciesQuery = useQuery({
    queryKey: dataCaptureQueryKeys.groupCurrencies(selectedGroup),
    queryFn: async () => fetchGroupCaptureCurrencies(selectedGroup),
    enabled: Boolean(!applyCompanyOnlyFields && selectedGroup),
  });

  const currencies = applyCompanyOnlyFields
    ? (companyCurrenciesQuery.data ?? [])
    : (groupCurrenciesQuery.data ?? []);
  const currenciesRef = useRef([]);
  currenciesRef.current = currencies;

  const processesQuery = useQuery({
    queryKey: dataCaptureQueryKeys.processesByDay(scopeKey, captureDate),
    queryFn: async () => {
      const result = await fetchProcessesByDay(captureDate, captureScope);
      if (!result.success) return [];
      return Array.isArray(result.data) ? result.data : [];
    },
    enabled: Boolean(applyCompanyOnlyFields && companyId && dataCaptureScopeIsReady(captureScope)),
  });

  const [processRows, setProcessRows] = useState([]);
  const processRowsRef = useRef([]);
  processRowsRef.current = processRows;

  const [replaceFrom, setReplaceFrom] = useState(() =>
    restoredProcessData?.replaceWordFrom ? String(restoredProcessData.replaceWordFrom).toUpperCase() : "",
  );
  const [replaceTo, setReplaceTo] = useState(() =>
    restoredProcessData?.replaceWordTo ? String(restoredProcessData.replaceWordTo).toUpperCase() : "",
  );
  const [removeWord, setRemoveWord] = useState(() =>
    restoredProcessData?.removeWord ? String(restoredProcessData.removeWord).toUpperCase() : "",
  );
  const [remark, setRemark] = useState(() =>
    restoredProcessData?.remark ? String(restoredProcessData.remark).toUpperCase() : "",
  );
  const [descriptionDisplay, setDescriptionDisplay] = useState(() =>
    Array.isArray(restoredProcessData?.descriptions) ? restoredProcessData.descriptions.join(", ") : "",
  );

  const [processOpen, setProcessOpen] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [selectedProcess, setSelectedProcess] = useState(() =>
    readRestoredSelectedProcess(restoredProcessData, selectedGroup)
  );

  const selectedGroupRef = useRef(selectedGroup);
  selectedGroupRef.current = selectedGroup;
  const selectedProcessRef = useRef(selectedProcess);
  selectedProcessRef.current = selectedProcess;
  const currencyIdRef = useRef(currencyId);
  currencyIdRef.current = currencyId;

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const captureScopeRef = useRef(captureScope);
  captureScopeRef.current = captureScope;

  const applyCompanyOnlyFieldsRef = useRef(applyCompanyOnlyFields);
  applyCompanyOnlyFieldsRef.current = applyCompanyOnlyFields;

  useLayoutEffect(() => {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") {
      getDataCaptureState().isRestoring = true;
      if (Array.isArray(restoredProcessData?.descriptions)) {
        setSelectedDescriptions([...restoredProcessData.descriptions]);
      }
    }
  }, [restoredProcessData, setSelectedDescriptions]);

  const clearProcessFieldsForDateChange = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
    if (applyCompanyOnlyFieldsRef.current) {
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      clearSelectedDescriptions();
      setDescriptionDisplay("");
    }
    setRemark("");
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, [clearSelectedDescriptions]);

  const reloadProcessesForDate = useCallback(
    async (dateStr, options = {}) => {
      const { preserveSelection = false } = options;
      if (!applyCompanyOnlyFieldsRef.current) return;
      const cid = companyIdRef.current;
      const scope = captureScopeRef.current;
      if (!cid || !scope) return;

      const restoring = getDataCaptureState().isRestoring === true;
      if (!preserveSelection && !restoring) {
        clearProcessFieldsForDateChange();
      }

      const key = dataCaptureQueryKeys.processesByDay(
        dataCaptureScopeCacheKey(scope),
        dateStr,
      );
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.refetchQueries({ queryKey: key });
    },
    [clearProcessFieldsForDateChange, queryClient],
  );

  useEffect(() => {
    const rows = processesQuery.data ?? [];
    setProcessRows(rows);
  }, [processesQuery.data]);

  useEffect(() => {
    if (!applyCompanyOnlyFields && !selectedGroup) {
      setCurrencyId("");
    }
  }, [applyCompanyOnlyFields, selectedGroup]);

  useEffect(() => {
    if (applyCompanyOnlyFields || !groupCurrenciesQuery.data?.length) return;
    setCurrencyId((prev) => {
      if (!prev) return "";
      return groupCurrenciesQuery.data.some((c) => String(c.id) === String(prev)) ? prev : "";
    });
  }, [applyCompanyOnlyFields, groupCurrenciesQuery.data]);

  const prevCaptureDateRef = useRef(captureDate);
  useEffect(() => {
    if (!companyId || !applyCompanyOnlyFields) return;
    if (getDataCaptureState().isRestoring) return;
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }
    if (prevCaptureDateRef.current === captureDate) return;
    prevCaptureDateRef.current = captureDate;
    clearProcessFieldsForDateChange();
  }, [companyId, applyCompanyOnlyFields, captureDate, clearProcessFieldsForDateChange]);

  const onDateChange = useCallback((e) => {
    setCaptureDate(e.target.value);
  }, []);

  const persistGroupOnlyFormPrefs = useCallback(
    (processOverride = null) => {
      if (applyCompanyOnlyFieldsRef.current) return;
      const proc = processOverride || selectedProcess;
      if (!proc?.id) return;
      saveGroupOnlyProcessPrefs(selectedGroupRef.current, {
        process: proc.id,
        processCode: proc.process_id,
        processName: proc.displayText,
        currency: currencyId,
        date: captureDate,
      });
    },
    [selectedProcess, currencyId, captureDate]
  );

  const selectGroupOnlyProcess = useCallback((option) => {
    if (!option?.id) return;
    const next = {
      id: String(option.id),
      displayText: option.displayText || String(option.id),
      process_id: option.process_id || String(option.id).toUpperCase(),
      description_name: null,
    };

    setSelectedProcess(next);
    saveGroupOnlyProcessPrefs(selectedGroupRef.current, {
      process: next.id,
      processCode: next.process_id,
      processName: next.displayText,
      currency: currencyIdRef.current,
      date: captureDate,
    });
    setProcessOpen(false);
    setProcessFilter("");
  }, [captureDate]);

  const selectProcessRow = useCallback(async (row) => {
    if (!applyCompanyOnlyFieldsRef.current) return;
    const displayText = displayTextFromProcessRow(row);
    setSelectedProcess({
      id: String(row.id),
      displayText,
      process_id: row.process_id,
      description_name: row.description_name || null,
    });
    setProcessOpen(false);
    setProcessFilter("");
    const cid = companyIdRef.current;
    const res = await fetchProcessDetail(row.id, cid);
    if (res.success && res.data) {
      applyProcessDetailToFields(
        res.data,
        {
          setCurrencyId,
          setRemoveWord,
          setReplaceFrom,
          setReplaceTo,
          setRemark,
          setDescriptionDisplay,
          setSelectedDescriptions,
        },
        currenciesRef.current,
        applyCompanyOnlyFieldsRef.current
      );
    }
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, [setSelectedDescriptions]);

  const clearCompanyOnlyFields = useCallback(() => {
    setRemoveWord("");
    setReplaceFrom("");
    setReplaceTo("");
    clearSelectedDescriptions();
    setDescriptionDisplay("");
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, [clearSelectedDescriptions]);

  const applyGroupOnlyPrefsForGroup = useCallback((groupId) => {
    if (applyCompanyOnlyFieldsRef.current) return;
    const prefs = readGroupOnlyProcessPrefs(groupId);
    if (prefs?.currency) setCurrencyId(String(prefs.currency));
    if (prefs?.date) setCaptureDate(String(prefs.date));
    setSelectedProcess(null);
    callDataCaptureRuntime("clearCaptureTable");
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, []);

  /** Reset table UI only — keeps shared group+process draft on server; user re-selects process to restore. */
  const clearGroupOnlyProcessForTableReset = useCallback(() => {
    if (applyCompanyOnlyFieldsRef.current) return;
    cancelAllScheduledServerDraftSaves();
    setSelectedProcess(null);
    setProcessOpen(false);
    setProcessFilter("");
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, []);

  const clearProcessSelection = useCallback(() => {
    if (!applyCompanyOnlyFieldsRef.current) {
      const prev = selectedProcessRef.current;
      const prevCurrency = currencyIdRef.current;
      cancelAllScheduledServerDraftSaves();
      if (prev?.id && prevCurrency) {
        const activeCaptureType = getBridgeCaptureType("1.Text");
        saveGroupOnlyTableDraft(
          selectedGroupRef.current,
          prev.id,
          prevCurrency,
          {
            tableData: captureTableSnapshot(activeCaptureType),
            captureType: activeCaptureType,
          },
          { captureScope: captureScopeRef.current, flush: true },
        );
        clearGroupOnlyProcessPrefs(selectedGroupRef.current);
      }
      callDataCaptureRuntime("clearCaptureTable");
    }
    setSelectedProcess(null);
    setCurrencyId("");
    if (applyCompanyOnlyFieldsRef.current) {
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      clearSelectedDescriptions();
      setDescriptionDisplay("");
    }
    setRemark("");
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
  }, [clearSelectedDescriptions]);

  const applyReactFormDefaults = useCallback(() => {
    const today = getLocalDateString();
    setCaptureDate(today);
    clearProcessSelection();
    if (applyCompanyOnlyFieldsRef.current) {
      void queryClient.invalidateQueries({
        queryKey: dataCaptureQueryKeys.processesByDay(scopeKey, today),
      });
    }
  }, [clearProcessSelection, queryClient, scopeKey]);

  const windowHooksRef = useRef({});
  windowHooksRef.current = {
    reloadProcessesForDate,
    applyReactFormDefaults,
    clearGroupOnlyProcessForTableReset,
  };

  const applyGroupOnlyPrefsForGroupRef = useRef(applyGroupOnlyPrefsForGroup);
  applyGroupOnlyPrefsForGroupRef.current = applyGroupOnlyPrefsForGroup;

  useLayoutEffect(() => {
    const syncRestoreForm = async (processData) => {
      if (!processData) return;
      if (processData.date) setCaptureDate(processData.date);
      if (processData.currency) setCurrencyId(String(processData.currency));
      if (processData.removeWord != null) setRemoveWord(String(processData.removeWord).toUpperCase());
      if (processData.replaceWordFrom != null) setReplaceFrom(String(processData.replaceWordFrom).toUpperCase());
      if (processData.replaceWordTo != null) setReplaceTo(String(processData.replaceWordTo).toUpperCase());
      if (processData.remark != null) setRemark(String(processData.remark).toUpperCase());
      if (processData.descriptions && Array.isArray(processData.descriptions)) {
        setSelectedDescriptions([...processData.descriptions]);
        setDescriptionDisplay(processData.descriptions.join(", "));
      }

      const pid = processData.process != null ? String(processData.process) : "";
      const pcode = String(processData.processCode || processData.process_code || "").trim();
      const pname = String(processData.processName || processData.process_name || "").trim();
      const rows = processRowsRef.current || [];

      if (!applyCompanyOnlyFieldsRef.current && processData.groupOnlyCapture) {
        const groupKey = processData.captureSelectedGroup || selectedGroupRef.current;
        const proc =
          selectedProcessFromGroupOnlySession(processData) ||
          selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(groupKey));
        if (proc) setSelectedProcess(proc);
        if (proc?.id) {
          saveGroupOnlyProcessPrefs(groupKey, {
            process: proc.id,
            processCode: proc.process_id || pcode,
            processName: proc.displayText || pname,
            currency: processData.currency,
            date: processData.date,
          });
        }
      } else {
        let row = null;
        if (pid) row = rows.find((r) => String(r.id) === pid);
        if (!row && pcode) row = rows.find((r) => String(r.process_id || "").trim() === pcode);
        if (!row && pname) row = rows.find((r) => displayTextFromProcessRow(r) === pname);

        if (row) {
          setSelectedProcess({
            id: String(row.id),
            displayText: displayTextFromProcessRow(row),
            process_id: row.process_id,
            description_name: row.description_name || null,
          });
        } else if (pid || pcode || pname) {
          setSelectedProcess({
            id: pid || pcode,
            displayText: pname || pcode || pid,
            process_id: pcode,
            description_name: null,
          });
        }
      }

      setTimeout(() => {
        callDataCaptureRuntime("recomputeSubmitState");
      }, 0);
    };

    const api = {
      setProcessList: (processRows) => {
        startTransition(() => {
          setProcessRows(Array.isArray(processRows) ? processRows : []);
        });
      },
      reloadProcesses: async () => {
        const el = document.getElementById("capture_date");
        const d = el?.value || getLocalDateString();
        await windowHooksRef.current.reloadProcessesForDate(d, { preserveSelection: true });
      },
      reactFormReset: () => {
        windowHooksRef.current.applyReactFormDefaults();
      },
      clearGroupOnlyProcessForTableReset: () => {
        windowHooksRef.current.clearGroupOnlyProcessForTableReset();
      },
      onDescriptionsConfirmed: (descriptions) => {
        const arr = Array.isArray(descriptions) ? descriptions : [];
        setDescriptionDisplay(arr.join(", "));
      },
      syncRestoreForm,
      applyGroupOnlyPersistedForm: async () => {
        if (applyCompanyOnlyFieldsRef.current) return;
        const groupId = selectedGroupRef.current;
        if (groupId) applyGroupOnlyPrefsForGroupRef.current(groupId);
      },
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, [setSelectedDescriptions]);

  const filteredProcesses = useMemo(() => {
    const q = processFilter.trim().toLowerCase();
    if (!q) return processRows;
    return processRows.filter((r) => displayTextFromProcessRow(r).toLowerCase().includes(q));
  }, [processFilter, processRows]);

  const processListTruncated = useMemo(
    () => !processFilter.trim() && processRows.length > PROCESS_OPTIONS_RENDER_CAP,
    [processFilter, processRows.length]
  );

  const visibleProcesses = useMemo(() => {
    if (!processListTruncated) return filteredProcesses;
    return filteredProcesses.slice(0, PROCESS_OPTIONS_RENDER_CAP);
  }, [filteredProcesses, processListTruncated]);

  const processSearchInputRef = useRef(null);
  useEffect(() => {
    if (processOpen && processSearchInputRef.current) {
      const t = setTimeout(() => processSearchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [processOpen]);

  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !selectedProcess?.id) return;
    if (getDataCaptureState().isRestoring) return;
    persistGroupOnlyFormPrefs();
  }, [applyCompanyOnlyFields, selectedGroup, selectedProcess?.id, currencyId, captureDate, persistGroupOnlyFormPrefs]);

  /** Clear capture grid when group-only mode has no process selected. */
  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !engineReady) return;
    if (selectedProcess?.id) return;
    if (getDataCaptureState().isRestoring) return;
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }
    callDataCaptureRuntime("clearCaptureTable");
    callDataCaptureRuntime("recomputeSubmitState");
  }, [applyCompanyOnlyFields, selectedGroup, selectedProcess?.id, engineReady]);

  /** Restore/switch group-only table draft when process or currency changes. */
  const prevGroupOnlyDraftKeyRef = useRef(null);
  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !engineReady) return;
    if (typeof getDataCaptureRuntime().restoreCaptureTable !== "function") return;
    if (getDataCaptureState().isRestoring) return;
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }

    const scopeKey = groupOnlyDraftScopeKey(selectedProcess?.id, currencyId);
    const restoreKey = groupOnlyTableDraftKey(selectedProcess?.id, currencyId);
    const prevScopeKey = prevGroupOnlyDraftKeyRef.current;
    if (scopeKey === prevScopeKey) return;

    if (prevScopeKey) {
      const [prevProcessKey, prevCurrencyId] = prevScopeKey.split(":");
      const prevRestoreKey = groupOnlyTableDraftKey(prevProcessKey, prevCurrencyId);
      if (prevRestoreKey) {
        cancelAllScheduledServerDraftSaves();
        const activeCaptureType = getBridgeCaptureType("1.Text");
        flushGroupOnlyTableDraftForKey(selectedGroup, prevRestoreKey, {
          captureScope,
          captureType: activeCaptureType,
          tableData: captureTableSnapshot(activeCaptureType),
        });
      }
    }

    prevGroupOnlyDraftKeyRef.current = scopeKey;

    if (!selectedProcess?.id) {
      callDataCaptureRuntime("clearCaptureTable");
      callDataCaptureRuntime("recomputeSubmitState");
      return;
    }

    callDataCaptureRuntime("clearCaptureTable");

    if (!restoreKey) {
      callDataCaptureRuntime("recomputeSubmitState");
      return;
    }

    void restoreGroupOnlyTableDraft(selectedGroup, selectedProcess.id, currencyId, {
      captureScope,
    }).finally(() => {
      setTimeout(() => {
        callDataCaptureRuntime("recomputeSubmitState");
      }, 0);
    });
  }, [
    applyCompanyOnlyFields,
    selectedGroup,
    selectedProcess?.id,
    currencyId,
    engineReady,
    captureScope,
  ]);

  return {
    dateOptions,
    captureDate,
    onDateChange,
    currencies,
    currencyId,
    setCurrencyId,
    replaceFrom,
    setReplaceFrom,
    replaceTo,
    setReplaceTo,
    removeWord,
    setRemoveWord,
    remark,
    setRemark,
    descriptionDisplay,
    processOpen,
    setProcessOpen,
    processFilter,
    setProcessFilter,
    processSearchInputRef,
    filteredProcesses,
    visibleProcesses,
    processListTruncated,
    processRowsCount: processRows.length,
    selectedProcess,
    selectProcessRow,
    selectGroupOnlyProcess,
    applyGroupOnlyPrefsForGroup,
    clearProcessSelection,
    displayTextFromProcessRow,
    clearCompanyOnlyFields,
  };
}
