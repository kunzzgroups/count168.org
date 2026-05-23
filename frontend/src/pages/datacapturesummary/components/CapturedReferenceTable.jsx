import { useEffect } from "react";
import { bindCapturedCellClick } from "../table/summaryTablePostPopulate.js";

/**
 * Hidden reference table — used when building formulas (cell click → insert into formula).
 */
export default function CapturedReferenceTable({ tableData }) {
  useEffect(() => {
    if (!tableData?.rows?.length) return;
    const t = window.setTimeout(() => {
      window.makeTableCellsClickable?.();
    }, 100);
    return () => window.clearTimeout(t);
  }, [tableData]);

  if (!tableData?.headers?.length) return null;

  return (
    <div
      className="summary-table-container captured-table-container"
      style={{ display: "none" }}
      aria-hidden="true"
    >
      <div className="table-header">
        <span>Data Capture Table</span>
      </div>
      <div className="table-wrapper">
        <table className="summary-table" id="capturedDataTable">
          <thead id="capturedTableHeader">
            <tr>
              {tableData.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody id="capturedTableBody">
            {tableData.rows.map((rowData, rowIndex) => {
              let rowLabel = "";
              if (rowData.length > 0 && rowData[0]?.type === "header") {
                rowLabel = String(rowData[0].value || "").trim();
              }
              const idProduct =
                rowData[1]?.type === "data" ? String(rowData[1].value || "").trim() : "";

              return (
                <tr key={`cap-row-${rowIndex}`} data-id-product={idProduct || undefined}>
                  {rowData.map((cellData, colIndex) => {
                    if (cellData.type === "header") {
                      return (
                        <td
                          key={`cap-${rowIndex}-${colIndex}`}
                          className="row-header"
                          style={{
                            backgroundColor: "#f6f8fa",
                            fontWeight: "bold",
                            color: "#24292f",
                            minWidth: "30px",
                          }}
                        >
                          {cellData.value}
                        </td>
                      );
                    }

                    const columnIndex = colIndex;
                    const cellPosition = rowLabel ? `${rowLabel}${columnIndex}` : undefined;

                    return (
                      <td
                        key={`cap-${rowIndex}-${colIndex}`}
                        className="clickable-table-cell"
                        style={{ textAlign: "center", minWidth: "40px", cursor: "pointer" }}
                        data-column-index={columnIndex}
                        data-row-label={rowLabel || undefined}
                        data-cell-position={cellPosition}
                        data-id-product={idProduct || undefined}
                        title={colIndex === 1 && idProduct ? idProduct : undefined}
                        ref={(el) => {
                          if (el) bindCapturedCellClick(el);
                        }}
                      >
                        {cellData.value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
