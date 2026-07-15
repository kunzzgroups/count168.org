import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 68;
const MAX_PULL = 112;
const ARM_RATIO = 0.9;
const AXIS_LOCK_PX = 8;

function damp(delta) {
  if (delta <= 0) return 0;
  const eased = THRESHOLD * (1 - Math.exp(-delta / (THRESHOLD * 1.15)));
  return Math.min(MAX_PULL, eased);
}

/**
 * Touch pull-to-refresh for a vertical scroll container (scrollTop≈0 to arm).
 * Ignores horizontal swipes (KPI carousels) and settles with parent `refreshing`.
 */
export function usePullToRefresh(scrollRef, { onRefresh, enabled = true, refreshing = false } = {}) {
  const [pullPx, setPullPx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | pulling | armed | refreshing
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const axisLocked = useRef(null); // null | "v" | "h"
  const locked = useRef(false);
  const sawRefreshing = useRef(false);
  const pullPxRef = useRef(0);
  const rafRef = useRef(0);
  const fallbackTimer = useRef(0);
  const minHoldTimer = useRef(0);
  const refreshStartedAt = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  const setPull = useCallback((px) => {
    pullPxRef.current = px;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setPullPx(px));
  }, []);

  const settleIdle = useCallback(() => {
    locked.current = false;
    tracking.current = false;
    axisLocked.current = null;
    sawRefreshing.current = false;
    setPull(0);
    setPhase("idle");
  }, [setPull]);

  useEffect(() => {
    if (refreshing) {
      sawRefreshing.current = true;
      locked.current = true;
      refreshStartedAt.current = Date.now();
      window.clearTimeout(fallbackTimer.current);
      window.clearTimeout(minHoldTimer.current);
      setPhase("refreshing");
      setPull(Math.max(pullPxRef.current, 48));
      return;
    }
    if (!sawRefreshing.current) return;
    const held = Date.now() - (refreshStartedAt.current || Date.now());
    const wait = Math.max(0, 420 - held);
    window.clearTimeout(minHoldTimer.current);
    minHoldTimer.current = window.setTimeout(() => settleIdle(), wait);
  }, [refreshing, setPull, settleIdle]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !enabled) return undefined;

    const onTouchStart = (e) => {
      if (locked.current || refreshingRef.current) return;
      if (el.scrollTop > 1) return;
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      startX.current = t.clientX;
      tracking.current = true;
      axisLocked.current = null;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || locked.current || refreshingRef.current) return;

      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      const dx = t.clientX - startX.current;

      if (!axisLocked.current) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (axisLocked.current === "h") {
          tracking.current = false;
          setPull(0);
          setPhase("idle");
          return;
        }
      }
      if (axisLocked.current === "h") return;

      if (el.scrollTop > 1) {
        tracking.current = false;
        setPull(0);
        setPhase("idle");
        return;
      }

      if (dy <= 0) {
        setPull(0);
        setPhase("idle");
        return;
      }

      const damped = damp(dy);
      setPull(damped);
      setPhase(damped >= THRESHOLD * ARM_RATIO ? "armed" : "pulling");
      if (damped > 2) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking.current) {
        axisLocked.current = null;
        return;
      }
      tracking.current = false;
      const wasVertical = axisLocked.current === "v";
      axisLocked.current = null;

      const shouldRefresh =
        wasVertical &&
        pullPxRef.current >= THRESHOLD * ARM_RATIO &&
        !refreshingRef.current &&
        typeof onRefreshRef.current === "function";

      if (!shouldRefresh) {
        setPull(0);
        setPhase("idle");
        return;
      }

      locked.current = true;
      setPhase("refreshing");
      setPull(48);
      Promise.resolve(onRefreshRef.current()).catch(() => {});
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = window.setTimeout(() => {
        if (!sawRefreshing.current && locked.current) settleIdle();
      }, 1600);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(fallbackTimer.current);
      window.clearTimeout(minHoldTimer.current);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef, enabled, setPull, settleIdle]);

  return {
    pullPx,
    progress: Math.min(1.15, pullPx / THRESHOLD),
    phase,
    active: phase !== "idle" || pullPx > 0.5,
  };
}
