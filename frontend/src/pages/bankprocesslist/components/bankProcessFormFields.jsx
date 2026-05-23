import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProcessModalDropdownZIndex } from "../../../components/ProcessModalPortal.jsx";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { filterBankPickAccounts, formatBankAccountDisplay, isoToDmy } from "../lib/bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 180;
const ACCOUNT_PICK_MIN_WIDTH = 220;

export function BankSimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "",
  disabled = false,
  includeEmptyOption = true,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(280);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, PORTAL_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - 24;
    const spaceAbove = rect.top - 24;
    const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxOpt = Math.max(120, Math.min(320, (openBelow ? spaceBelow : spaceAbove) - 16));
    setOptionsMaxHeight(maxOpt);
    setMenuStyle({
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      top: openBelow ? `${rect.bottom + 2}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + 2}px`,
      zIndex: getProcessModalDropdownZIndex(wrapRef.current),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal, #confirmBankResendModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
      id={id ? `${id}_dropdown` : undefined}
    >
      <div className="custom-select-options" style={{ maxHeight: optionsMaxHeight }}>
        {includeEmptyOption ? (
          <div
            className={`custom-select-option${!value ? " selected" : ""}`}
            role="option"
            aria-selected={!value}
            onClick={() => pick("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pick("");
            }}
          >
            {placeholder}
          </div>
        ) : null}
        {options.map((opt) => (
          <div
            key={opt.value}
            className={`custom-select-option${
              String(opt.value) === String(value) ? " selected" : ""
            }${opt.disabled ? " custom-select-option--disabled" : ""}`}
            role="option"
            aria-selected={String(opt.value) === String(value)}
            aria-disabled={opt.disabled || undefined}
            onClick={() => {
              if (opt.disabled) return;
              pick(opt.value);
            }}
            onKeyDown={(e) => {
              if (opt.disabled) return;
              if (e.key === "Enter" || e.key === " ") pick(opt.value);
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`custom-select-wrapper bank-simple-select${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {displayLabel}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}

/**
 * Single-date field for Add/Edit Bank Process — uses MaintenanceDateRangePicker
 * (localized month/weekday labels) instead of native type="date".
 */
export function BankFormDateField({
  fieldKey,
  label,
  htmlFor,
  value,
  disabled = false,
  minYmd,
  placeholder,
  clearLabel = "Clear",
  className = "",
  wrapClassName = "",
}) {
  const fromId = `${fieldKey}_drp_from`;
  const toId = `${fieldKey}_drp_to`;
  const displayId = `${fieldKey}_drp_display`;
  const pickerId = `${fieldKey}_drp_picker`;
  const displayDmy = isoToDmy(String(value || "").trim());

  useEffect(() => {
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
  }, []);

  useEffect(() => {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    if (!fromEl || !toEl) return;
    const dmy = displayDmy;
    if (fromEl.value !== dmy) fromEl.value = dmy;
    if (toEl.value !== dmy) toEl.value = dmy;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: fromId,
      dateToId: toId,
      displayId,
    });
  }, [displayDmy, fromId, toId, displayId]);

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !displayDmy) return;
    const picker = document.getElementById(pickerId);
    if (picker) window.MaintenanceDateRangePicker?.clearForPicker?.(picker);
  };

  return (
    <div className={`form-group ${className}`.trim()}>
      <label htmlFor={htmlFor || fieldKey}>{label}</label>
      <div className={`bank-form-datepicker-wrap ${wrapClassName}`.trim()}>
        <input
          id={htmlFor || fieldKey}
          type="text"
          className="bank-input bank-form-datepicker-input"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          placeholder={placeholder}
          value={displayDmy}
          disabled={disabled}
        />
        {displayDmy && !disabled ? (
          <button
            type="button"
            className="bank-form-datepicker-clear"
            title={clearLabel}
            aria-label={clearLabel}
            onClick={handleClear}
          >
            ×
          </button>
        ) : null}
        <input type="hidden" id={fromId} readOnly aria-hidden="true" data-min-ymd={minYmd || ""} />
        <input type="hidden" id={toId} readOnly aria-hidden="true" />
        <div
          className={`date-range-picker bank-form-datepicker-hitbox${disabled ? " bank-form-datepicker-hitbox--disabled" : ""}`}
          id={pickerId}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          data-drp-from={fromId}
          data-drp-to={toId}
          data-drp-display={displayId}
          data-drp-hide-presets="true"
          data-drp-collapse-single="true"
          data-bank-form-date-key={fieldKey}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <span id={displayId} className="bank-form-datepicker-sr-span" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function accountLabel(account) {
  if (!account) return "";
  return formatBankAccountDisplay(account.account_id, account.name, account.id);
}

export function BankSearchableAccountPick({ value, onChange, accounts, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, ACCOUNT_PICK_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - 24;
    const spaceAbove = rect.top - 24;
    const searchHeight = 50;
    const openBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
    const maxOpt = Math.max(160, Math.min(320, (openBelow ? spaceBelow : spaceAbove) - searchHeight - 16));
    setOptionsMaxHeight(maxOpt);
    setMenuStyle({
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      top: openBelow ? `${rect.bottom + 2}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + 2}px`,
      zIndex: getProcessModalDropdownZIndex(wrapRef.current),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const pickableAccounts = useMemo(() => filterBankPickAccounts(accounts), [accounts]);

  const filtered = useMemo(() => {
    const list = pickableAccounts;
    const qq = q.trim().toLowerCase();
    let rows = list;
    if (qq) {
      rows = list.filter((a) => accountLabel(a).toLowerCase().includes(qq));
    }
    return rows.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [pickableAccounts, q]);

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setQ("");
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
    >
      <div className="custom-select-search">
        <input
          ref={searchRef}
          type="text"
          placeholder={t("searchAccount")}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        />
      </div>
      <div className="custom-select-options" style={{ maxHeight: optionsMaxHeight }}>
        <div
          className={`custom-select-option${!value ? " selected" : ""}`}
          role="option"
          aria-selected={!value}
          onClick={() => pick("")}
        >
          {placeholder}
        </div>
        {filtered.length === 0 ? (
          <div className="custom-select-no-results">{t("noAccountsFound")}</div>
        ) : (
          filtered.map((a) => (
            <div
              key={a.id}
              className={`custom-select-option${String(value) === String(a.id) ? " selected" : ""}`}
              role="option"
              aria-selected={String(value) === String(a.id)}
              onClick={() => pick(a.id)}
            >
              {accountLabel(a)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
