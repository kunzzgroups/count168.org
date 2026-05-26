import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProgressiveScrollExtent } from "../../shared/useProgressiveScrollExtent.js";
import CaptureVirtualDataRow from "./CaptureVirtualDataRow.jsx";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}

function CaptureVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblDtsCreated,
    m.tblProduct,
    m.tblProcess,
    m.tblCurrency,
    m.tblWlGroup,
    m.tblSubmittedBy,
    m.tblDeletedBy,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row capture-virtual-head-row" role="row">
        {labels.map((label, i) => (
          <div
            key={label}
            role="columnheader"
            className={`maintenance-virtual-th capture-virtual-th--left${i === 0 ? " capture-virtual-th--no" : ""}`}
          >
            {label}
          </div>
        ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th capture-virtual-th-checkbox maintenance-select-all-header"
        >
          <span className="maintenance-checkbox-cell-inner">
            <input
              type="checkbox"
              id={disableSelectAll ? undefined : "select_all_capture"}
              ref={disableSelectAll ? undefined : selectAllRef}
              className="maintenance-row-checkbox"
              checked={selectAll}
              onChange={toggleSelectAll}
              title={m.selectAll}
              disabled={disableSelectAll}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CaptureVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  selectedSet,
  onToggleRow,
  alreadyDeletedTitle,
  selectAllRef,
  selectAll,
  toggleSelectAll,
  m,
  disableSelectAll,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef(rows);

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const cid = row?.capture_id;
      if (cid != null && rowKeyPrefix) return `${rowKeyPrefix}-${cid}`;
      return cid != null ? cid : index;
    },
    [rows, rowKeyPrefix],
  );

  const measureElement = useCallback(
    (el) => {
      if (!el) return rowHeight;
      const idx = Number(el.dataset?.index);
      const inner = el.querySelector(".capture-virtual-data-row");
      const target = inner ?? el;
      const h = Math.max(rowHeight, Math.ceil(target.scrollHeight || target.getBoundingClientRect().height || rowHeight));
      if (Number.isFinite(idx)) {
        sizeCacheRef.current.set(idx, h);
      }
      return h;
    },
    [rowHeight],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeCacheRef.current.get(index) ?? rowHeight,
    overscan: pickOverscan(rows.length),
    getItemKey,
    measureElement,
  });

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    sizeCacheRef.current.clear();
    rowVirtualizer.measure();
  }, [rows, rowVirtualizer]);

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();
  const { displayTotalH } = useProgressiveScrollExtent({
    scrollRef,
    actualTotalH: totalH,
    rowCount: rows.length,
    rowHeightEstimate: rowHeight,
    resetDeps: [rows],
  });

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <CaptureVirtualTableHead
        selectAllRef={selectAllRef}
        selectAll={selectAll}
        toggleSelectAll={toggleSelectAll}
        m={m}
        disableSelectAll={disableSelectAll}
      />
      <div className="maintenance-virtual-spacer" style={{ height: displayTotalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const cid = row.capture_id;
          const isDeleted = isRowDeleted(row);

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
              <CaptureVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={!isDeleted && selectedSet.has(cid)}
                onToggleRow={onToggleRow}
                alreadyDeletedTitle={alreadyDeletedTitle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
