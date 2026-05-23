/**
 * React-owned delete entry: opens confirm modal then runs legacy executeDeleteSelectedRows.
 */
import { pushSummaryNotification, showSummaryConfirmDelete } from "./summaryNotify.js";

function notifyError(title, message, showNotification) {
  if (typeof showNotification === "function") {
    showNotification(title, message, "error");
    return;
  }
  pushSummaryNotification(title, message, "error");
}

function openConfirmDelete(message, onConfirm, showConfirmDelete) {
  if (typeof showConfirmDelete === "function") {
    showConfirmDelete(message, onConfirm);
    return;
  }
  if (typeof window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__ === "function") {
    window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__(message, onConfirm);
    return;
  }
  showSummaryConfirmDelete(message, onConfirm);
}

/** DOM collect when legacy window API is not registered yet (mirrors datacapturesummary.js). */
function collectValidDeleteRowTargetsFromDom() {
  const checkboxes = document.querySelectorAll(".summary-row-checkbox:checked");
  return Array.from(checkboxes)
    .map((cb) => ({
      checkbox: cb,
      row: cb.closest("tr"),
      value: cb.getAttribute("data-value"),
    }))
    .filter((item) => {
      const row = item.row;
      if (!row) return false;

      const productType = (row.getAttribute("data-product-type") || "main").trim();
      const accountCell = row.querySelector("td:nth-child(2)");
      const accountText = accountCell ? accountCell.textContent.trim() : "";
      const hasAccount = accountText !== "" && accountText !== "+";

      if (productType === "sub" && !hasAccount) {
        return false;
      }

      const idFromCheckbox =
        item.value && String(item.value).trim() !== "" ? String(item.value).trim() : "";
      if (idFromCheckbox) return true;

      const idCell = row.querySelector("td:first-child");
      const idText = idCell
        ? (idCell.getAttribute("data-main-product") || idCell.textContent || "").trim()
        : "";
      return idText !== "";
    });
}

function runDeleteAfterConfirm(valid, showNotification) {
  const execute = window.executeDeleteSelectedRows;
  if (typeof execute === "function") {
    execute(valid);
    return true;
  }

  if (typeof window.deleteSelectedRows === "function") {
    window.__SUMMARY_DELETE_VALID_ROWS__ = valid;
    window.__SUMMARY_DELETE_ALREADY_CONFIRMED__ = true;
    try {
      window.deleteSelectedRows();
    } finally {
      delete window.__SUMMARY_DELETE_VALID_ROWS__;
      delete window.__SUMMARY_DELETE_ALREADY_CONFIRMED__;
    }
    return true;
  }

  notifyError(
    "Error",
    "Delete is not ready yet. Please wait for the page to finish loading.",
    showNotification
  );
  return false;
}

export function requestSummaryDeleteConfirmation({ showConfirmDelete, showNotification, t }) {
  const collect =
    typeof window.collectValidDeleteRowTargets === "function"
      ? window.collectValidDeleteRowTargets
      : collectValidDeleteRowTargetsFromDom;

  const valid = collect();
  if (!valid.length) {
    notifyError(
      "Error",
      t ? t("deleteInvalidRows") : "Please select valid rows to delete. Empty sub rows cannot be deleted.",
      showNotification
    );
    return;
  }

  const message = t
    ? t("deleteConfirm", { count: valid.length })
    : `Are you sure you want to delete ${valid.length} selected row(s)? This action cannot be undone.`;

  openConfirmDelete(
    message,
    () => runDeleteAfterConfirm(valid, showNotification),
    showConfirmDelete
  );
}
