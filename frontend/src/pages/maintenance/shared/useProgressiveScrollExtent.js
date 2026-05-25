import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Only shrink scrollbar progressively when the list is long enough to matter. */
const PROGRESSIVE_MIN_ROWS = 60;
const INITIAL_VIEWPORT_MULTIPLIER = 5;
const GROW_VIEWPORT_MULTIPLIER = 2;
const GROW_AHEAD_VIEWPORT_MULTIPLIER = 1.5;
const GROW_THRESHOLD_VIEWPORT = 0.6;

function getClientHeight(scrollEl) {
  return scrollEl?.clientHeight > 0 ? scrollEl.clientHeight : 400;
}

/**
 * Virtual list spacer height that starts smaller than full content so the
 * scrollbar thumb stays usable, then grows as the user scrolls downward.
 */
export function useProgressiveScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate = 52,
  resetDeps = [],
}) {
  const [extentH, setExtentH] = useState(0);
  const rafRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const enabled = rowCount > PROGRESSIVE_MIN_ROWS && actualTotalH > 0;

  const computeInitialExtent = useCallback(() => {
    if (!enabled) return actualTotalH;
    const el = scrollRef.current;
    const clientH = getClientHeight(el);
    const byViewport = clientH * INITIAL_VIEWPORT_MULTIPLIER;
    const byRows = Math.min(rowCount, 80) * rowHeightEstimate;
    return Math.min(actualTotalH, Math.max(byViewport, byRows, clientH));
  }, [scrollRef, actualTotalH, rowCount, rowHeightEstimate, enabled]);

  useLayoutEffect(() => {
    setExtentH(computeInitialExtent());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetDeps are caller-provided reset triggers
  }, [computeInitialExtent, actualTotalH, rowCount, ...resetDeps]);

  const growExtent = useCallback(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const clientH = getClientHeight(el);

    setExtentH((prev) => {
      if (prev >= actualTotalH) return prev;
      const threshold = Math.max(0, prev - clientH * GROW_THRESHOLD_VIEWPORT);
      if (el.scrollTop < threshold) return prev;
      const target = Math.min(
        actualTotalH,
        Math.max(
          prev + clientH * GROW_VIEWPORT_MULTIPLIER,
          el.scrollTop + clientH * GROW_AHEAD_VIEWPORT_MULTIPLIER,
        ),
      );
      return target > prev ? target : prev;
    });
  }, [scrollRef, actualTotalH, enabled]);

  const revealExtentForScrollTop = useCallback(
    (scrollTop) => {
      if (!enabled) return;
      const el = scrollRef.current;
      const clientH = getClientHeight(el);
      const needed = Math.min(actualTotalH, Math.max(0, scrollTop) + clientH * GROW_AHEAD_VIEWPORT_MULTIPLIER);
      setExtentH((prev) => (needed > prev ? needed : prev));
    },
    [scrollRef, actualTotalH, enabled],
  );

  useEffect(() => {
    if (!enabled || extentH <= 0) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;

    lastScrollTopRef.current = el.scrollTop;

    const onScroll = () => {
      const scrollTop = el.scrollTop;
      // Keep spacer tall enough for thumb/track position (including drag upward).
      revealExtentForScrollTop(scrollTop);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const prevTop = lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;
        // Growing extent while the user scrolls up fights native scrollbar drag.
        if (scrollTop > prevTop + 0.5) {
          growExtent();
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, growExtent, revealExtentForScrollTop, enabled]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return undefined;
    const ro = new ResizeObserver(() => {
      setExtentH((prev) => {
        const initial = computeInitialExtent();
        if (prev <= 0) return initial;
        return Math.min(actualTotalH, Math.max(initial, prev));
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, enabled, computeInitialExtent, actualTotalH]);

  const displayTotalH = enabled
    ? extentH > 0
      ? Math.min(extentH, actualTotalH)
      : computeInitialExtent()
    : actualTotalH;

  return { displayTotalH, revealExtentForScrollTop, isProgressive: enabled };
}
