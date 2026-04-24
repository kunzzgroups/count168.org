import type { ReactNode } from 'react'

/** 与 `account-list_classic.php` 主区 DOM 一致，供 `js/account-list.js` 绑定 */
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const n = i + 1
  return (
    <option key={n} value={String(n)}>
      {n} Days
    </option>
  )
})

type Props = {
  initialSearch: string
  initialShowInactive: boolean
  initialShowAll: boolean
  /** Group / Company 行（React 渲染，与 `includes/company_filter.php` 一致） */
  belowToolbar?: ReactNode
}

export function AccountListLegacyDom({
  initialSearch,
  initialShowInactive,
  initialShowAll,
  belowToolbar,
}: Props) {
  return (
    <>
      <div className="container">
        <div className="content">
          <h1 className="account-page-title">Account List</h1>

          <div className="account-separator-line" />

          <div className="account-action-buttons-container" style={{ marginBottom: 20 }}>
            <div
              className="account-action-buttons"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="account-btn account-btn-add" onClick={() => (window as unknown as { addAccount?: () => void }).addAccount?.()}>
                  Add Account
                </button>
                <div className="account-search-container">
                  <svg className="account-search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input
                    type="text"
                    id="searchInput"
                    placeholder="Search by Account or Name"
                    className="account-search-input"
                    defaultValue={initialSearch}
                  />
                </div>
                <div className="account-checkbox-section">
                  <input type="checkbox" id="showInactive" name="showInactive" defaultChecked={initialShowInactive} />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                <div className="account-checkbox-section">
                  <input type="checkbox" id="showAll" name="showAll" defaultChecked={initialShowAll} />
                  <label htmlFor="showAll">Show All</label>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="account-btn account-btn-setting" onClick={() => (window as unknown as { openCurrencySettingModal?: () => void }).openCurrencySettingModal?.()}>
                  Currency Setting
                </button>
                <button
                  type="button"
                  className="account-btn account-btn-delete"
                  id="accountDeleteSelectedBtn"
                  onClick={() => (window as unknown as { deleteSelected?: () => void }).deleteSelected?.()}
                  title="Only inactive accounts can be deleted"
                >
                  Delete
                </button>
              </div>
            </div>
            {belowToolbar}
          </div>

          <div className="account-table-wrapper" id="accountTableWrapper">
            <div className="account-table-header">
              <div className="account-header-item">No</div>
              <div className="account-header-item account-header-sortable" onClick={() => (window as unknown as { sortByAccount?: () => void }).sortByAccount?.()} role="presentation">
                Account
                <span className="account-sort-indicator" id="sortAccountIndicator">
                  ▲
                </span>
              </div>
              <div className="account-header-item">Name</div>
              <div className="account-header-item account-header-sortable" onClick={() => (window as unknown as { sortByRole?: () => void }).sortByRole?.()} role="presentation">
                Role
                <span className="account-sort-indicator" id="sortRoleIndicator" />
              </div>
              <div className="account-header-item">Alert</div>
              <div className="account-header-item">Status</div>
              <div className="account-header-item">Last Login</div>
              <div className="account-header-item">Remark</div>
              <div className="account-header-item">
                Action
                <input
                  type="checkbox"
                  id="selectAllAccounts"
                  title="Select all"
                  style={{ marginLeft: 10, cursor: 'pointer' }}
                  onChange={() => (window as unknown as { toggleSelectAllAccounts?: () => void }).toggleSelectAllAccounts?.()}
                />
              </div>
            </div>

            <div className="account-cards" id="accountTableBody">
              <div className="account-card">
                <div className="account-card-item">Loading...</div>
              </div>
            </div>
          </div>

          <div className="account-pagination-container" id="paginationContainer">
            <button
              type="button"
              className="account-pagination-btn"
              id="prevBtn"
              onClick={() => (window as unknown as { c168AccountListPrevPage?: () => void }).c168AccountListPrevPage?.()}
            >
              ◀
            </button>
            <span className="account-pagination-info" id="paginationInfo">
              1 of 1
            </span>
            <button
              type="button"
              className="account-pagination-btn"
              id="nextBtn"
              onClick={() => (window as unknown as { c168AccountListNextPage?: () => void }).c168AccountListNextPage?.()}
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      <div id="editModal" className="account-modal" style={{ display: 'none' }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Edit Account</h2>
            <span className="account-close" onClick={() => (window as unknown as { closeEditModal?: () => void }).closeEditModal?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="account-modal-body">
            <form id="editAccountForm" className="account-form">
              <input type="hidden" id="edit_account_id" name="id" />

              <div className="account-form-columns">
                <div className="account-form-column">
                  <h3 className="account-section-header">Personal Information</h3>
                  <div className="account-form-group">
                    <label htmlFor="edit_account_id_field">Account ID *</label>
                    <input type="text" id="edit_account_id_field" name="account_id" readOnly />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="edit_name">Name *</label>
                    <input type="text" id="edit_name" name="name" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="edit_role">Role *</label>
                    <select id="edit_role" name="role" required>
                      <option value="">Select Role</option>
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="edit_password">Password *</label>
                    <input type="password" id="edit_password" name="password" required />
                  </div>
                </div>

                <div className="account-form-column">
                  <h3 className="account-section-header">Payment</h3>
                  <div className="account-form-group" />
                  <div className="account-form-group">
                    <span>Payment Alert</span>
                    <div className="account-radio-group">
                      <label className="account-radio-label">
                        <input type="radio" name="payment_alert" value="1" />
                        Yes
                      </label>
                      <label className="account-radio-label">
                        <input type="radio" name="payment_alert" value="0" />
                        No
                      </label>
                    </div>
                  </div>
                  <div className="account-form-row" id="edit_alert_fields" style={{ display: 'none' }}>
                    <div className="account-form-group">
                      <label htmlFor="edit_alert_type">Alert Type</label>
                      <select id="edit_alert_type" name="alert_type">
                        <option value="">Select Type</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        {DAY_OPTIONS}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="edit_alert_start_date">Start Date</label>
                      <input type="date" id="edit_alert_start_date" name="alert_start_date" />
                    </div>
                  </div>
                  <div className="account-form-group" id="edit_alert_amount_row" style={{ display: 'none' }}>
                    <label htmlFor="edit_alert_amount">Alert (Amount)</label>
                    <input type="number" id="edit_alert_amount" name="alert_amount" step={0.01} placeholder="Enter amount (auto-converted to negative)" />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="edit_remark">Remark</label>
                    <textarea id="edit_remark" name="remark" rows={1} style={{ resize: 'none', overflowY: 'hidden', lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>

              <div className="account-form-section">
                <div className="account-advance-section">
                  <h3>Advanced Account</h3>

                  <div className="account-other-currency">
                    <span>Other Currency:</span>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="text" id="editCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)" />
                      <button type="button" className="account-btn-add-currency" onClick={() => (window as unknown as { addCurrencyFromInput?: (m: string) => void }).addCurrencyFromInput?.('edit')}>
                        Create Currency
                      </button>
                    </div>

                    <div className="account-currency-list" id="editCurrencyList" />
                  </div>

                  <div className="account-other-currency" style={{ marginTop: 20 }}>
                    <span>Company:</span>
                    <div className="account-currency-list" id="editCompanyList" />
                  </div>
                </div>
              </div>

              <div className="account-form-actions">
                <button type="submit" className="account-btn account-btn-save">
                  Update Account
                </button>
                <button type="button" className="account-btn account-btn-cancel" onClick={() => (window as unknown as { closeEditModal?: () => void }).closeEditModal?.()}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="accountNotificationContainer" className="account-notification-container" />

      <div id="addModal" className="account-modal" style={{ display: 'none' }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Add Account</h2>
            <span className="account-close" onClick={() => (window as unknown as { closeAddModal?: () => void }).closeAddModal?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="account-modal-body">
            <form id="addAccountForm" className="account-form">
              <div className="account-form-columns">
                <div className="account-form-column">
                  <h3 className="account-section-header">Personal Information</h3>
                  <div className="account-form-group">
                    <label htmlFor="add_account_id">Account ID *</label>
                    <input type="text" id="add_account_id" name="account_id" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_name">Name *</label>
                    <input type="text" id="add_name" name="name" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_role">Role *</label>
                    <select id="add_role" name="role" required>
                      <option value="">Select Role</option>
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_password">Password *</label>
                    <input type="password" id="add_password" name="password" required />
                  </div>
                </div>

                <div className="account-form-column">
                  <h3 className="account-section-header">Payment</h3>
                  <div className="account-form-group" />
                  <div className="account-form-group">
                    <span>Payment Alert</span>
                    <div className="account-radio-group">
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="1" />
                        Yes
                      </label>
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="0" defaultChecked />
                        No
                      </label>
                    </div>
                  </div>
                  <div className="account-form-row" id="add_alert_fields" style={{ display: 'none' }}>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_type">Alert Type</label>
                      <select id="add_alert_type" name="alert_type">
                        <option value="">Select Type</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        {DAY_OPTIONS}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_start_date">Start Date</label>
                      <input type="date" id="add_alert_start_date" name="alert_start_date" />
                    </div>
                  </div>
                  <div className="account-form-group" id="add_alert_amount_row" style={{ display: 'none' }}>
                    <label htmlFor="add_alert_amount">Alert (Amount)</label>
                    <input type="number" id="add_alert_amount" name="alert_amount" step={0.01} placeholder="Enter amount (auto-converted to negative)" />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_remark">Remark</label>
                    <textarea id="add_remark" name="remark" rows={1} style={{ resize: 'none', overflowY: 'hidden', lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>

              <div className="account-form-section">
                <div className="account-advance-section">
                  <h3>Advanced Account</h3>

                  <div className="account-other-currency">
                    <span>Other Currency:</span>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input type="text" id="addCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)" />
                      <button type="button" className="account-btn-add-currency" onClick={() => (window as unknown as { addCurrencyFromInput?: (m: string) => void }).addCurrencyFromInput?.('add')}>
                        Create Currency
                      </button>
                    </div>

                    <div className="account-currency-list" id="addCurrencyList" />
                  </div>

                  <div className="account-other-currency" style={{ marginTop: 20 }}>
                    <span>Company:</span>
                    <div className="account-currency-list" id="addCompanyList" />
                  </div>
                </div>
              </div>

              <div className="account-form-actions">
                <button type="submit" className="account-btn account-btn-save">
                  Add Account
                </button>
                <button type="button" className="account-btn account-btn-cancel" onClick={() => (window as unknown as { closeAddModal?: () => void }).closeAddModal?.()}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="linkAccountModal" className="account-modal" style={{ display: 'none' }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Link Account</h2>
            <span className="account-close" onClick={() => (window as unknown as { closeLinkAccountModal?: () => void }).closeLinkAccountModal?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="link-account-fixed-area">
            <div className="link-type-section">
              <div className="link-type-pills">
                <label className="link-type-pill" id="linkTypeLabelBidirectional" htmlFor="linkTypeBidirectional">
                  <input type="radio" name="linkType" value="bidirectional" id="linkTypeBidirectional" defaultChecked className="link-type-radio" />
                  <span className="link-type-pill-check">&#10003;</span>
                  <span className="link-type-pill-text">Bidirectional</span>
                </label>
                <label className="link-type-pill" id="linkTypeLabelUnidirectional" htmlFor="linkTypeUnidirectional">
                  <input type="radio" name="linkType" value="unidirectional" id="linkTypeUnidirectional" className="link-type-radio" />
                  <span className="link-type-pill-check">&#10003;</span>
                  <span className="link-type-pill-text">Unidirectional</span>
                </label>
              </div>
              <p className="link-type-desc" id="linkTypeDescription">
                Bidirectional: Data syncs both ways.
              </p>
            </div>
            <div className="link-account-search-wrap">
              <div className="link-account-search-inner">
                <svg className="link-account-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input type="text" id="linkAccountSearchInput" className="link-account-search-input" placeholder="Search account..." autoComplete="off" aria-label="Search account" />
              </div>
            </div>
          </div>
          <div className="account-modal-body link-account-modal-body">
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div id="linkAccountList" className="link-account-list" />
              </div>
            </div>
          </div>
          <div className="account-form-actions link-account-form-actions">
            <button type="button" className="account-btn account-btn-save" onClick={() => (window as unknown as { saveAccountLinks?: () => void }).saveAccountLinks?.()}>
              Save
            </button>
            <button type="button" className="account-btn account-btn-cancel" onClick={() => (window as unknown as { closeLinkAccountModal?: () => void }).closeLinkAccountModal?.()}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div id="currencySettingModal" className="currency-fullscreen-modal" style={{ display: 'none' }}>
        <div className="currency-fullscreen-modal-content">
          <div className="currency-fullscreen-modal-header-bar">
            <h2>Currency Setting</h2>
            <button type="button" className="currency-btn-back" onClick={() => (window as unknown as { closeCurrencySettingModal?: () => void }).closeCurrencySettingModal?.()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          </div>

          <div className="currency-fullscreen-modal-body">
            <div className="currency-left-panel">
              <div className="currency-setting-add-row-stacked" style={{ marginTop: 10 }}>
                <label htmlFor="currencySettingAddInput">Add Currency :</label>
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                  <input type="text" id="currencySettingAddInput" className="currency-setting-input" placeholder="Please enter new currency" style={{ flex: 1 }} />
                  <button type="button" className="account-btn account-btn-add currency-setting-add-btn" onClick={() => (window as unknown as { addCurrencyFromSettingModal?: () => void }).addCurrencyFromSettingModal?.()}>
                    Add
                  </button>
                </div>
              </div>

              <div className="currency-setting-divider" />

              <div className="currency-setting-list-row-stacked">
                <span>Currency :</span>
                <div className="currency-setting-pill-list" id="currencySettingPillList" />
              </div>
            </div>

            <div className="currency-right-panel" style={{ paddingTop: 24 }}>
              <div className="currency-setting-filter-row">
                <div className="currency-setting-search-wrap">
                  <svg className="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" aria-hidden>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input type="text" id="currencySettingSearchInput" className="currency-setting-search-input" placeholder="Search Bar" autoComplete="off" />
                </div>
                <div className="currency-setting-role-filter">
                  <select id="currencySettingRoleSelect" className="currency-setting-select">
                    <option value="">Filter Row</option>
                  </select>
                </div>
              </div>
              <div className="currency-setting-selectall-row">
                <button type="button" id="currencySettingSelectAllBtn" className="account-btn currency-setting-selectall-btn" onClick={() => (window as unknown as { toggleSelectAllCurrencyAccounts?: () => void }).toggleSelectAllCurrencyAccounts?.()}>
                  Select All
                </button>
                <span id="currencySettingSelectedCount" className="currency-setting-selected-count">
                  0 selected
                </span>
              </div>

              <div className="currency-setting-account-list" id="currencySettingAccountList" />
            </div>
          </div>

          <div className="currency-fullscreen-bottom-bar">
            <button type="button" className="account-btn account-btn-save currency-setting-submit-btn" onClick={() => (window as unknown as { saveCurrencySetting?: () => void }).saveCurrencySetting?.()}>
              Save
            </button>
            <button type="button" className="account-btn account-btn-cancel currency-setting-cancel-btn" onClick={() => (window as unknown as { closeCurrencySettingModal?: () => void }).closeCurrencySettingModal?.()}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div id="confirmDeleteModal" className="account-modal" style={{ display: 'none' }}>
        <div className="account-confirm-modal-content">
          <div className="account-confirm-icon-container">
            <svg className="account-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="account-confirm-title">Confirm Delete</h2>
          <p id="confirmDeleteMessage" className="account-confirm-message">
            This action cannot be undone.
          </p>
          <div className="account-confirm-actions">
            <button type="button" className="account-btn account-btn-cancel confirm-cancel" onClick={() => (window as unknown as { closeConfirmDeleteModal?: () => void }).closeConfirmDeleteModal?.()}>
              Cancel
            </button>
            <button type="button" className="account-btn account-btn-delete confirm-delete" onClick={() => (window as unknown as { confirmDelete?: () => void }).confirmDelete?.()}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
