import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProgressiveScrollExtent } from "../../shared/useProgressiveScrollExtent.js";
import PaymentVirtualDataRow from "./PaymentVirtualDataRow.jsx";
import { isPaymentMaintenanceRowSelectable } from "../paymentMaintenanceLogic.js";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function PaymentVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblCreatedAt,
    m.tblAccountTo,
    m.tblAccountFrom,
    m.tblAmount,
    m.tblDescription,
    m.tblRemark,
    m.tblSubmitter,
    m.tblDeleter,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row payment-virtual-head-row" role="row">
        {labels.map((label, i) => (
            <div
              key={label}
              role="columnheader"
              className={`maintenance-virtual-th payment-virtual-th--left${i === 4 ? " maintenance-header-amount" : ""}`}
            >
              {label}
            </div>
          ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th payment-virtual-th-checkbox maintenance-select-all-header"
        >
          <input
            type="checkbox"
            id={disableSelectAll ? undefined : "select_all_payment"}
            ref={disableSelectAll ? undefined : selectAllRef}
            className="maintenance-row-checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            title={m.selectAll}
            disabled={disableSelectAll}
          />
        </div>
      </div>
    </div>
  );
}

export default function PaymentVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  selectedSet,
  onToggleRow,
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
      const inner = el.querySelector(".payment-virtual-data-row");
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
      <PaymentVirtualTableHead
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
          const tid = row.transaction_id;
          const canSelect = isPaymentMaintenanceRowSelectable(row);
          const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;

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
              <PaymentVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={canSelect && !isDeleted && selectedSet.has(tid)}
                onToggleRow={onToggleRow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
