import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import CompanySettingsModal from "./CompanySettingsModal.jsx";
import {
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  normalizeFeeShareFromServer,
  ensureCompanyFeeShare,
  companyToDomainPayloadEntry,
  forceUppercaseValue,
  forceLowercaseValue,
  forceNumericValue,
} from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

function normalizeDomainCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

/** @returns {string|null} conflicting code if any group id equals a company id */
function findGroupCompanyCodeOverlap(tempGroups, tempCompanies) {
  const groupSet = new Set(tempGroups.map((g) => normalizeDomainCode(g)).filter(Boolean));
  for (const c of tempCompanies) {
    const cid = normalizeDomainCode(c.company_id);
    if (cid && groupSet.has(cid)) return cid;
  }
  return null;
}

/**
 * Domain Add/Edit Modal
 * Props:
 *   isEditMode      — boolean
 *   editingDomain   — domain object (for edit), null for add
 *   hasC168Context  — boolean
 *   isOwnerOrAdmin  — boolean
 *   sessionCompanyId   — number
 *   sessionCompanyCode — string
 *   domainFeePrice  — number (for share calc)
 *   onClose()
 *   onSaved(domainData) — called after successful save
 */
export default function DomainFormModal({
  lang = "en",
  isEditMode, editingDomain, hasC168Context, isOwnerOrAdmin,
  sessionCompanyId, sessionCompanyCode, domainFeePrice,
  onClose, onSaved,
}) {
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Basic fields
  const [ownerCode, setOwnerCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondaryPassword, setSecondaryPassword] = useState("");

  // Company / Group management
  const [tempCompanies, setTempCompanies] = useState([]);
  const [tempGroups, setTempGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [isMultipleChoiceMode, setIsMultipleChoiceMode] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [groupInput, setGroupInput] = useState("");

  // Company Settings sub-modal
  const [csModalCompanyId, setCsModalCompanyId] = useState(null);

  function toastDanger(message) {
    showDomainAlert(message, "danger");
  }

  /** 与库中任一 owner 的 company_id / group_id 冲突则失败；编辑时可排除当前 owner 已有行（见 domain_api validate_domain_code） */
  async function validateCodeGlobally(code) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return false;
    try {
      const payload = {
        action: "validate_domain_code",
        code: trimmed,
      };
      if (isEditMode && editingDomain?.id !== undefined && editingDomain?.id !== null && editingDomain?.id !== "") {
        payload.exclude_owner_id = Number(editingDomain.id);
      }
      const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toastDanger(json.message || t("operationFailed"));
        return false;
      }
      return true;
    } catch {
      toastDanger(t("validateDomainCodeUnavailable"));
      return false;
    }
  }

  const showSecondaryPwd =
    !isEditMode || (hasC168Context && isOwnerOrAdmin);

  // On mount, load data if editing
  useEffect(() => {
    if (isEditMode && editingDomain) {
      setOwnerCode(editingDomain.owner_code || "");
      setName(editingDomain.name || "");
      setEmail(editingDomain.email || "");
      // Load companies from API
      fetch(buildApiUrl("api/domain/domain_api.php"), {
        cache: "no-cache",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_companies", owner_id: editingDomain.id }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data?.companies) {
            const allGroups = new Set();
            const validCompanies = [];
            data.data.companies.forEach((c) => {
              if (c.group_id) allGroups.add(normalizeDomainCode(c.group_id));
              if (c.company_id) {
                const co = {
                  company_id: c.company_id,
                  expiration_date: c.expiration_date || null,
                  permissions: Array.isArray(c.permissions) ? c.permissions : [],
                  group_id: c.group_id ? normalizeDomainCode(c.group_id) : null,
                  fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
                };
                ensureCompanyFeeShare(co);
                co.originalExpirationDate = co.expiration_date || null;
                co.selectedPeriod = null;
                co.startDate = new Date().toISOString().split("T")[0];
                co.isExtending = !!co.expiration_date;
                validCompanies.push(co);
              }
            });
            setTempCompanies(validCompanies);
            setTempGroups([...allGroups].map(normalizeDomainCode).filter(Boolean).sort());
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── Company helpers ────────────────────────────────────────────────────────

  async function addCompany() {
    const cid = companyInput.trim().toUpperCase();
    if (!cid) { toastDanger(t("pleaseEnterCompanyId")); return; }
    if (tempGroups.some((g) => normalizeDomainCode(g) === cid)) {
      toastDanger(t("cannotAddCompanyUsesGroupId", { id: cid }));
      return;
    }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === cid)) {
      toastDanger(t("companyIdAlreadyAdded"));
      return;
    }
    if (!(await validateCodeGlobally(cid))) return;
    const isC168 = cid === "C168";
    const today = new Date().toISOString().split("T")[0];
    const newExpDate = isC168 ? null : calculateExpirationDate("1month", today);
    const newCo = {
      company_id: cid,
      expiration_date: newExpDate,
      originalExpirationDate: newExpDate,
      startDate: today,
      isExtending: false,
      group_id: selectedGroupId || null,
      permissions: [],
      fee_share_allocations: defaultFeeShareAllocations(),
    };
    setTempCompanies((prev) => [...prev, newCo]);
    setCompanyInput("");
  }

  function removeCompany(cid) {
    setTempCompanies((prev) => prev.filter((c) => c.company_id !== cid));
  }

  async function addGroup() {
    const gid = groupInput.trim().toUpperCase();
    if (!gid) { toastDanger(t("pleaseEnterGroupId")); return; }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === gid)) {
      toastDanger(t("cannotAddGroupUsesCompanyId", { id: gid }));
      return;
    }
    if (tempGroups.some((g) => normalizeDomainCode(g) === gid)) {
      toastDanger(t("groupIdAlreadyExists"));
      return;
    }
    if (!(await validateCodeGlobally(gid))) return;
    setTempGroups((prev) => [...prev, gid]);
    setGroupInput("");
    showDomainAlert(t("groupAdded", { gid }));
  }

  function removeGroup(gid) {
    const count = tempCompanies.filter((c) => c.group_id === gid).length;
    const msg = count > 0
      ? t("confirmDeleteGroupWithCount", { gid, count })
      : t("confirmDeleteGroup", { gid });
    if (!confirm(msg)) return;
    setTempCompanies((prev) => prev.map((c) => c.group_id === gid ? { ...c, group_id: null } : c));
    setTempGroups((prev) => prev.filter((g) => g !== gid));
    if (selectedGroupId === gid) { setSelectedGroupId(null); setIsMultipleChoiceMode(false); }
    showDomainAlert(t("groupRemoved", { gid }));
  }

  function selectGroup(gid) {
    setSelectedGroupId((prev) => prev === gid ? null : gid);
    setIsMultipleChoiceMode(false);
  }

  function toggleMultipleChoice() {
    if (!selectedGroupId) { toastDanger(t("pleaseSelectGroupFirst")); return; }
    setIsMultipleChoiceMode((prev) => !prev);
  }

  function toggleCompanyGroup(cid) {
    if (!selectedGroupId) return;
    setTempCompanies((prev) => prev.map((c) =>
      c.company_id === cid
        ? { ...c, group_id: c.group_id === selectedGroupId ? null : selectedGroupId }
        : c
    ));
  }

  /** 多选：对当前列表内公司全部归入 / 撤出当前分组 */
  function toggleAssignSelectAll(candidateRows) {
    if (!selectedGroupId || candidateRows.length === 0) return;
    const allIn = candidateRows.every((c) => c.group_id === selectedGroupId);
    const idsInFilter = new Set(candidateRows.map((c) => c.company_id));
    setTempCompanies((prev) =>
      prev.map((c) => {
        if (!idsInFilter.has(c.company_id)) return c;
        if (allIn) {
          return c.group_id === selectedGroupId ? { ...c, group_id: null } : c;
        }
        return { ...c, group_id: selectedGroupId };
      })
    );
  }

  // ── Company Settings sub-modal callbacks ──────────────────────────────────

  function openCompanySettings(cid) {
    setCsModalCompanyId(cid);
  }

  function handleCompanySettingsSaved(updatedCo) {
    setTempCompanies((prev) =>
      prev.map((c) => c.company_id === updatedCo.company_id ? { ...c, ...updatedCo } : c)
    );
    setCsModalCompanyId(null);
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  function buildCompaniesPayload() {
    const sorted = [...tempCompanies].sort((a, b) =>
      a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase())
    );
    const cleaned = sorted.map(companyToDomainPayloadEntry);
    // Add empty-company entries for groups with no companies
    const groupsWithCos = new Set(cleaned.map((c) => c.group_id).filter(Boolean));
    tempGroups.forEach((gid) => {
      if (!groupsWithCos.has(gid)) {
        cleaned.push(companyToDomainPayloadEntry({
          company_id: "", expiration_date: null, permissions: [],
          group_id: gid, fee_share_allocations: defaultFeeShareAllocations(),
        }));
      }
    });
    return cleaned;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.toLowerCase().endsWith("@gmail.com")) {
      toastDanger(t("onlyGmailAllowed"));
      return;
    }
    const overlap = findGroupCompanyCodeOverlap(tempGroups, tempCompanies);
    if (overlap) {
      toastDanger(t("groupCompanyIdOverlapSave", { id: overlap }));
      return;
    }
    const data = {
      action: isEditMode ? "update" : "create",
      owner_code: ownerCode,
      name,
      email,
      companies: JSON.stringify(buildCompaniesPayload()),
    };
    if (!isEditMode || password) data.password = password;
    if (!isEditMode) {
      data.secondary_password = secondaryPassword;
      data.id = "";
    } else {
      data.id = editingDomain.id;
      if (secondaryPassword) data.secondary_password = secondaryPassword;
    }

    console.log("[Domain Save] companies data:", data.companies);

    try {
      const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        showDomainAlert(isEditMode ? t("ownerUpdated") : t("ownerCreated"));
        onSaved(json.data);
        onClose();
      } else {
        toastDanger(json.message || t("operationFailed"));
      }
    } catch {
      toastDanger(t("saveOwnerError"));
    }
  }

  // ── Company display ────────────────────────────────────────────────────────

  function renderCompanyList() {
    let filtered;
    if (selectedGroupId) {
      filtered = tempCompanies.filter((c) => c.group_id === selectedGroupId);
    } else if (tempGroups.length > 0) {
      filtered = tempCompanies.filter((c) => !c.group_id);
    } else {
      filtered = [...tempCompanies];
    }

    if (isMultipleChoiceMode && selectedGroupId) {
      const pool = tempCompanies
        .filter((c) => !c.group_id || c.group_id === selectedGroupId)
        .sort((a, b) => a.company_id.localeCompare(b.company_id));

      if (pool.length === 0) {
        return <span className="dfm-empty-hint">{t("noUngroupedCompaniesAvailable")}</span>;
      }

      const allAssigned =
        pool.length > 0 && pool.every((c) => c.group_id === selectedGroupId);

      return (
        <div className="dfm-assign-mc-stack">
          <label className="dfm-assign-mc-select-all">
            <input
              type="checkbox"
              className="dfm-assign-ref-checkbox dfm-assign-select-all-checkbox"
              checked={allAssigned}
              onChange={() => toggleAssignSelectAll(pool)}
            />
            <span>{t("selectAll")}</span>
          </label>
          <div className="dfm-assign-mc-list">
            {pool.map((c) => (
              <div key={c.company_id} className="company-item dfm-assign-mc-row">
                <div className="company-item-left">
                  <input
                    type="checkbox"
                    id={`dfm-mc-${c.company_id}`}
                    className="dfm-assign-ref-checkbox dfm-assign-row-checkbox"
                    checked={c.group_id === selectedGroupId}
                    onChange={() => toggleCompanyGroup(c.company_id)}
                  />
                  <label className="dfm-assign-mc-name" htmlFor={`dfm-mc-${c.company_id}`}>
                    {c.company_id}
                  </label>
                </div>
                <div className="company-item-right">
                  <span className="exp-date-display">
                    {c.expiration_date ? formatDate(c.expiration_date) : t("notSet")}
                  </span>
                  <button
                    type="button"
                    className="company-reset-btn"
                    onClick={() => openCompanySettings(c.company_id)}
                    title={t("setExpirationDate")}
                  >
                    {t("set")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const sorted = [...filtered].sort((a, b) => a.company_id.localeCompare(b.company_id));
    if (sorted.length === 0) {
      const msg = selectedGroupId
        ? t("noCompaniesInGroup", { gid: selectedGroupId })
        : t("noUngroupedCompanies");
      return <span className="dfm-empty-hint">{msg}</span>;
    }

    return sorted.map((c) => (
      <div key={c.company_id} className="company-item">
        <div className="company-item-left">
          <span>{c.company_id}</span>
        </div>
        <div className="company-item-right">
          <span className="exp-date-display">
            {c.expiration_date ? formatDate(c.expiration_date) : t("notSet")}
          </span>
          <button
            type="button"
            className="company-reset-btn"
            onClick={() => openCompanySettings(c.company_id)}
            title={t("setExpirationDate")}
          >
            {t("set")}
          </button>
          <button type="button" className="company-remove-btn" onClick={() => removeCompany(c.company_id)}>
            {t("remove")}
          </button>
        </div>
      </div>
    ));
  }

  const csCompany = csModalCompanyId
    ? tempCompanies.find((c) => c.company_id === csModalCompanyId)
    : null;

  const showMcAssignPanel = isMultipleChoiceMode && selectedGroupId;
  const multiChoiceToggle =
    selectedGroupId ? (
      <button
        type="button"
        className={`dfm-multi-choice-btn ${
          isMultipleChoiceMode ? "dfm-multi-choice-btn--on" : "dfm-multi-choice-btn--off"
        }`}
        aria-pressed={isMultipleChoiceMode}
        onClick={toggleMultipleChoice}
      >
        {isMultipleChoiceMode ? (
          <span className="dfm-mc-done-content">
            <span>{t("doneCompact")}</span>
            <span className="dfm-mc-done-icon" aria-hidden="true">
              <span className="dfm-mc-done-icon-check" />
            </span>
          </span>
        ) : (
          t("multipleChoice")
        )}
      </button>
    ) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DomainModalPortal>
      {/* z-index fixed inline: production Tailwind 若未抽出 arbitrary z-[50001]，弹窗可能在 #root/sidebar 下不可见 */}
      <div
        className="domain-form-modal-backdrop"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: 2147483000,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div className="domain-form-modal-panel relative mx-auto my-[1.5%] flex w-[96%] max-w-[1100px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
          <div className="dfm-header flex items-center justify-between border-b border-gray-300 bg-[#f4f5f7] px-9 py-[18px]">
            <h2 className="m-0 bg-transparent p-0 text-xl font-bold tracking-[1.5px] text-black">{isEditMode ? t("editDomain") : t("addDomain")}</h2>
            <button type="button" className="account-close" onClick={onClose} aria-label="Close" />
          </div>
          <form className="domain-form-modal-form flex flex-col bg-white" onSubmit={handleSubmit}>
            <input type="hidden" value={isEditMode ? editingDomain?.id : ""} />
            <div className="domain-form-modal-body px-9 py-6">
              <div className="dfm-grid-two dfm-section-row">
                <div className="dfm-section-heading">{t("domainInformation")}</div>
                <div className="dfm-section-heading">{t("companyInformation")}</div>
              </div>
              <div className="dfm-section-divider h-[2.5px] w-full bg-blue-900" />
              <div className="dfm-grid-two">
                {/* Left: Domain info */}
                <div className="dfm-col-left min-w-0">
                  <div className="dfm-field">
                    <label htmlFor="df_owner_code">{t("ownerCode")} *</label>
                    <input
                      type="text" id="df_owner_code" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      value={ownerCode}
                      disabled={isEditMode}
                      onChange={(e) => setOwnerCode(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_name">{t("name")} *</label>
                    <input
                      type="text" id="df_name" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      value={name}
                      onChange={(e) => setName(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_email">{t("email")} *</label>
                    <input
                      type="email" id="df_email" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      pattern=".*@gmail\.com$"
                      value={email}
                      onChange={(e) => setEmail(forceLowercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_password">{t("password")} {!isEditMode && "*"}</label>
                    <input
                      type="password" id="df_password" className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      required={!isEditMode}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {showSecondaryPwd && (
                    <div className="dfm-field">
                      <label htmlFor="df_secondary_pwd">
                        {t("secondaryPassword")} {!isEditMode && "*"}
                      </label>
                      <input
                        type="password" id="df_secondary_pwd" className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={isEditMode ? t("leaveEmptyKeepCurrentPassword") : t("sixDigitsOnly")}
                        required={!isEditMode}
                        value={secondaryPassword}
                        onChange={(e) => setSecondaryPassword(forceNumericValue(e.target.value))}
                      />
                      <small className="dfm-helper-text">{t("secondaryPwdRequirement")}</small>
                    </div>
                  )}
                </div>

                {/* Right: Company info */}
                <div className="dfm-col-right flex min-w-0 flex-col">
                  <div className="dfm-company-inputs-row mb-1 flex flex-wrap">
                    <div className="dfm-field min-w-0 flex-1">
                      <label htmlFor="df_group_input">{t("groupIdLabel")}</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text"
                          id="df_group_input"
                          placeholder={t("groupIdPlaceholder")}
                          className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={groupInput}
                          onChange={(e) => setGroupInput(forceUppercaseValue(e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addGroup}>{t("add")}</button>
                      </div>
                    </div>
                    <div className="dfm-field min-w-0 flex-1">
                      <label htmlFor="df_company_input">{t("companyIdLabel")}</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text"
                          id="df_company_input"
                          placeholder={t("companyIdPlaceholder")}
                          className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={companyInput}
                          onChange={(e) => setCompanyInput(forceUppercaseValue(e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addCompany}>{t("add")}</button>
                      </div>
                    </div>
                  </div>

                  <div className="dfm-field" id="groupPillsSection">
                    <label>{t("groupLabel")}</label>
                    <div className="group-pills">
                      {tempGroups.length === 0
                        ? <span className="dfm-empty-hint">{t("noGroupsCreated")}</span>
                        : tempGroups.map((gid) => {
                          const count = tempCompanies.filter((c) => c.group_id === gid).length;
                          return (
                            <span
                              key={gid}
                              role="button"
                              tabIndex={0}
                              className={`group-pill ${selectedGroupId === gid ? "active" : ""}`}
                              onClick={() => selectGroup(gid)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  selectGroup(gid);
                                }
                              }}
                            >
                              {gid} ({count})
                              <span
                                className="remove-x"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeGroup(gid);
                                }}
                              >
                                &times;
                              </span>
                            </span>
                          );
                        })
                      }
                    </div>
                  </div>

                  <div className="dfm-field dfm-field--stretch flex flex-1 flex-col">
                    {!showMcAssignPanel && (
                      <div className="dfm-selected-companies-row mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="dfm-selected-companies-label">{t("selectedCompanies")}</span>
                        {multiChoiceToggle}
                      </div>
                    )}
                    <div
                      className={`dfm-selected-list${showMcAssignPanel ? " dfm-selected-list--mc-mode" : ""}`}
                    >
                      {showMcAssignPanel && (
                        <div className="dfm-mc-panel-head">
                          <span className="dfm-selected-companies-label">{t("selectedCompanies")}</span>
                          {multiChoiceToggle}
                        </div>
                      )}
                      {tempCompanies.length === 0 ? (
                        <span className="dfm-empty-hint">{t("noCompaniesAddedYet")}</span>
                      ) : (
                        renderCompanyList()
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="dfm-footer-actions flex flex-wrap items-center justify-center border-t-[2.5px] border-blue-900 bg-white px-9 py-[18px]">
              <button type="submit" className="dfm-footer-btn dfm-footer-btn--primary">{t("confirm")}</button>
              <button type="button" className="dfm-footer-btn dfm-footer-btn--secondary" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Company Settings sub-modal */}
      {csCompany && (
        <CompanySettingsModal
          lang={lang}
          company={csCompany}
          domainFeePrice={domainFeePrice}
          sessionCompanyId={sessionCompanyId}
          sessionCompanyCode={sessionCompanyCode}
          onSave={handleCompanySettingsSaved}
          onClose={() => setCsModalCompanyId(null)}
        />
      )}
    </DomainModalPortal>
  );
}
