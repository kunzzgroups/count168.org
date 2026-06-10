/**
 * Group-only table drafts — shared via server (group_id + process_key + currency_id).
 * localStorage is used as a local cache / offline fallback only.
 */
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { isGroupOnlyProcessId, selectedProcessFromGroupOnlySession } from "./dataCaptureGroupOnlyProcesses.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";
import { applyBridgeCaptureType } from "./dataCaptureBridge.js";
import { callDataCaptureRuntime, getDataCaptureState } from "./dataCaptureRuntime.js";
import {
  clearGroupCaptureDraft,
  fetchGroupCaptureDraft,
  saveGroupCaptureDraft,
} from "./dataCaptureGroupDraftApi.js";

export const GROUP_ONLY_TABLE_DRAFTS_KEY = "dc_group_only_table_drafts";

const SERVER_SAVE_DEBOUNCE_MS = 1500;
const serverSaveTimers = new Map();
let restoreSeq = 0;

/** Drop in-flight debounced server writes (e.g. before process/currency switch). */
export function cancelAllScheduledServerDraftSaves() {
  serverSaveTimers.forEach((timer) => clearTimeout(timer));
  serverSaveTimers.clear();
}

function normalizeGroupId(groupId) {
  const g = groupId != null ? String(groupId).trim().toUpperCase() : "";
  return g || null;
}

function normalizeProcessKey(processKey) {
  const p = processKey != null ? String(processKey).trim().toLowerCase() : "";
  return isGroupOnlyProcessId(p) ? p : null;
}

export function normalizeGroupOnlyDraftCurrencyId(currencyId) {
  const id = currencyId != null ? String(currencyId).trim() : "";
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

function draftTimerKey(groupId, processKey, currencyId) {
  return `${groupId}:${processKey}:${currencyId}`;
}

function readAllDrafts() {
  try {
    const raw = localStorage.getItem(GROUP_ONLY_TABLE_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllDrafts(map) {
  try {
    localStorage.setItem(GROUP_ONLY_TABLE_DRAFTS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function writeLocalDraft(groupId, processKey, currencyId, payload) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c || !payload?.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const map = readAllDrafts();
  if (!map[g]) map[g] = {};
  if (!map[g][p]) map[g][p] = {};
  map[g][p][c] = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
    currencyId: c,
  };
  writeAllDrafts(map);
}

function clearLocalDraft(groupId, processKey, currencyId) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;
  const map = readAllDrafts();
  if (!map[g]?.[p]?.[c]) return;
  delete map[g][p][c];
  if (Object.keys(map[g][p]).length === 0) delete map[g][p];
  if (Object.keys(map[g]).length === 0) delete map[g];
  writeAllDrafts(map);
}

function cancelScheduledServerSave(groupId, processKey, currencyId) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;
  const key = draftTimerKey(g, p, c);
  const timer = serverSaveTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    serverSaveTimers.delete(key);
  }
}

function scheduleServerDraftSave(groupId, processKey, currencyId, payload, captureScope) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;

  const key = draftTimerKey(g, p, c);
  cancelScheduledServerSave(g, p, c);
  serverSaveTimers.set(
    key,
    setTimeout(() => {
      serverSaveTimers.delete(key);
      void saveGroupCaptureDraft(captureScope, g, p, c, payload);
    }, SERVER_SAVE_DEBOUNCE_MS),
  );
}

/** Immediate server persist (e.g. process/currency switch). */
export async function flushGroupOnlyTableDraftToServer(
  groupId,
  processKey,
  currencyId,
  payload,
  captureScope = null,
) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return false;
  cancelScheduledServerSave(g, p, c);
  if (!payload?.tableData || !tableSnapshotHasData(payload.tableData)) {
    return clearGroupCaptureDraft(captureScope, g, p, c);
  }
  return saveGroupCaptureDraft(captureScope, g, p, c, payload);
}

function scopeFromGroupId(groupId) {
  const g = normalizeGroupId(groupId);
  if (!g) return null;
  return {
    mode: "group",
    groupId: g,
    viewGroup: g,
    scopeCompanyId: 0,
    resolveCompanyViaGroupId: true,
  };
}

/** @returns {{ tableData: object, captureType: string, savedAt?: number }|null} */
export function readGroupOnlyTableDraft(groupId, processKey, currencyId) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return null;
  const entry = readAllDrafts()[g]?.[p]?.[c];
  if (!entry?.tableData) return null;
  return {
    tableData: entry.tableData,
    captureType: entry.captureType || "1.Text",
    savedAt: entry.savedAt,
  };
}

export async function fetchGroupOnlyTableDraft(
  groupId,
  processKey,
  currencyId,
  captureScope = null,
) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return null;

  const scope = captureScope || scopeFromGroupId(g);
  const serverDraft = scope ? await fetchGroupCaptureDraft(scope, g, p, c) : null;
  if (serverDraft?.tableData) {
    writeLocalDraft(g, p, c, serverDraft);
    return serverDraft;
  }

  clearLocalDraft(g, p, c);
  return null;
}

