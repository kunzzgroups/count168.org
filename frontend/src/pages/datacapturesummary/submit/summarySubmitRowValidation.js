/**
 * Validate Currency + Formula on rows that have Account filled (Submit gate).
 */
export function validateSummaryRowsCurrencyFormula(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const cells = row.querySelectorAll("td");
    const selectCheckbox = row.querySelector(".summary-select-checkbox");
    if (selectCheckbox && selectCheckbox.checked) continue;

    const accountCell = cells[1];
    if (!accountCell) continue;

    const accountText = accountCell.textContent.trim();
    const hasButton = accountCell.querySelector(".add-account-btn");
    if (!accountText || accountText === "+" || hasButton) continue;

    const currencyCell = cells[3];
    const currencyText = currencyCell?.textContent
      ? String(currencyCell.textContent).trim().replace(/[()]/g, "")
      : "";
    const formulaCell = cells[4];
    const formulaText = formulaCell
      ? formulaCell.querySelector(".formula-text")?.textContent.trim() ||
        formulaCell.textContent.trim() ||
        ""
      : "";

    const currencyEmpty = !currencyText || /^select\s*curren/i.test(currencyText);
    const formulaEmpty = !formulaText || !String(formulaText).trim();

    if (currencyEmpty || formulaEmpty) {
      const msg =
        currencyEmpty && formulaEmpty
          ? "请先填写 Currency 和 Formula 后再提交。Cannot save: Currency and Formula are required."
          : currencyEmpty
            ? "请先选择 Currency 后再提交。Cannot save: Currency is required."
            : "请先填写 Formula 后再提交。Cannot save: Formula is required.";
      return { ok: false, message: msg };
    }
  }
  return { ok: true };
}
