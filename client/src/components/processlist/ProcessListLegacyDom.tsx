import type { ReactNode } from 'react'
import gamesModalsHtml from './ProcessListGamesModals.html?raw'
import bankModalsHtml from './ProcessListBankModals.html?raw'

type Props = {
  pageTitle: string
  initialSearch: string
  initialShowInactive: boolean
  initialShowAll: boolean
  initialShowOfficial: boolean
  initialShowEInvoice: boolean
  initialShowBlock: boolean
  belowToolbar?: ReactNode
}

/**
 * 与 `processlist_classic.php` 主区 DOM + 模态一致；Bank 大块自 `ProcessListBankModals.html`，Games 编辑/描述等自 `ProcessListGamesModals.html`。
 */
export function ProcessListLegacyDom({
  pageTitle,
  initialSearch,
  initialShowInactive,
  initialShowAll,
  initialShowOfficial,
  initialShowEInvoice,
  initialShowBlock,
  belowToolbar,
}: Props) {
  const showInactiveChecked = !initialShowAll && initialShowInactive
  const showOfficialChecked = !initialShowAll && initialShowOfficial
  const showEInvoiceChecked = !initialShowAll && initialShowEInvoice
  const showBlockChecked = !initialShowAll && initialShowBlock

  return (
    <>
      <div className="container">
        <div className="content">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 0,
              marginTop: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h1 className="page-title" style={{ margin: 0 }}>
                {pageTitle}
              </h1>
              <div className="process-accounting-inbox-wrap" id="processAccountingInboxWrap" style={{ display: 'none' }}>
                <button
                  type="button"
                  className="process-accounting-inbox-btn process-accounting-inbox-main"
                  id="processAccountingInboxBtn"
                >
                  <svg className="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  Accounting Due
                  <span className="process-accounting-inbox-badge" id="processAccountingInboxCount">
                    0
                  </span>
                </button>
              </div>
            </div>
            <div
              id="process-list-permission-filter"
              className="process-company-filter process-permission-filter-header"
              style={{ display: 'none' }}
            >
              <span className="process-company-label">Category:</span>
              <div id="process-list-permission-buttons" className="process-company-buttons" />
            </div>
          </div>

          <div className="separator-line" />

          <div className="action-buttons-container">
            <div className="action-buttons">
              <div
                className="action-controls-row"
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
              >
                <button type="button" className="btn btn-add" onClick={() => (window as unknown as { addProcess?: () => void }).addProcess?.()}>
                  Add Process
                </button>
                <div className="process-list-date-filter" id="processListDateFilter" style={{ display: 'none' }}>
                  <div className="date-range-picker" id="date-range-picker">
                    <i className="fas fa-calendar-alt" />
                    <span id="date-range-display">Select date range</span>
                    <button
                      type="button"
                      className="process-list-date-clear"
                      id="processListDateClearBtn"
                      title="Clear date range"
                      aria-label="Clear date range"
                      style={{ display: 'none' }}
                    >
                      &times;
                    </button>
                  </div>
                  <input type="hidden" id="date_from" value="" />
                  <input type="hidden" id="date_to" value="" />
                </div>
                <div className="search-container">
                  <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input
                    type="text"
                    id="searchInput"
                    placeholder="Search"
                    className="search-input"
                    defaultValue={initialSearch}
                  />
                </div>
                <div className="checkbox-section">
                  <input type="checkbox" id="showAll" name="showAll" defaultChecked={initialShowAll} />
                  <label htmlFor="showAll">Show All</label>
                </div>
                <div className="checkbox-section">
                  <input type="checkbox" id="showInactive" name="showInactive" defaultChecked={showInactiveChecked} />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                <div
                  id="process-list-bank-only-filters"
                  className="process-list-bank-only-filters"
                  style={{ display: 'none', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                >
                  <div className="checkbox-section">
                    <input type="checkbox" id="showOfficial" name="showOfficial" defaultChecked={showOfficialChecked} />
                    <label htmlFor="showOfficial">Show Official</label>
                  </div>
                  <div className="checkbox-section">
                    <input type="checkbox" id="showEInvoice" name="showEInvoice" defaultChecked={showEInvoiceChecked} />
                    <label htmlFor="showEInvoice">Show E-Invoice</label>
                  </div>
                  <div className="checkbox-section">
                    <input type="checkbox" id="showBlock" name="showBlock" defaultChecked={showBlockChecked} />
                    <label htmlFor="showBlock">Show Block</label>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-delete"
                id="processDeleteSelectedBtn"
                onClick={() => (window as unknown as { deleteSelected?: () => void }).deleteSelected?.()}
                title="Only inactive processes can be deleted"
                disabled
              >
                Delete
              </button>
            </div>
            {belowToolbar}
          </div>

          <div className="process-table-wrapper" id="processTableWrapper">
            <div className="table-header" id="tableHeader">
              <div className="header-item gambling-header">No</div>
              <div className="header-item gambling-header">Process ID</div>
              <div className="header-item gambling-header">Description</div>
              <div className="header-item gambling-header">Status</div>
              <div className="header-item gambling-header">Currency</div>
              <div className="header-item gambling-header">Day Use</div>
              <div className="header-item gambling-header">
                Action
                <input
                  type="checkbox"
                  id="selectAllProcesses"
                  title="Select all"
                  style={{ marginLeft: 10, cursor: 'pointer' }}
                  onChange={() => (window as unknown as { toggleSelectAllProcesses?: () => void }).toggleSelectAllProcesses?.()}
                />
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                No
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Supplier
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Country (Currency)
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Bank
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Types
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Card Owner
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Contract
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Insurance
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Customer
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Cost
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Price
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Profit
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Status
              </div>
              <div className="header-item bank-header" style={{ display: 'none' }}>
                Date
              </div>
              <div className="header-item bank-header bank-action-header" style={{ display: 'none' }}>
                Action
                <input
                  type="checkbox"
                  title="Select all"
                  className="header-action-checkbox"
                  style={{ marginLeft: 10, cursor: 'pointer' }}
                />
              </div>
            </div>

            <div className="process-cards" id="processTableBody">
              <div className="process-card">
                <div className="card-item">Load the Data...</div>
              </div>
            </div>
          </div>

          <div id="bankTableWrapper" className="bank-table-wrapper" style={{ display: 'none' }}>
            <table id="bankTable" className="bank-data-table">
              <thead>
                <tr id="bankTableHeadRow" />
              </thead>
              <tbody id="bankTableBody" />
            </table>
          </div>

          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" id="prevBtn" onClick={() => (window as unknown as { prevPage?: () => void }).prevPage?.()}>
              ◀
            </button>
            <span className="pagination-info" id="paginationInfo">
              1 of 1
            </span>
            <button type="button" className="pagination-btn" id="nextBtn" onClick={() => (window as unknown as { nextPage?: () => void }).nextPage?.()}>
              ▶
            </button>
          </div>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: gamesModalsHtml }} />
      <div dangerouslySetInnerHTML={{ __html: bankModalsHtml }} />

      <div className="calendar-popup" id="calendar-popup" style={{ display: 'none' }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); (window as unknown as { changeMonth?: (n: number) => void }).changeMonth?.(-1) }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <select id="calendar-month-select" defaultValue="0">
              <option value="0">Jan</option>
              <option value="1">Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); (window as unknown as { changeMonth?: (n: number) => void }).changeMonth?.(1) }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div>
          <div className="calendar-weekday">Mon</div>
          <div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div>
          <div className="calendar-weekday">Thu</div>
          <div className="calendar-weekday">Fri</div>
          <div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </>
  )
}
