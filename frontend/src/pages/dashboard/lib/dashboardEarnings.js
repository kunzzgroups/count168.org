import {
  DASHBOARD_CURRENCY_COLORS,
  DASHBOARD_CURRENCY_FALLBACK_PALETTE,
} from "./dashboardConstants.js";

export function getCurrencyColor(code, fallbackIndex = 0) {
  const key = String(code || "").toUpperCase();
  if (DASHBOARD_CURRENCY_COLORS[key]) return DASHBOARD_CURRENCY_COLORS[key];
  return DASHBOARD_CURRENCY_FALLBACK_PALETTE[fallbackIndex % DASHBOARD_CURRENCY_FALLBACK_PALETTE.length];
}

export function buildEarningsPieSlices(rows, { useConverted = false } = {}) {
  return rows
    .filter((row) => row.earnings != null)
    .map((row, index) => {
      const originalEarnings = row.earnings;
      const earnings =
        useConverted && row.earningsConverted != null ? row.earningsConverted : row.earnings;
      return {
        code: row.code,
        earnings,
        originalEarnings,
        earningsConverted: row.earningsConverted,
        value: Math.abs(earnings),
        fill: getCurrencyColor(row.code, index),
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

const PIE_RADIAN = Math.PI / 180;

/** Same polar→cartesian mapping as Recharts (startAngle=0, clockwise). */
export function polarToCartesian(cx, cy, radius, angleDeg) {
  return {
    x: cx + Math.cos(-PIE_RADIAN * angleDeg) * radius,
    y: cy + Math.sin(-PIE_RADIAN * angleDeg) * radius,
  };
}

/** Place tooltip outside the donut ring; keep clear of center badge and shell edges. */
export function computeSectorTooltipPosition(sector, shellWidth, shellHeight) {
  const cx = sector?.cx;
  const cy = sector?.cy;
  const outerRadius = sector?.outerRadius;
  const innerRadius = sector?.innerRadius;
  const midAngle = sector?.midAngle;
  if (cx == null || cy == null || outerRadius == null || midAngle == null) {
    return null;
  }
  if (shellWidth <= 0 || shellHeight <= 0) {
    return null;
  }

  const innerR = innerRadius ?? outerRadius * 0.58;
  const estW = 108;
  const estH = 82;
  const pad = 6;
  const halfDiag = Math.hypot(estW, estH) / 2;
  const minRadialFromCenter = innerR + halfDiag + 14;

  let radial = outerRadius + 42;
  let left = cx;
  let top = cy;

  for (let i = 0; i < 14; i += 1) {
    const pt = polarToCartesian(cx, cy, radial, midAngle);
    left = pt.x;
    top = pt.y;
    const dist = Math.hypot(left - cx, top - cy);
    const fitsX = left - estW / 2 >= pad && left + estW / 2 <= shellWidth - pad;
    const fitsY = top - estH / 2 >= pad && top + estH / 2 <= shellHeight - pad;
    const clearsCenter = dist >= minRadialFromCenter;
    if (fitsX && fitsY && clearsCenter) break;
    radial += 12;
  }

  left = Math.max(estW / 2 + pad, Math.min(shellWidth - estW / 2 - pad, left));
  top = Math.max(estH / 2 + pad, Math.min(shellHeight - estH / 2 - pad, top));

  return { left, top, placeAbove: top <= cy, radial: true };
}

export function computePieCenterMetrics(slices, selectedCode) {
  const total = (slices || []).reduce((sum, row) => sum + (row.value || 0), 0);
  const selected = String(selectedCode || "").toUpperCase();
  if (total <= 0) {
    return { pct: "0", code: selected || "—" };
  }
  const match = (slices || []).find((row) => String(row.code || "").toUpperCase() === selected);
  const pct = match ? ((match.value / total) * 100).toFixed(0) : "0";
  return { pct, code: selected || match?.code || "—" };
}

export function computeCurrencySharePct(row, total, useConverted) {
  const val =
    useConverted && row.earningsConverted != null
      ? Math.abs(row.earningsConverted)
      : Math.abs(parseFloat(row.earnings) || 0);
  if (!total || total <= 0) return 0;
  return (val / total) * 100;
}

export function companiesInGroupList(companies, gid) {
  if (!gid) {
    return companies.filter(
      (c) => c.company_id && String(c.company_id).trim() !== "" && (!c.group_id || String(c.group_id).trim() === "")
    );
  }
  return companies.filter(
    (c) =>
      c.company_id &&
      String(c.company_id).trim() !== "" &&
      c.group_id &&
      String(c.group_id).toUpperCase() === String(gid).toUpperCase()
  );
}

export function sortIds(ids) {
  return [...ids].sort((a, b) => a - b);
}
