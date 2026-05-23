import { EDIT_FORMULA_INPUT_METHODS, CALCULATOR_KEYPAD } from "../formula/editFormulaConstants.js";
import { getSummaryInputMethodLabel } from "../../../translateFile/pages/dataCaptureSummaryTranslate.js";

function CalcButton({ value, action, className = "", clearLabel = "Clr" }) {
  const isOperator = ["/", "*", "-", "+"].includes(value);
  const isClear = action === "clear";
  const isEquals = action === "equals";
  let btnClass = "calc-btn";
  if (isOperator) btnClass += " calc-operator";
  if (isClear) btnClass += " calc-clear";
  if (isEquals) btnClass += " calc-operator";
  if (className) btnClass += ` ${className}`;

  return (
    <button
      type="button"
      className={btnClass}
      data-value={value || undefined}
      data-action={action || undefined}
    >
      {isClear ? clearLabel : isEquals ? "=" : value}
    </button>
  );
}

export default function EditFormulaModal({ t, open, productValue, onClose, onOpenAddAccount }) {
  const handleOpenAddAccount = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onOpenAddAccount === "function") {
      void onOpenAddAccount();
      return;
    }
    if (typeof window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__ === "function") {
      window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__();
      return;
    }
    window.showAddAccountModal?.();
  };
  if (!open) return null;

  const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";

  return (
    <div
      id="editFormulaModal"
      className="summary-modal"
      style={{ display: "flex" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-formula-title"
    >
      <div className="summary-confirm-modal-content" id="editFormulaModalContent">
        <div id="editFormulaForm" className="edit-formula-form-container">
          <div className="form-header">
            <h3 id="edit-formula-title">{t("editFormula")}</h3>
            <button type="button" className="account-close" onClick={onClose} aria-label={t("close")} />
          </div>
          <div className="form-content">
            <div className="form-layout">
              <div className="form-left-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="process">{t("idProduct")}</label>
                    <input type="text" id="process" defaultValue={productValue || ""} readOnly />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="account">{t("account")}</label>
                    <div className="account-select-with-buttons">
                      <div className="custom-select-wrapper">
                        <button
                          type="button"
                          className="custom-select-button"
                          id="account"
                          data-placeholder={t("selectAccount")}
                          name="account"
                        >
                          {t("selectAccount")}
                        </button>
                        <div className="custom-select-dropdown" id="account_dropdown">
                          <div className="custom-select-search">
                            <input type="text" placeholder={t("searchAccount")} autoComplete="off" />
                          </div>
                          <div className="custom-select-options" />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="account-add-btn"
                        onClick={handleOpenAddAccount}
                        title={t("addNewAccount")}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row source-percent-row">
                  <div className="form-group source-percent-group">
                    <label htmlFor="sourcePercent">{t("source")}</label>
                    <input type="text" id="sourcePercent" placeholder={t("sourcePercentPlaceholder")} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="descriptionSelect1">{t("data")}</label>
                    <div className="description-select-with-buttons">
                      <select id="descriptionSelect1" defaultValue="">
                        <option value="">{t("selectIdProduct")}</option>
                      </select>
                      <select id="descriptionSelect2" defaultValue="">
                        <option value="">{t("selectRowData")}</option>
                      </select>
                      <button
                        type="button"
                        className="description-add-btn"
                        onClick={() => window.addSelectedDataToFormula?.()}
                        title={t("addSelectedDataToFormula")}
                      >
                        {t("add")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formula">{t("formula")}</label>
                    <input type="text" id="formula" placeholder={t("formulaPlaceholder")} />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDisplay" />
                    <input
                      type="text"
                      id="formulaDisplay"
                      readOnly
                      style={{
                        backgroundColor: "#f5f5f5",
                        cursor: "not-allowed",
                        color: "#666",
                        fontStyle: "italic",
                      }}
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDataGrid" />
                    <div id="formulaDataGrid" className="formula-data-grid" />
                  </div>
                </div>
              </div>

              <div className="form-middle-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="inputMethod">{t("inputMethod")}</label>
                    <select id="inputMethod" defaultValue="">
                      {EDIT_FORMULA_INPUT_METHODS.map((opt) => (
                        <option key={opt.value || "empty"} value={opt.value}>
                          {getSummaryInputMethodLabel(lang, opt.value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="currency">{t("currency")}</label>
                    <select id="currency" defaultValue="">
                      <option value="">{t("selectCurrency")}</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="description">{t("description")}</label>
                    <input type="text" id="description" placeholder="" />
                  </div>
                </div>
              </div>

              <div className="form-right-column calculator-column">
                <div className="calculator-keypad">
                  {CALCULATOR_KEYPAD.map((row, rowIndex) => (
                    <div className="calculator-row" key={`calc-row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => {
                        if (cell === "") {
                          return <button key={`empty-${cellIndex}`} type="button" className="calc-btn calc-empty" />;
                        }
                        if (cell === "clear") {
                          return <CalcButton key="clear" action="clear" clearLabel={t("calcClear")} />;
                        }
                        if (cell === "equals") {
                          return <CalcButton key="equals" action="equals" />;
                        }
                        return <CalcButton key={cell} value={cell} />;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions edit-formula-form-actions">
            <button type="button" id="editFormulaSaveBtn" className="btn btn-save" disabled>
              {t("save")}
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
