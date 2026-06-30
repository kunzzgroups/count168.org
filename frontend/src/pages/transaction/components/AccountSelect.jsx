import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

export function AccountSelect({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  selectedCategories,
  ariaLabelledBy,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    let rows = Array.isArray(options) ? options : [];
    if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
      const set = new Set(selectedCategories.map((c) => String(c).toUpperCase()));
      rows = rows.filter((r) => set.has(String(r.role || "").toUpperCase()));
    }
    return rows;
  }, [options, selectedCategories]);

  const getItemLabel = useCallback((idx) => filtered[idx]?.display_text ?? "", [filtered]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: filtered.length,
    getItemLabel,
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

  const displayText = value?.display_text ? value.display_text : placeholder;

  const pick = (opt) => {
    onChange(opt);
    setOpen(false);
  };

  return (
    <div className="custom-select-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
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
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !open) {
            e.preventDefault();
            onChange?.(null);
            return;
          }
          handleButtonKeyDown(e, {
            isOpen: open,
            onToggleOpen: () => setOpen(true),
            onClose: () => setOpen(false),
            len: filtered.length,
            onSelectIndex: (idx) => {
              const opt = filtered[idx];
              if (opt) pick(opt);
            },
          });
        }}
      >
        {displayText}
      </button>
      <div className={`custom-select-dropdown${open ? " show" : ""}`}>
        <div className="custom-select-options" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.id}
                data-kb-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${
                  highlightClass(idx)
                }`}
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
