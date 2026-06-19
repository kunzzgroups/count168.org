import { useCallback, useLayoutEffect, useRef, useState } from "react";
import PortalTooltip from "../../../components/PortalTooltip.jsx";

/**
 * Single-line ellipsis with portal tooltip for truncated maintenance table text.
 * @param {{ value?: string | null, className?: string }} props
 */
export default function MaintenanceEllipsisText({ value, className = "payment-cell-text" }) {
  const textRef = useRef(null);
  const [truncated, setTruncated] = useState(false);
  const display = value == null || String(value).trim() === "" ? "-" : String(value);

  const measure = useCallback(() => {
    const el = textRef.current;
    setTruncated(el ? el.scrollWidth > el.clientWidth + 1 : false);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [display, measure]);

  return (
    <PortalTooltip
      content={display}
      enabled={truncated && display !== "-"}
      placement="below"
      tooltipClassName="app-portal-tooltip--multiline"
    >
      <span ref={textRef} className={className}>
        {display}
      </span>
    </PortalTooltip>
  );
}
