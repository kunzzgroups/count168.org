import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypeAheadKey } from "../../../components/typeAheadMatch.js";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

export function AccountSelect({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  ariaLabelledBy,
  ariaLabel,
  searchPlaceholder = "Search account...",
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const searchRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const rows = Array.isArray(options) ? options : [];
    if (!q) return rows;
    return rows.filter((r) => String(r.display_text || "").toUpperCase().includes(q));
  }, [options, filter]);

  const { setHighlightIdx, listRef, handleListKeyDown, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: filtered.length,
    resetToken: filter,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setFilter("");
    }
  }, [open]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  const pick = (opt) => {
    onChange(opt);
    setOpen(false);
  };

  const openMenu = useCallback((seed = "") => {
    if (disabled) return;
    setFilter(seed);
    setOpen(true);
  }, [disabled]);

  const selectByIndex = (idx) => {
    const opt = filtered[idx];
    if (opt) pick(opt);
  };

  const onButtonKeyDown = (e) => {
    if (disabled) return;
    if (!open && isTypeAheadKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openMenu(e.key);
      return;
    }
    handleButtonKeyDown(e, {
      isOpen: open,
      onToggleOpen: () => openMenu(""),
      onClose: () => setOpen(false),
      len: filtered.length,
      onSelectIndex: selectByIndex,
    });
  };

  return (
    <div className="custom-select-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || undefined}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy || undefined}
        data-placeholder={placeholder}
        data-value={value?.id ?? ""}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
        data-currency={value?.currency != null && String(value.currency).trim() !== "" ? String(value.currency).trim().toUpperCase() : ""}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            return;
          }
          openMenu("");
        }}
        onKeyDown={onButtonKeyDown}
      >
        {displayText}
      </button>
      <div className={`custom-select-dropdown${open ? " show" : ""}`}>
        <div className="custom-select-search">
          <input
            ref={searchRef}
            type="text"
            placeholder={searchPlaceholder}
            autoComplete="off"
            disabled={disabled}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ textTransform: "uppercase" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "Backspace" && !filter) {
                e.preventDefault();
                onChange?.(null);
                return;
              }
              handleListKeyDown(e, {
                len: filtered.length,
                onSelectIndex: selectByIndex,
                onClose: () => setOpen(false),
              });
            }}
          />
        </div>
        <div className="custom-select-options" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.id}
                data-kb-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${highlightClass(idx)}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => pick(opt)}
              >
                {opt.display_text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountSelect;
