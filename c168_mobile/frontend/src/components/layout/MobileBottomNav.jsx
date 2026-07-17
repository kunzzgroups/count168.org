import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { NavLink, matchPath, useLocation } from "react-router-dom";

/** Instagram-inspired easing — no bounce, 60fps-friendly. */
const NAV_EASE = [0.22, 1, 0.36, 1];
const NAV_DURATION = 0.25;

function isNavItemActive(pathname, item) {
  if (item.to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return Boolean(matchPath({ path: `${item.to}/*`, end: false }, pathname));
}

function NavTab({ item, label }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      className={({ isActive }) =>
        `m-shell-nav-link${isActive ? " m-shell-nav-link--active" : ""}`
      }
    >
      {({ isActive }) => (
        <>
          <motion.span
            className="m-shell-nav-glyph"
            aria-hidden="true"
            animate={{
              scale: isActive ? 1.08 : 1,
              opacity: isActive ? 1 : 0.52,
            }}
            transition={{ duration: NAV_DURATION, ease: NAV_EASE }}
          >
            <i className={`fas ${item.icon}`} />
          </motion.span>
          <motion.span
            className="m-shell-nav-label"
            animate={{ opacity: isActive ? 1 : 0.72 }}
            transition={{ duration: NAV_DURATION, ease: NAV_EASE }}
          >
            {label}
          </motion.span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Liquid-glass floating bottom nav with Framer Motion indicator + icon micro-interactions.
 */
function MobileBottomNav({ items, labels }) {
  const { pathname } = useLocation();
  const rowRef = useRef(null);
  const [slotWidth, setSlotWidth] = useState(0);
  const [motionReady, setMotionReady] = useState(false);

  const activeIdx = Math.max(
    0,
    items.findIndex((item) => isNavItemActive(pathname, item)),
  );
  const count = Math.max(items.length, 1);
  const inset = 8;

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || count === 0) return undefined;

    const measure = () => {
      const w = row.clientWidth;
      if (w > 0) setSlotWidth(w / count);
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(row);
    window.addEventListener("resize", measure);
    const id = requestAnimationFrame(() => setMotionReady(true));

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(id);
    };
  }, [count]);

  const indicatorX = useMemo(
    () => (slotWidth > 0 ? activeIdx * slotWidth + inset / 2 : 0),
    [activeIdx, slotWidth],
  );

  return (
    <div className="m-shell-nav-dock">
      <div ref={rowRef} className="m-shell-nav-pill">
        {motionReady && slotWidth > 0 ? (
          <motion.span
            className="m-shell-nav-indicator"
            aria-hidden="true"
            initial={false}
            style={{ width: Math.max(0, slotWidth - inset) }}
            animate={{ x: indicatorX }}
            transition={{ duration: NAV_DURATION, ease: NAV_EASE }}
          />
        ) : null}

        {items.map((item) => (
          <NavTab key={item.to} item={item} label={labels[item.key] || item.key} />
        ))}
      </div>
    </div>
  );
}

export default memo(MobileBottomNav);
