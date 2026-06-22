import { useCallback, useLayoutEffect, useRef, useState } from "react";
import PortalTooltip from "../../../components/PortalTooltip.jsx";
import { formatBankWithTypeDisplay } from "../lib/bankProcessHelpers.js";
import MaintenanceEllipsisText from "../../maintenance/shared/MaintenanceEllipsisText.jsx";

/** Bank column: plain text or name/(type) layout with portal tooltip when truncated. */
export default function BankProcessTypedBankCell({ bank, type }) {
  const display = formatBankWithTypeDisplay(bank, type);
  const bankName = String(bank ?? "").trim();
  const bankType = String(type ?? "").trim();

  const nameRef = useRef(null);
  const typeRef = useRef(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const nameEl = nameRef.current;
    const typeEl = typeRef.current;
    const nameTrunc = nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : false;
    const typeTrunc = typeEl ? typeEl.scrollWidth > typeEl.clientWidth + 1 : false;
    setTruncated(nameTrunc || typeTrunc);
  }, []);

  useLayoutEffect(() => {
    if (!bankType) return undefined;
    measure();
    const observers = [];
    [nameRef, typeRef].forEach((ref) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [display, bankType, measure]);

  if (display === "-") return "-";
  if (!bankType) {
    return <MaintenanceEllipsisText value={display} className="bank-process-cell-text" />;
  }

  return (
    <PortalTooltip
      content={display}
      enabled={truncated && display !== "-"}
      placement="below"
      tooltipClassName="app-portal-tooltip--multiline"
    >
      <span className="bank-cell-display bank-cell-display--typed">
        <span ref={nameRef} className="bank-cell-display__name">
          {bankName}
        </span>
        <span ref={typeRef} className="bank-cell-display__type">
          ({bankType})
        </span>
      </span>
    </PortalTooltip>
  );
}