export function clearGroupOnlyTableDraft(groupId, processKey, currencyId, options = {}) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;

  cancelScheduledServerSave(g, p, c);
  clearLocalDraft(g, p, c);

  const scope = options.captureScope || scopeFromGroupId(g);
  if (scope) {
    void clearGroupCaptureDraft(scope, g, p, c);
  }
}

/**
 * @param {string|null|undefined} groupId
 * @param {string} processKey salary | commission | bonus
 * @param {string|number} currencyId
 * @param {{ tableData?: object, captureType?: string, savedAt?: number }} payload
 * @param {{ captureScope?: object, flush?: boolean }} [options]
 */
export function saveGroupOnlyTableDraft(
  groupId,
  processKey,
  currencyId,
  payload = {},
  options = {},
) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c || !payload.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const entry = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
    currencyId: c,
  };

  writeLocalDraft(g, p, c, entry);

  const scope = options.captureScope || scopeFromGroupId(g);
  if (!scope) return;

  if (options.flush) {
    void flushGroupOnlyTableDraftToServer(g, p, c, entry, scope);
    return;
  }
  scheduleServerDraftSave(g, p, c, entry, scope);
}

/** Persist draft from active capture session before Summary clears storage. */
export function saveGroupOnlyTableDraftFromCaptureSession(session, options = {}) {
  if (!session?.processData?.groupOnlyCapture) return;
  const groupId = normalizeGroupId(session.processData.captureSelectedGroup);
  if (!groupId) return;

  const proc = selectedProcessFromGroupOnlySession(session.processData);
  const processKey = proc?.id ? normalizeProcessKey(proc.id) : null;
  const currencyId = normalizeGroupOnlyDraftCurrencyId(session.processData.currency);
  if (!processKey || !currencyId) return;

  const captureScope = options.captureScope || scopeFromGroupId(groupId);
  saveGroupOnlyTableDraft(
    groupId,
    processKey,
    currencyId,
    {
      tableData: session.tableData,
      captureType: session.captureType,
    },
    { captureScope, flush: true },
  );
}

export function shouldApplyGroupOnlyTableDraft() {
  if (getDataCaptureState().isRestoring) return false;
  try {
    if (new URLSearchParams(window.location.search).get("restore") === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Build draft scope key for process + optional currency (tracks UI transitions). */
export function groupOnlyDraftScopeKey(processKey, currencyId) {
  const p = normalizeProcessKey(processKey);
  if (!p) return null;
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  return c ? `${p}:${c}` : `${p}:`;
}

/** Build draft storage key — requires both process and currency. */
export function groupOnlyTableDraftKey(processKey, currencyId) {
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!p || !c) return null;
  return `${p}:${c}`;
}

/** Flush table snapshot for a draft key before switching process/currency. */
export function flushGroupOnlyTableDraftForKey(groupId, draftKey, options = {}) {
  if (!draftKey) return;
  const [processKey, currencyId] = draftKey.split(":");
  if (!processKey || !currencyId) return;
  const activeCaptureType = options.captureType || "1.Text";
  const tableData = options.tableData;
  if (!tableData || !tableSnapshotHasData(tableData)) return;
  saveGroupOnlyTableDraft(
    groupId,
    processKey,
    currencyId,
    { tableData, captureType: activeCaptureType },
    { captureScope: options.captureScope, flush: true },
  );
}

/** Restore grid from shared group+process+currency draft, or clear grid when no draft. */
export async function restoreGroupOnlyTableDraft(
  groupId,
  processKey,
  currencyId,
  options = {},
) {
  if (!shouldApplyGroupOnlyTableDraft()) return;

  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;

  const seq = ++restoreSeq;
  const state = getDataCaptureState();
  state.isRestoring = true;

  try {
    callDataCaptureRuntime("clearCaptureTable");

    const scope = options.captureScope || scopeFromGroupId(g);
    const draft = await fetchGroupOnlyTableDraft(g, p, c, scope);
    if (seq !== restoreSeq) return;

    if (!draft?.tableData) {
      callDataCaptureRuntime("clearCaptureTable");
      callDataCaptureRuntime("recomputeSubmitState");
      return;
    }

    const type = draft.captureType || "1.Text";
    applyBridgeCaptureType(type);

    const { rows, cols } = resolveDataCaptureGridDimensions(true);
    await callDataCaptureRuntime("ensureGridReady", rows, cols);
    if (seq !== restoreSeq) return;

    await callDataCaptureRuntime("restoreCaptureTable", draft.tableData, type);
    if (seq !== restoreSeq) return;

    callDataCaptureRuntime("recomputeSubmitState");
  } finally {
    if (seq === restoreSeq) {
      state.isRestoring = false;
    }
  }
}
