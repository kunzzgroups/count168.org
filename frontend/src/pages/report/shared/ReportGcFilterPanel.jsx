/**
 * Process List（user-gc-inline-panel）同款：GroupID / Company / Currency 分段控件。
 */
export default function ReportGcFilterPanel({
  groupIds,
  groupFilterKind,
  selectedGroupKey,
  onPickAllGroups,
  onPickGroup,
  companyButtons,
  companyId,
  /** 乐观高亮：切换会话未返回前显示为已选 */
  highlightCompanyId,
  onSwitchCompany,
  currencyList,
  showAllCurrencies,
  selectedCurrencies,
  toggleAllCurrencies,
  toggleCurrency,
  t,
}) {
  const hasGroup = Array.isArray(groupIds) && groupIds.length > 0;
  const hasCompanies = Array.isArray(companyButtons) && companyButtons.length > 0;
  const hasCurrency = Array.isArray(currencyList) && currencyList.length > 0;
  if (!hasGroup && !hasCompanies && !hasCurrency) return null;

  const activeCompanyId = highlightCompanyId != null ? highlightCompanyId : companyId;

  return (
    <div className="user-gc-inline-panel report-gc-inline-panel">
      {hasGroup && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("groupId")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
              <button
                type="button"
                className={`user-gc-segment${groupFilterKind === "all" ? " is-on" : ""}`}
                onClick={onPickAllGroups}
              >
                {t("groupFilterAll")}
              </button>
              {groupIds.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`user-gc-segment${groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""}`}
                  onClick={() => onPickGroup(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {hasCompanies && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("company")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
              {companyButtons.map((c) => {
                const active = Number(c.id) === Number(activeCompanyId);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`user-gc-segment${active ? " is-on" : ""}`}
                    onClick={() => {
                      if (!active) void onSwitchCompany(c);
                    }}
                  >
                    {String(c.company_id || "").toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {hasCurrency && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("currency")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("currency")}>
              <button
                type="button"
                className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                onClick={toggleAllCurrencies}
              >
                {t("groupFilterAll")}
              </button>
              {currencyList.map((row) => {
                const code = row.code;
                const on = !showAllCurrencies && selectedCurrencies.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`user-gc-segment${on ? " is-on" : ""}`}
                    onClick={() => toggleCurrency(code)}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
