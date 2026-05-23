import { useLayoutEffect, useRef } from "react";

/** Match submitted panel height to the form column; list scrolls inside via CSS. */
export function useDataCaptureSubmittedPanelHeight() {
  const topSectionRef = useRef(null);
  const formColumnRef = useRef(null);

  useLayoutEffect(() => {
    const top = topSectionRef.current;
    const formCol = formColumnRef.current;
    if (!top || !formCol) return;

    const formCard = () => formCol.querySelector(".form-container");

    const apply = () => {
      const el = formCard() || formCol;
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) {
        top.style.setProperty("--dc-form-band-height", `${h}px`);
      } else {
        top.style.removeProperty("--dc-form-band-height");
      }
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(formCol);
    const card = formCard();
    if (card) ro.observe(card);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      top.style.removeProperty("--dc-form-band-height");
    };
  }, []);

  return { topSectionRef, formColumnRef };
}
