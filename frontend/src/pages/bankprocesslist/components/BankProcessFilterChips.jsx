import React from "react";

export default function BankProcessFilterChips({
  t,
  layout = "inline",
  showInactive,
  setShowInactive,
  showAll,
  setShowAll,
  showOfficial,
  setShowOfficial,
  showEInvoice,
  setShowEInvoice,
  showBlock,
  setShowBlock,
}) {
  const isDropdown = layout === "dropdown";
  return (
    <div
      className={[
        "userlist-filter-chips",
        "userlist-filter-chips--bank-process",
        isDropdown ? "userlist-filter-chips--bank-process-dropdown" : "",
      ].filter(Boolean).join(" ")}
      role="group"
    >
      <button
        type="button"
        className={`user-filter-chip${showInactive && !showAll ? " is-selected" : ""}`}
        aria-pressed={showInactive && !showAll}
        onClick={() => {
          if (showInactive && !showAll) setShowInactive(false);
          else {
            setShowInactive(true);
            setShowAll(false);
          }
        }}
      >
        <span className="user-filter-chip__dot" aria-hidden>
          {showInactive && !showAll ? (
            <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12l4 4 8-8" />
            </svg>
          ) : null}
        </span>
        <span className="user-filter-chip__label">{t("showInactive")}</span>
      </button>
      <button
        type="button"
        className={`user-filter-chip${showAll ? " is-selected" : ""}`}
        aria-pressed={showAll}
        onClick={() => {
          if (showAll) setShowAll(false);
          else {
            setShowAll(true);
            setShowInactive(false);
            setShowOfficial(false);
            setShowEInvoice(false);
            setShowBlock(false);
          }
        }}
      >
        <span className="user-filter-chip__dot" aria-hidden>
          {showAll ? (
            <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12l4 4 8-8" />
            </svg>
          ) : null}
        </span>
        <span className="user-filter-chip__label">{t("showAll")}</span>
      </button>
      <button
        type="button"
        className={`user-filter-chip${showOfficial ? " is-selected" : ""}`}
        aria-pressed={showOfficial}
        onClick={() => {
          if (showOfficial) setShowOfficial(false);
          else {
            setShowOfficial(true);
            setShowAll(false);
          }
        }}
      >
        <span className="user-filter-chip__dot" aria-hidden>
          {showOfficial ? (
            <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12l4 4 8-8" />
            </svg>
          ) : null}
        </span>
        <span className="user-filter-chip__label">{t("showOfficial")}</span>
      </button>
      <button
        type="button"
        className={`user-filter-chip${showEInvoice ? " is-selected" : ""}`}
        aria-pressed={showEInvoice}
        onClick={() => {
          if (showEInvoice) setShowEInvoice(false);
          else {
            setShowEInvoice(true);
            setShowAll(false);
          }
        }}
      >
        <span className="user-filter-chip__dot" aria-hidden>
          {showEInvoice ? (
            <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12l4 4 8-8" />
            </svg>
          ) : null}
        </span>
        <span className="user-filter-chip__label">{t("showEInvoice")}</span>
      </button>
      <button
        type="button"
        className={`user-filter-chip${showBlock ? " is-selected" : ""}`}
        aria-pressed={showBlock}
        onClick={() => {
          if (showBlock) setShowBlock(false);
          else {
            setShowBlock(true);
            setShowAll(false);
          }
        }}
      >
        <span className="user-filter-chip__dot" aria-hidden>
          {showBlock ? (
            <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12l4 4 8-8" />
            </svg>
          ) : null}
        </span>
        <span className="user-filter-chip__label">{t("showBlock")}</span>
      </button>
    </div>
  );
}
