import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formulaRowIdsMatch } from "../formulaMaintenanceLogic.js";
import FormulaVirtualDataRow from "./FormulaVirtualDataRow.jsx";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function FormulaVirtualTableHead({ selectAllRef, selectAllChecked, onToggleSelectAll, m }) {
  const headerLabels = [
    m.tblNo,
    m.tblProcess,
    m.tblAccount,
    m.tblCurrency,
    m.tblSource,
    m.tblProduct,
    m.tblInputMethod,
    m.tblFormula,
    m.tblDescription,
  ];

  const selectAllCheckbox = (
    <input
      type="checkbox"
      ref={selectAllRef}
      className="maintenance-row-checkbox"
      checked={selectAllChecked}
      onChange={onToggleSelectAll}
      title={m.selectAll}
    />
  );

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row formula-virtual-head-row" role="row">
        {headerLabels.map((label, i) => {
          return (
            <div key={label} role="columnheader" className="maintenance-virtual-th formula-virtual-th--left">
              {label}
            </div>
          );
        })}
        <div role="columnheader" className="maintenance-virtual-th formula-virtual-th-actions">
          <div className="maintenance-formula-actions-inner">
            <span className="maintenance-action-edit-placeholder" aria-hidden="true" />
            {selectAllCheckbox}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FormulaVirtualRows({
  rows,
  rowHeight,
  editRowHeight,
  editingId,
  editForm,
  onEditFormChange,
  onSave,
  onCancel,
  accounts,
  inputMethodOptions,
  isRowSelected,
  onToggleSelect,
  onEdit,
  m,
  onScrollingChange,
  scrollRestoreRowId = null,
  onScrollRestoreComplete,
  listHydrating = false,
  selectAllRef,
  selectAllChecked,
  onToggleSelectAll,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef(rows);
  const prevRowsRef = useRef(rows);
  const prevEditingIdRef = useRef(null);
  const scrollAnchorIdRef = useRef(null);

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback((index) => {
    const row = rows[index];
    return row?.id != null ? row.id : index;
  }, [rows]);

  const measureElement = useCallback(
    (el) => {
      if (!el) return rowHeight;
      const idx = Number(el.dataset?.index);
      const row = Number.isFinite(idx) ? rows[idx] : null;
      const minH = row?.id != null && formulaRowIdsMatch(row.id, editingId) ? editRowHeight : rowHeight;
      const inner = el.querySelector(".formula-virtual-data-row");
      const target = inner ?? el;
      const h = Math.max(minH, Math.ceil(target.scrollHeight || target.getBoundingClientRect().height || minH));
      if (Number.isFinite(idx)) {
        sizeCacheRef.current.set(idx, h);
      }
      return h;
    },
    [rows, rowHeight, editRowHeight, editingId],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.id != null && formulaRowIdsMatch(row.id, editingId)) return editRowHeight;
      return sizeCacheRef.current.get(index) ?? rowHeight;
    },
    overscan: pickOverscan(rows.length),
    getItemKey,
    measureElement,
  });

  const hasScrollRestorePending = useCallback(() => {
    return scrollAnchorIdRef.current != null || scrollRestoreRowId != null || listHydrating;
  }, [scrollRestoreRowId, listHydrating]);

  const clearScrollAnchor = useCallback(() => {
    scrollAnchorIdRef.current = null;
    onScrollRestoreComplete?.();
  }, [onScrollRestoreComplete]);

  const scrollToRowId = useCallback(
    (rowId, align = "center") => {
      if (rowId == null) return false;
      const idx = rows.findIndex((r) => formulaRowIdsMatch(r.id, rowId));
      if (idx < 0) return false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          rowVirtualizer.scrollToIndex(idx, { align });
          rowVirtualizer.measure();
        });
      });
      return true;
    },
    [rows, rowVirtualizer],
  );

  const tryRestoreScrollAnchor = useCallback(
    (align = "center") => {
      const anchorId = scrollAnchorIdRef.current ?? scrollRestoreRowId;
      if (anchorId == null) return false;
      const ok = scrollToRowId(anchorId, align);
      if (ok && editingId == null && !listHydrating) {
        clearScrollAnchor();
      }
      return ok;
    },
    [scrollToRowId, editingId, listHydrating, clearScrollAnchor, scrollRestoreRowId],
  );

  useEffect(() => {
    if (editingId != null) {
      scrollAnchorIdRef.current = editingId;
    }
  }, [editingId]);

  useEffect(() => {
    if (scrollRestoreRowId != null) {
      scrollAnchorIdRef.current = scrollRestoreRowId;
    }
  }, [scrollRestoreRowId]);

  useLayoutEffect(() => {
    const prevEditing = prevEditingIdRef.current;
    prevEditingIdRef.current = editingId;
    const rowsChanged = prevRowsRef.current !== rows;
    prevRowsRef.current = rows;

    sizeCacheRef.current.clear();
    rowVirtualizer.measure();

    if (rowsChanged) {
      if (tryRestoreScrollAnchor("center")) {
        return;
      }
      if (hasScrollRestorePending()) {
        return;
      }
      scrollRef.current?.scrollTo(0, 0);
      return;
    }

    if (prevEditing != null && editingId == null) {
      if (!tryRestoreScrollAnchor("center")) {
        scrollAnchorIdRef.current = prevEditing;
      }
    }
  }, [rows, editingId, rowVirtualizer, tryRestoreScrollAnchor, hasScrollRestorePending]);

  useEffect(() => {
    if (!hasScrollRestorePending() || editingId != null) return;
    tryRestoreScrollAnchor("center");
  }, [rows.length, editingId, listHydrating, hasScrollRestorePending, tryRestoreScrollAnchor]);

  useEffect(() => {
    if (editingId == null) return;
    scrollToRowId(editingId, "center");
  }, [editingId, scrollToRowId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrollingChange) return undefined;

    let endTimer;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      if (Math.abs(el.scrollTop - lastTop) > 1) {
        onScrollingChange(true);
        lastTop = el.scrollTop;
      }
      clearTimeout(endTimer);
      endTimer = setTimeout(() => onScrollingChange(false), 120);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(endTimer);
    };
  }, [onScrollingChange]);

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <FormulaVirtualTableHead
        selectAllRef={selectAllRef}
        selectAllChecked={selectAllChecked}
        onToggleSelectAll={onToggleSelectAll}
        m={m}
      />
      <div className="maintenance-virtual-spacer" style={{ height: totalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const isEditing = formulaRowIdsMatch(row.id, editingId);

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="maintenance-virtual-row-wrap"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                minHeight: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FormulaVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={isRowSelected(row.id)}
                isEditing={isEditing}
                editForm={editForm}
                onEditFormChange={onEditFormChange}
                onSave={onSave}
                onCancel={onCancel}
                accounts={accounts}
                inputMethodOptions={inputMethodOptions}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                m={m}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

