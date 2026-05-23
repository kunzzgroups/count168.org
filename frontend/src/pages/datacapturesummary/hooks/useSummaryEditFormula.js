import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applySummaryDomLabels } from "../lib/summaryDomI18n.js";

const EMPTY_FORM = {
  productValue: "",
  isSubIdProduct: false,
  prePopulatedData: null,
};

/**
 * Phase 8–9c: React owns Edit Formula modal visibility + form shell.
 * React saveFormula (Phase 9c) handles Save; legacy initEditFormulaFormAfterMount handles form init.
 */
export function useSummaryEditFormula({ scriptsReady, t }) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [formSession, setFormSession] = useState(EMPTY_FORM);
  const prePopulatedRef = useRef(null);
  const initGenerationRef = useRef(0);

  const closeEditFormula = useCallback(() => {
    setOpen(false);
    setFormSession(EMPTY_FORM);
    prePopulatedRef.current = null;
    document.body.style.overflow = "";
  }, []);

  const showEditFormula = useCallback(({ productValue, isSubIdProduct, prePopulatedData }) => {
    prePopulatedRef.current = prePopulatedData ?? null;
    setSessionKey((key) => key + 1);
    setFormSession({
      productValue: productValue || "",
      isSubIdProduct: !!isSubIdProduct,
      prePopulatedData: prePopulatedData ?? null,
    });
    setOpen(true);
    document.body.style.overflow = "hidden";
  }, []);

  useLayoutEffect(() => {
    if (!open || !scriptsReady) return undefined;

    const generation = initGenerationRef.current + 1;
    initGenerationRef.current = generation;

    const runInit = () => {
      if (initGenerationRef.current !== generation) return;

      const saveBtn = document.getElementById("editFormulaSaveBtn");
      if (saveBtn) {
        saveBtn.onclick = () => {
          window.saveFormula?.();
        };
      }

      if (typeof window.initEditFormulaFormAfterMount !== "function") return;
      window.initEditFormulaFormAfterMount(prePopulatedRef.current);
      if (typeof t === "function") {
        window.setTimeout(() => applySummaryDomLabels(t), 200);
      }
    };

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(runInit);
    });

    return () => {
      cancelAnimationFrame(id);
    };
  }, [open, scriptsReady, formSession.productValue, t]);

  useEffect(() => {
    if (!scriptsReady) return undefined;

    window.__SUMMARY_REACT_SHOW_EDIT_FORMULA__ = showEditFormula;
    window.__SUMMARY_REACT_CLOSE_EDIT_FORMULA__ = closeEditFormula;

    return () => {
      delete window.__SUMMARY_REACT_SHOW_EDIT_FORMULA__;
      delete window.__SUMMARY_REACT_CLOSE_EDIT_FORMULA__;
    };
  }, [scriptsReady, showEditFormula, closeEditFormula]);

  return {
    open,
    sessionKey,
    productValue: formSession.productValue,
    closeEditFormula,
  };
}
