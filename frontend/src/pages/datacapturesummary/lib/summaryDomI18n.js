import { syncSummaryDeleteButtonLabel } from "./summaryDeleteButtonLabel.js";

/**
 * Re-apply Summary page labels on legacy-managed DOM nodes (Edit Formula, etc.).
 */
export function applySummaryDomLabels(t) {
  if (typeof t !== "function") return;

  syncSummaryDeleteButtonLabel(t);

  const labelForMap = {
    process: "idProduct",
    account: "account",
    sourcePercent: "source",
    descriptionSelect1: "data",
    formula: "formula",
    inputMethod: "inputMethod",
    currency: "currency",
    description: "description",
    rateInput: "rate",
  };

  Object.entries(labelForMap).forEach(([forId, key]) => {
    const label = document.querySelector(`label[for="${forId}"]`);
    if (label) label.textContent = t(key);
  });

  const accountBtn = document.getElementById("account");
  if (accountBtn) {
    const placeholder = t("selectAccount");
    accountBtn.setAttribute("data-placeholder", placeholder);
    if (!accountBtn.getAttribute("data-value")) {
      accountBtn.textContent = placeholder;
    }
  }

  const searchInput = document.querySelector("#account_dropdown input[type=\"text\"]");
  if (searchInput) searchInput.placeholder = t("searchAccount");

  const currencySelect = document.getElementById("currency");
  if (currencySelect?.options?.length && currencySelect.options[0].value === "") {
    currencySelect.options[0].textContent = t("selectCurrency");
  }

  const desc1 = document.getElementById("descriptionSelect1");
  if (desc1?.options?.length && desc1.options[0].value === "") {
    desc1.options[0].textContent = t("selectIdProduct");
  }

  const desc2 = document.getElementById("descriptionSelect2");
  if (desc2?.options?.length && desc2.options[0].value === "") {
    desc2.options[0].textContent = t("selectRowData");
  }

  const sourcePercent = document.getElementById("sourcePercent");
  if (sourcePercent) sourcePercent.placeholder = t("sourcePercentPlaceholder");

  const formulaInput = document.getElementById("formula");
  if (formulaInput) formulaInput.placeholder = t("formulaPlaceholder");

  const addDataBtn = document.querySelector("#editFormulaForm .description-add-btn");
  if (addDataBtn) {
    addDataBtn.title = t("addSelectedDataToFormula");
    addDataBtn.textContent = t("add");
  }

  const addAccountBtn = document.querySelector("#editFormulaForm .account-add-btn");
  if (addAccountBtn) addAccountBtn.title = t("addNewAccount");

  const saveBtn = document.getElementById("editFormulaSaveBtn");
  if (saveBtn) saveBtn.textContent = t("save");

  const inputMethod = document.getElementById("inputMethod");
  if (inputMethod?.options?.length && inputMethod.options[0].value === "") {
    inputMethod.options[0].textContent = t("selectInputMethod");
  }
}
