import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildDateOptions,
  displayTextFromProcessRow,
  fetchAddProcessFormData,
  fetchProcessDetail,
  fetchProcessesByDay,
  getLocalDateString,
} from "../lib/dataCaptureApi.js";

const PROCESS_PLACEHOLDER = "Select Process";
/** Cap initial option nodes when list is huge (e.g. Monday with 200+ processes). */
const PROCESS_OPTIONS_RENDER_CAP = 80;

function readRestoredProcessData() {
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") !== "1") return null;
    const raw = localStorage.getItem("capturedProcessData");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readRestoredSelectedProcess(restoredProcessData) {
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

function applyProcessDetailToFields(data, setters, currenciesSnapshot) {
  const {
    setCurrencyId,
    setRemoveWord,
    setReplaceFrom,
    setReplaceTo,
    setRemark,
    setDescriptionDisplay,
  } = setters;

  const pd = data || {};

  if (pd.remove_word) setRemoveWord(String(pd.remove_word).toUpperCase());
  if (pd.replace_word_from) setReplaceFrom(String(pd.replace_word_from).toUpperCase());
  if (pd.replace_word_to) setReplaceTo(String(pd.replace_word_to).toUpperCase());
  if (pd.remarks) setRemark(String(pd.remarks).toUpperCase());

  if (pd.description_names) {
    const arr = Array.isArray(pd.description_names) ? pd.description_names : [pd.description_names];
    window.selectedDescriptions = [...arr];
    setDescriptionDisplay(arr.join(", "));
  }

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

export function useDataCaptureFormEngine(companyId) {
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const defaultDate = useMemo(() => getLocalDateString(), []);
  const restoredProcessData = useMemo(() => readRestoredProcessData(), []);

  const [captureDate, setCaptureDate] = useState(() => restoredProcessData?.date || defaultDate);
  const [currencies, setCurrencies] = useState([]);
  const currenciesRef = useRef([]);
  currenciesRef.current = currencies;

  const [processRows, setProcessRows] = useState([]);
  const processRowsRef = useRef([]);
  processRowsRef.current = processRows;
  const [currencyId, setCurrencyId] = useState(() =>
    restoredProcessData?.currency ? String(restoredProcessData.currency) : "",
  );
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
  const [selectedProcess, setSelectedProcess] = useState(() => readRestoredSelectedProcess(restoredProcessData));

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  useLayoutEffect(() => {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") {
      window.__DC_IS_RESTORING__ = true;
      if (Array.isArray(restoredProcessData?.descriptions)) {
        window.selectedDescriptions = [...restoredProcessData.descriptions];
      }
    }
  }, [restoredProcessData]);

  const reloadProcessesForDate = useCallback(async (dateStr, options = {}) => {
    const { preserveSelection = false } = options;
    const cid = companyIdRef.current;
    if (!cid) return;
    const result = await fetchProcessesByDay(dateStr, cid);
    if (!result.success) return;
    const rows = Array.isArray(result.data) ? result.data : [];
    setProcessRows(rows);
    if (typeof window.syncProcessDataMapFromApiData === "function") {
      window.syncProcessDataMapFromApiData(rows);
    }
    const restoring = window.__DC_IS_RESTORING__ === true;
    if (!preserveSelection && !restoring) {
      setSelectedProcess(null);
      setCurrencyId("");
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      setRemark("");
      window.selectedDescriptions = [];
      setDescriptionDisplay("");
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const loadInitialForm = useCallback(async () => {
    const cid = companyIdRef.current;
    if (!cid) return;
    const result = await fetchAddProcessFormData(cid);
    if (!result.success) return;
    const list = Array.isArray(result.currencies) ? result.currencies : [];
    const norm = list.map((c) => ({ id: String(c.id), code: c.code }));
    setCurrencies(norm);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void loadInitialForm();
  }, [companyId, loadInitialForm]);

  useEffect(() => {
    if (!companyId) return;
    if (window.__DC_IS_RESTORING__) return;
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") return;
    void reloadProcessesForDate(captureDate, { preserveSelection: false });
  }, [companyId, captureDate, reloadProcessesForDate]);

  const onDateChange = useCallback(
    (e) => {
      const v = e.target.value;
      setCaptureDate(v);
      // Defer fetch past the native <select> close + layout (avoids insertBefore issues on touch / async flush).
      const run = () => void reloadProcessesForDate(v, { preserveSelection: false });
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          queueMicrotask(run);
        });
      } else {
        queueMicrotask(run);
      }
    },
    [reloadProcessesForDate]
  );

  const selectProcessRow = useCallback(async (row) => {
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
        },
        currenciesRef.current
      );
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const clearProcessSelection = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
    setRemoveWord("");
    setReplaceFrom("");
    setReplaceTo("");
    setRemark("");
    window.selectedDescriptions = [];
    setDescriptionDisplay("");
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const applyReactFormDefaults = useCallback(() => {
    const today = getLocalDateString();
    setCaptureDate(today);
    clearProcessSelection();
    void reloadProcessesForDate(today, { preserveSelection: false });
  }, [clearProcessSelection, reloadProcessesForDate]);

  const windowHooksRef = useRef({});
  windowHooksRef.current = {
    reloadProcessesForDate,
    applyReactFormDefaults,
  };

  useLayoutEffect(() => {
    if (!Array.isArray(window.selectedDescriptions)) {
      window.selectedDescriptions = [];
    }
    window.__DATA_CAPTURE_REACT_FORM__ = true;

    window.__DC_SET_PROCESS_LIST__ = (rows) => {
      startTransition(() => {
        setProcessRows(Array.isArray(rows) ? rows : []);
      });
    };

    window.__DC_RELOAD_PROCESSES__ = async () => {
      const el = document.getElementById("capture_date");
      const d = el?.value || getLocalDateString();
      await windowHooksRef.current.reloadProcessesForDate(d, { preserveSelection: true });
    };

    window.__DC_REACT_FORM_RESET__ = () => {
      windowHooksRef.current.applyReactFormDefaults();
    };

    window.__DC_ON_DESCRIPTIONS_CONFIRMED__ = (descriptions) => {
      const arr = Array.isArray(descriptions) ? descriptions : [];
      setDescriptionDisplay(arr.join(", "));
    };

    window.__DC_POST_LEGACY_RESTORE_SYNC__ = async (processData) => {
      if (!processData) return;
      if (processData.date) setCaptureDate(processData.date);
      if (processData.currency) setCurrencyId(String(processData.currency));
      if (processData.removeWord != null) setRemoveWord(String(processData.removeWord).toUpperCase());
      if (processData.replaceWordFrom != null) setReplaceFrom(String(processData.replaceWordFrom).toUpperCase());
      if (processData.replaceWordTo != null) setReplaceTo(String(processData.replaceWordTo).toUpperCase());
      if (processData.remark != null) setRemark(String(processData.remark).toUpperCase());
      if (processData.descriptions && Array.isArray(processData.descriptions)) {
        window.selectedDescriptions = [...processData.descriptions];
        setDescriptionDisplay(processData.descriptions.join(", "));
      }

      const pid = processData.process != null ? String(processData.process) : "";
      const pcode = String(processData.processCode || processData.process_code || "").trim();
      const pname = String(processData.processName || processData.process_name || "").trim();
      const rows = processRowsRef.current || [];

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

      setTimeout(() => {
        if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
      }, 0);
    };

    return () => {
      delete window.__DATA_CAPTURE_REACT_FORM__;
      delete window.__DC_SET_PROCESS_LIST__;
      delete window.__DC_RELOAD_PROCESSES__;
      delete window.__DC_REACT_FORM_RESET__;
      delete window.__DC_ON_DESCRIPTIONS_CONFIRMED__;
      delete window.__DC_POST_LEGACY_RESTORE_SYNC__;
    };
  }, []);

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
    clearProcessSelection,
    displayTextFromProcessRow,
  };
}
