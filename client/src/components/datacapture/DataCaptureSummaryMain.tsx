import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import { updateSessionCompany } from '../../lib/ownerCompaniesApi'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/accountCSS.css'
import '../../../../css/datacapturesummary.css'
import '../../../../css/global-13inch.css'
import './DataCaptureMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

let summaryScriptPromise: Promise<void> | null = null

function ensureDatacaptureSummaryScript(): Promise<void> {
  if (!summaryScriptPromise) {
    summaryScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = apiUrl('/js/datacapturesummary.js')
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load datacapturesummary.js'))
      document.head.appendChild(s)
    })
  }
  return summaryScriptPromise
}

function legacySummary(name: string, ...args: unknown[]) {
  const w = window as unknown as Record<string, unknown>
  const fn = w[name]
  if (typeof fn === 'function') {
    ;(fn as (...a: unknown[]) => void)(...args)
  }
}

const ALERT_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const n = i + 1
  return (
    <option key={n} value={String(n)}>
      {n} Days
    </option>
  )
})

/**
 * React `/datacapturesummary`：DOM 与 `datacapturesummary_classic.php` 对齐，由 `js/datacapturesummary.js` 驱动。
 */
export function DataCaptureSummaryMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const spKey = searchParams.toString()

  const effectiveCompanyId = useMemo(() => {
    const raw = searchParams.get('company_id')
    if (raw != null && raw !== '') {
      const want = parseInt(raw, 10)
      if (Number.isFinite(want)) return want
    }
    return bootstrap.companyId ?? null
  }, [searchParams, bootstrap.companyId])

  const replaceCompanyInUrl = useCallback(
    (companyId: number) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('company_id', String(companyId))
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  useLayoutEffect(() => {
    document.body.classList.add('datacapture-summary-spa-embed', 'datacapture-page')
    return () => {
      document.body.classList.remove('datacapture-summary-spa-embed', 'datacapture-page')
    }
  }, [])

  useLayoutEffect(() => {
    window.DATACAPTURESUMMARY_COMPANY_ID = effectiveCompanyId
    return () => {
      delete window.DATACAPTURESUMMARY_COMPANY_ID
    }
  }, [effectiveCompanyId])

  useEffect(() => {
    window.__C168_API_BASE__ = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
    window.__C168_SPA_LINK_BASE__ = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    return () => {
      delete window.__C168_API_BASE__
      delete window.__C168_SPA_LINK_BASE__
    }
  }, [])

  useEffect(() => {
    if (effectiveCompanyId == null) return
    void updateSessionCompany(effectiveCompanyId)
  }, [effectiveCompanyId])

  /** 无 `company_id` 时写入 bootstrap 会话公司 */
  useEffect(() => {
    if (searchParams.get('company_id')) return
    if (bootstrap.companyId == null) return
    replaceCompanyInUrl(bootstrap.companyId)
  }, [bootstrap.companyId, searchParams, replaceCompanyInUrl])

  useEffect(() => {
    let alive = true
    void ensureDatacaptureSummaryScript()
      .then(() => {
        if (!alive) return
        const kick = () => {
          if (!alive) return
          window.runDataCaptureSummaryPageInit?.()
        }
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(kick))
        } else {
          setTimeout(kick, 0)
        }
      })
      .catch((err) => console.error(err))
    return () => {
      alive = false
    }
  }, [spKey])

  return (
    <div className="dcShell">
      <div className="container">
        <h1>Data Capture Summary</h1>

        <div id="loadingState" className="loading-container">
          <div className="loading-spinner" />
          <p>Loading data...</p>
        </div>

        <div className="summary-action-buttons" id="actionButtons" style={{ display: 'none' }}>
          <div style={{ flex: 1 }} />
          <div className="batch-controls-group">
            <label htmlFor="rateInput" className="batch-label">
              Rate
            </label>
            <input type="text" id="rateInput" className="batch-input" placeholder="e.g. *3 or /3" />
            <button
              type="button"
              className="btn-update-all"
              id="rateSelectAllBtn"
              onClick={(e) => legacySummary('toggleAllRate', e.currentTarget)}
            >
              Select All
            </button>
            <button type="button" className="btn-update-all" id="topSubmitBtn" onClick={() => legacySummary('submitRateValues')}>
              Submit
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="summary-btn summary-btn-delete"
            id="summaryDeleteSelectedBtn"
            onClick={() => legacySummary('deleteSelectedRows')}
            title="Delete selected rows"
            disabled
          >
            Delete
          </button>
        </div>

        <div className="summary-table-container" id="summaryTableContainer" style={{ display: 'none' }}>
          <div className="process-info-container" id="processInfoContainer" style={{ display: 'none' }}>
            <div className="process-info-row">
              <div className="process-info-item">
                <span className="process-info-label">Date:</span>
                <span className="process-info-value" id="processInfoDate">
                  -
                </span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Process:</span>
                <span className="process-info-value" id="processInfoProcess">
                  -
                </span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Description:</span>
                <span className="process-info-value" id="processInfoDescription">
                  -
                </span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Currency:</span>
                <span className="process-info-value" id="processInfoCurrency">
                  -
                </span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Remark:</span>
                <span className="process-info-value" id="processInfoRemark">
                  -
                </span>
              </div>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="summary-table" id="summaryTable">
              <thead>
                <tr>
                  <th className="id-product-header">Id Product</th>
                  <th>Account</th>
                  <th />
                  <th>Currency</th>
                  <th>Formula</th>
                  <th>Source</th>
                  <th>Rate</th>
                  <th>Rate Value</th>
                  <th>Processed Amount</th>
                  <th>Skip</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody id="summaryTableBody" />
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
        </div>

        <div className="summary-submit-container" id="summarySubmitContainer" style={{ display: 'none' }}>
          <button type="button" className="btn btn-submit" id="summarySubmitBtn" onClick={() => legacySummary('submitSummaryData')}>
            Submit
          </button>
          <button type="button" className="btn btn-cancel" onClick={() => legacySummary('goBackToDataCapture')} style={{ marginLeft: 10 }}>
            Back
          </button>
          <button type="button" className="btn btn-refresh" onClick={() => legacySummary('refreshPage')} title="Refresh page">
            <img src={apiUrl('/images/refresh.svg')} alt="Refresh" style={{ width: 'clamp(23px, 1.8vw, 35px)', height: 'clamp(23px, 1.8vw, 35px)' }} />
          </button>
        </div>
      </div>

      <div id="notificationPopup" className="notification-popup" style={{ display: 'none' }}>
        <div className="notification-header">
          <span className="notification-title" id="notificationTitle">
            Notification
          </span>
          <button type="button" className="notification-close" onClick={() => legacySummary('hideNotification')}>
            &times;
          </button>
        </div>
        <div className="notification-message" id="notificationMessage">
          Message
        </div>
      </div>

      <div id="confirmDeleteModal" className="summary-modal" style={{ display: 'none' }}>
        <div className="summary-confirm-modal-content">
          <div className="summary-confirm-icon-container">
            <svg className="summary-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="summary-confirm-title">Confirm Delete</h2>
          <p id="confirmDeleteMessage" className="summary-confirm-message">
            This action cannot be undone.
          </p>
          <div className="summary-confirm-actions">
            <button type="button" className="summary-btn summary-btn-cancel confirm-cancel" onClick={() => legacySummary('closeConfirmDeleteModal')}>
              Cancel
            </button>
            <button type="button" className="summary-btn summary-btn-delete confirm-delete" onClick={() => legacySummary('confirmDelete')}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <div id="addModal" className="account-modal" style={{ display: 'none' }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Add Account</h2>
            <span className="account-close" onClick={() => legacySummary('closeAddModal')} role="presentation">
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
                    <select id="add_role" name="role" required defaultValue="">
                      <option value="">Select Role</option>
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_password">Password *</label>
                    <input type="password" id="add_password" name="password" required autoComplete="new-password" />
                  </div>
                </div>

                <div className="account-form-column">
                  <h3 className="account-section-header">Payment</h3>
                  <div className="account-form-group" />
                  <div className="account-form-group">
                    <label>Payment Alert</label>
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
                      <select id="add_alert_type" name="alert_type" defaultValue="">
                        <option value="">Select Type</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        {ALERT_DAY_OPTIONS}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_start_date">Start Date</label>
                      <input type="date" id="add_alert_start_date" name="alert_start_date" />
                    </div>
                  </div>
                  <div className="account-form-group" id="add_alert_amount_row" style={{ display: 'none' }}>
                    <label htmlFor="add_alert_amount">Alert (Amount)</label>
                    <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)" />
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
                    <label>Other Currency:</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="text"
                        id="addCurrencyInput"
                        placeholder="Enter new currency code (e.g., EUR, JPY, GBP)"
                        style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                      />
                      <button type="button" className="account-btn-add-currency" onClick={() => legacySummary('addCurrencyFromInput', 'add')}>
                        Create Currency
                      </button>
                    </div>
                    <div className="account-currency-list" id="addCurrencyList" />
                  </div>

                  <div className="account-other-currency" style={{ marginTop: 20 }}>
                    <label>Company:</label>
                    <div className="account-currency-list" id="addCompanyList" />
                  </div>
                </div>
              </div>

              <div className="account-form-actions">
                <button type="submit" className="account-btn account-btn-save">
                  Add Account
                </button>
                <button type="button" className="account-btn account-btn-cancel" onClick={() => legacySummary('closeAddModal')}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
