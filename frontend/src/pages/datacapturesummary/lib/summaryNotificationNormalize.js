const KNOWN_TYPES = new Set(["success", "error", "warning", "danger", "info"]);

const DEFAULT_TITLES = {
  error: "Error",
  danger: "Error",
  warning: "Warning",
  info: "Info",
  success: "Success",
};

/** Map legacy notification types to summary CSS classes. */
export function summaryNotificationCssType(type) {
  const t = String(type || "success").toLowerCase();
  if (t === "danger") return "error";
  if (t === "warning") return "warning";
  if (t === "error" || t === "info") return t;
  return "success";
}

/**
 * Normalize legacy showNotification calls:
 * - 3-arg: (title, message, type)
 * - 2-arg legacy: (message, type)
 */
export function normalizeSummaryNotificationArgs(title, message, type = "success") {
  if (
    message != null &&
    typeof message === "string" &&
    KNOWN_TYPES.has(message.toLowerCase()) &&
    (type === "success" || type == null || type === "")
  ) {
    const legacyType = message.toLowerCase();
    message = title;
    type = legacyType;
    title = DEFAULT_TITLES[legacyType] || "Notification";
  }

  const normalizedType = String(type || "success").toLowerCase();
  return {
    title: title != null && String(title).trim() !== "" ? String(title) : "Notification",
    message: message != null ? String(message) : "",
    type: KNOWN_TYPES.has(normalizedType) ? normalizedType : "success",
  };
}
