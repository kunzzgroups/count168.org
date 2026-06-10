import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useMaintenanceCyclicScrollExtent,
  useMaintenanceCyclicScrollObserver,
} from "../../shared/useMaintenanceCyclicVirtualScroll.js";
import BankprocessVirtualDataRow from "./BankprocessVirtualDataRow.jsx";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}

export default function BankprocessVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  selectedSet,
  onToggleRow,
  alreadyDeletedTitle,
}) {
  const scrollRef = useRef(null);
  const { contentOffsetRef, observeElementOffset } = useMaintenanceCyclicScrollObserver();
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef(rows);

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const tid = row?.transaction_id;
      if (tid != null && rowKeyPrefix) return `${rowKeyPrefix}-${tid}`;
      return tid != null ? tid : index;
    },
    [rows, rowKeyPrefix],
  );

  const measureElement = useCallback(
    (el) => {
      if (!el) return rowHeight;
      const idx = Number(el.dataset?.index);
      const inner = el.querySelector(".bankprocess-virtual-data-row");
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
    observeElementOffset,
  });

  useLayoutEffect(() => {
    contentOffsetRef.current = 0;
    scrollRef.current?.scrollTo(0, 0);
    sizeCacheRef.current.clear();
    rowVirtualizer.measure();
  }, [rows, rowVirtualizer]);

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();
  const { displayTotalH, cyclicRowOffset } = useMaintenanceCyclicScrollExtent({
    scrollRef,
    actualTotalH: totalH,
    rowCount: rows.length,
    rowHeightEstimate: rowHeight,
    resetDeps: [rows],
    contentOffsetRef,
  });

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <div className="maintenance-virtual-spacer" style={{ height: displayTotalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const tid = row.transaction_id;
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
                transform: `translateY(${virtualRow.start - cyclicRowOffset}px)`,
              }}
            >
              <BankprocessVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={!isDeleted && selectedSet.has(tid)}
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

