import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { layoutPortalCustomSelect } from "./customSelectPortalLayout.js";

const MODAL_SELECTOR =
  ".modal, [role='dialog'], .account-modal, #userModal, #account-addModal, #account-editModal, .domain-form-modal-backdrop";

/**
 * Lightweight custom dropdown — same look as Bank Process「Type」select.
 * Uses portal inside modals so lists are not clipped.
 */
export default function SimpleSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = "",
  disabled = false,
  required = false,
  includeEmptyOption = true,
  className = "",
  wrapperClassName = "",
  portalDropdownClassName = "",
  ariaLabelledBy,
  ariaLabel,
  dropdownCap = 260,
  minWidth = 180,
  forcePortal = false,
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuPlacement, setMenuPlacement] = useState("below");
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(240);
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
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight, openBelow } = layoutPortalCustomSelect(
      btn,
      wrapRef.current,
      { minWidth, dropdownCap },
    );
    setMenuPlacement(openBelow ? "below" : "above");
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, [minWidth, dropdownCap]);

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
    // Defer so the opening click does not immediately close the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", fn);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", fn);
    };
  }, [open, close]);

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const showPlaceholderTone = !selected && placeholder;

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest(MODAL_SELECTOR);
    const shouldPortal = forcePortal || inModal;
    setUsePortal(shouldPortal);
    if (!shouldPortal) setMenuPlacement("below");
    setOpen(true);
    if (shouldPortal) positionMenu();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close();
  };

  const placementClass =
    menuPlacement === "above" ? " custom-select-dropdown-above" : " custom-select-dropdown-below";

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${placementClass}${usePortal ? " custom-select-dropdown-portal" : ""}${portalDropdownClassName ? ` ${portalDropdownClassName}` : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
      id={id ? `${id}_dropdown` : undefined}
    >
      <div
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight } : { maxHeight: optionsMaxHeight }}
      >
        {includeEmptyOption ? (
          <div
            className={`custom-select-option${!value ? " selected" : ""}`}
            role="option"
            aria-selected={!value}
            tabIndex={0}
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
            tabIndex={opt.disabled ? -1 : 0}
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
    <div
      className={`custom-select-wrapper simple-select${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
      ref={wrapRef}
    >
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`custom-select-button${open ? " open" : ""}${open ? (menuPlacement === "above" ? " open-above" : " open-below") : ""}${showPlaceholderTone ? " simple-select-button--placeholder" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required || undefined}
        aria-labelledby={ariaLabelledBy || undefined}
        aria-label={!ariaLabelledBy && ariaLabel ? ariaLabel : undefined}
        onClick={() => (open ? close() : openDropdown())}
      >
        {displayLabel}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
