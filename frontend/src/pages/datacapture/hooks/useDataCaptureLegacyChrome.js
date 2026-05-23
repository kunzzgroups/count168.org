import { useCallback, useLayoutEffect, useState } from "react";

/** Delete row/column dialog — still driven by legacy context menu actions. */
export function useDataCaptureLegacyChrome() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOption, setDeleteOption] = useState("shiftLeft");

  useLayoutEffect(() => {
    window.__DC_OPEN_DELETE_DIALOG__ = () => {
      setDeleteOption("shiftLeft");
      setDeleteOpen(true);
    };
    window.__DC_CLOSE_DELETE_DIALOG__ = () => setDeleteOpen(false);
    return () => {
      try {
        delete window.__DC_OPEN_DELETE_DIALOG__;
        delete window.__DC_CLOSE_DELETE_DIALOG__;
      } catch {
        window.__DC_OPEN_DELETE_DIALOG__ = undefined;
        window.__DC_CLOSE_DELETE_DIALOG__ = undefined;
      }
    };
  }, []);

  const handleConfirmDelete = useCallback(() => {
    window.__DC_DELETE_DIALOG_OPTION__ = deleteOption;
    try {
      if (typeof window.confirmDelete === "function") {
        window.confirmDelete();
      }
    } finally {
      try {
        delete window.__DC_DELETE_DIALOG_OPTION__;
      } catch {
        /* ignore */
      }
    }
  }, [deleteOption]);

  const closeDeleteDialog = useCallback(() => setDeleteOpen(false), []);

  return {
    deleteOpen,
    deleteOption,
    setDeleteOption,
    handleConfirmDelete,
    closeDeleteDialog,
  };
}
