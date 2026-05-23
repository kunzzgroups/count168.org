import { memo } from "react";

function DataCaptureContextMenus({ t }) {
  return (
    <>
      <div id="contextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.copySelectedCells?.(); }}>
          <span>📋 {t("copy")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.pasteToSelectedCells?.(); }}>
          <span>📄 {t("paste")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.clearSelectedCells?.(); }}>
          <span>🗑️ {t("clear")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.showDeleteDialog?.(e); }}>
          <span>🗑️ {t("delete")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => window.selectAllCells?.(e)}>
          <span>☑️ {t("selectAll")}</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnLeft?.()}>
          <span>➕ {t("insertColumnLeft")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnRight?.()}>
          <span>➕ {t("insertColumnRight")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteColumn?.()}>
          <span>🗑️ {t("deleteColumn")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearColumn?.()}>
          <span>❌ {t("clearColumn")}</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowAbove?.()}>
          <span>➕ {t("insertRowAbove")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowBelow?.()}>
          <span>➕ {t("insertRowBelow")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteRow?.()}>
          <span>🗑️ {t("deleteRow")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearRow?.()}>
          <span>❌ {t("clearRow")}</span>
        </div>
      </div>
    </>
  );
}

export default memo(DataCaptureContextMenus, (prev, next) => prev.t === next.t);
