import React, { useEffect, useRef, useState } from "react";
import OwnAccountSelect from "./OwnAccountSelect.jsx";
import { accountsForRowPicker } from "../ownershipRowHelpers.js";

function applySliderBg(sliderEl, value) {
  if (!sliderEl) return;
  const min = Number(sliderEl.min) || 0;
  const max = Number(sliderEl.max) || 100;
  const pct = ((Number(value) || 0) - min) / (max - min || 1);
  const p = Math.max(0, Math.min(100, pct * 100));
  sliderEl.style.background = `linear-gradient(to right, var(--own-primary-blue) ${p}%, var(--own-gray-border) ${p}%)`;
}

export default function AccountEditorRow({
  companyId,
  idx,
  row,
  accounts,
  onUpdate,
  onRemove,
  onDragStart,
  onDrop,
  onDragEnd,
  dragContextRef,
  enableDrag = true,
  readOnlyMode = false,
  t,
}) {
  const sliderRef = useRef(null);
  const rowRef = useRef(null);
  const [dragEnabled, setDragEnabled] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => applySliderBg(sliderRef.current, row.percentage));
  }, [row.percentage]);

  useEffect(() => {
    if (!dragEnabled) return undefined;
    const up = () => setDragEnabled(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragEnabled]);

  const isPartnership = String(row.role || "").toLowerCase() === "partnership";
  const showRo = isPartnership || row.is_external_partner;

  const clearDragStyles = () => {
    const el = rowRef.current;
    if (!el) return;
    el.style.borderTop = "";
    el.style.borderBottom = "";
    el.style.transform = "";
  };

  return (
    <div
      ref={rowRef}
      className="own-account-row"
      data-index={idx}
      data-group-entry={String(row.account_id || "").startsWith("G_") ? "true" : undefined}
      draggable={!readOnlyMode && enableDrag && dragEnabled}
      onDragStart={(e) => {
        if (!enableDrag || !dragEnabled) {
          e.preventDefault();
          return;
        }
        onDragStart?.(e);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
        window.setTimeout(() => rowRef.current?.classList.add("own-dragging"), 0);
      }}
      onDragOver={(e) => {
        if (!enableDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const d = dragContextRef?.current;
        if (!d || d.companyId !== companyId || d.idx === idx) return;
        const el = rowRef.current;
        if (!el) return;
        const bounding = el.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;
        if (e.clientY > offset) {
          el.style.borderBottom = "2px solid var(--own-primary-blue)";
          el.style.borderTop = "";
          el.style.transform = "translateY(-2px)";
        } else {
          el.style.borderTop = "2px solid var(--own-primary-blue)";
          el.style.borderBottom = "";
          el.style.transform = "translateY(2px)";
        }
      }}
      onDragLeave={() => {
        clearDragStyles();
      }}
      onDrop={(e) => {
        e.preventDefault();
        clearDragStyles();
        onDrop?.(e);
      }}
      onDragEnd={() => {
        rowRef.current?.classList.remove("own-dragging");
        setDragEnabled(false);
        if (enableDrag && dragContextRef?.current?.companyId === companyId) {
          const container = rowRef.current?.parentElement;
          container?.querySelectorAll(".own-account-row").forEach((r) => {
            r.style.borderTop = "";
            r.style.borderBottom = "";
            r.style.transform = "";
          });
        }
        onDragEnd?.();
      }}
    >
      <div
        className="own-drag-handle"
        style={{ display: readOnlyMode ? "none" : "" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!readOnlyMode && enableDrag) setDragEnabled(true);
        }}
        onMouseLeave={() => setDragEnabled(false)}
      >
        ⋮⋮
      </div>
      <OwnAccountSelect
        value={row.account_id}
        accounts={accountsForRowPicker(accounts, row.account_id)}
        displayLabel={row.account_label}
        disabled={readOnlyMode || row.is_external_partner}
        t={t}
        onChange={(id) => onUpdate(idx, "account_id", id)}
      />
      <div className="own-ownership-input-group">
        <input
          type="text"
          className="own-percent-input"
          id={`input-${companyId}-${idx}`}
          key={`pi-${companyId}-${idx}-${row.percentage}`}
          defaultValue={`${row.percentage}%`}
          disabled={readOnlyMode}
          onBlur={(e) => onUpdate(idx, "percent_input", e.target.value)}
        />
        <div className="own-slider-container">
          <input
            ref={sliderRef}
            type="range"
            className="own-slider"
            id={`slider-${companyId}-${idx}`}
            min={0}
            max={100}
            step={1}
            value={row.percentage}
            disabled={readOnlyMode}
            onInput={(e) => onUpdate(idx, "slider", e.target.value)}
          />
          <div className="own-slider-labels">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="own-row-actions">
        <div className="own-read-only-badge" style={{ display: showRo ? "flex" : "none" }}>
            <span className="own-read-only-text">{t("readOnly")}</span>
          <label className="own-ro-toggle">
            <input
              type="checkbox"
              checked={row.read_only === 1}
              disabled={readOnlyMode || !showRo}
              onChange={(e) => onUpdate(idx, "read_only", e.target.checked ? 1 : 0)}
            />
            <span className="own-ro-slider" />
          </label>
        </div>
        <button type="button" className="own-btn-square own-btn-delete" title={t("remove")} disabled={readOnlyMode} onClick={() => onRemove(idx)}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
