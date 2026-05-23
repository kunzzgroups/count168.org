import { Link } from "react-router-dom";
import CapturedReferenceTable from "./CapturedReferenceTable.jsx";
import SummaryTableRow from "./SummaryTableRow.jsx";

export default function SummaryTable({ t, tableData, rows = [], visible = false }) {
  if (!visible || !tableData) return null;

  return (
    <>
      <div className="table-wrapper">
        <table className="summary-table" id="summaryTable">
          <thead>
            <tr>
              <th className="id-product-header">{t("idProduct")}</th>
              <th>{t("account")}</th>
              <th />
              <th>{t("currencyColumn")}</th>
              <th>{t("formula")}</th>
              <th>{t("source")}</th>
              <th>{t("rate")}</th>
              <th>{t("rateValue")}</th>
              <th>{t("processedAmount")}</th>
              <th>{t("skip")}</th>
              <th>{t("delete")}</th>
            </tr>
          </thead>
          <tbody id="summaryTableBody">
            {rows.map((row) => (
              <SummaryTableRow
                key={row.key}
                rowKey={row.key}
                idProduct={row.idProduct}
                rowIndex={row.rowIndex}
                productType={row.productType}
                parentIdProduct={row.parentIdProduct}
                parentRowIndex={row.parentRowIndex}
              />
            ))}
          </tbody>
          <tfoot>
            <tr id="summaryTotalRow">
              <td colSpan={8} className="summary-total-label" />
              <td id="summaryTotalAmount">0.00</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <CapturedReferenceTable tableData={tableData} />
    </>
  );
}

export function SummaryEmptyState({ t }) {
  return (
    <div className="summary-table-container empty-state-container">
      <div className="table-header">
        <span>{t("noCapturedData")}</span>
      </div>
      <div className="empty-state">
        <p>{t("emptyStateHint")}</p>
        <Link to="/datacapture" className="btn btn-save">
          {t("goToDataCapture")}
        </Link>
      </div>
    </div>
  );
}
