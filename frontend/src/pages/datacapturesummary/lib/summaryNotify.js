import { normalizeSummaryNotificationArgs } from "./summaryNotificationNormalize.js";
import { summaryShowNotification, summaryTranslateNotification } from "./summaryRuntime.js";

/** Push a summary toast — uses React overlay via summaryRuntime registry. */
export function pushSummaryNotification(title, message, type = "success") {
  const normalized = normalizeSummaryNotificationArgs(title, message, type);
  let nextTitle = normalized.title;
  let nextMessage = normalized.message;

  const translated = summaryTranslateNotification({
    title: nextTitle,
    message: nextMessage,
  });
  nextTitle = translated.title;
  nextMessage = translated.message;

  if (summaryShowNotification(nextTitle, nextMessage, normalized.type)) {
    return;
  }
  window.alert(nextMessage ? `${nextTitle}: ${nextMessage}` : nextTitle);
}
