import { normalizeSummaryNotificationArgs } from "./summaryNotificationNormalize.js";

/**
 * Push a summary toast — uses React overlay when registered.
 */
export function pushSummaryNotification(title, message, type = "success") {
  const normalized = normalizeSummaryNotificationArgs(title, message, type);
  let nextTitle = normalized.title;
  let nextMessage = normalized.message;

  if (typeof window.__SUMMARY_TRANSLATE_NOTIFICATION__ === "function") {
    const translated = window.__SUMMARY_TRANSLATE_NOTIFICATION__({
      title: nextTitle,
      message: nextMessage,
    });
    nextTitle = translated.title;
    nextMessage = translated.message;
  }

  if (typeof window.__SUMMARY_REACT_SHOW_NOTIFICATION__ === "function") {
    window.__SUMMARY_REACT_SHOW_NOTIFICATION__(nextTitle, nextMessage, normalized.type);
    return;
  }
  window.alert(nextMessage ? `${nextTitle}: ${nextMessage}` : nextTitle);
}

export function hideSummaryNotification() {
  window.__SUMMARY_REACT_HIDE_NOTIFICATION__?.();
}

export function showSummaryConfirmDelete(message, onConfirm) {
  if (typeof window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__ === "function") {
    window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__(message, onConfirm);
    return;
  }
  if (window.confirm(message)) {
    onConfirm?.();
  }
}
