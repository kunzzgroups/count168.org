/** Keep Summary top-bar delete button label in sync (legacy must not own button text in SPA). */
export function syncSummaryDeleteButtonLabel(t, countOverride) {
  if (typeof t !== "function") return 0;

  const count =
    countOverride != null
      ? Number(countOverride) || 0
      : document.querySelectorAll(".summary-row-checkbox:checked").length;

  const label = count > 0 ? t("deleteWithCount", { count }) : t("delete");
  const btn = document.getElementById("summaryDeleteSelectedBtn");
  if (btn) {
    btn.textContent = label;
    btn.disabled = count <= 0;
    btn.setAttribute("aria-label", label);
  }

  return count;
}
