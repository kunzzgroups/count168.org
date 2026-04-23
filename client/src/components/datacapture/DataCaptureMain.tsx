import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { apiUrl } from '../../lib/api'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { DataCaptureDateProcessFields } from './DataCaptureDateProcessFields'
import '../../../../css/datacapture.css'
import '../../../../css/global-13inch.css'
import './DataCaptureMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

/** `datacapture.js` 在全局挂的函数（非 module 脚本） */
function dcCall(name: string): () => void {
  return () => {
    const fn = (window as unknown as Record<string, (() => void) | undefined>)[name]
    fn?.()
  }
}

let datacaptureScriptPromise: Promise<void> | null = null

function ensureDatacaptureScript(): Promise<void> {
  if (!datacaptureScriptPromise) {
    datacaptureScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = apiUrl('/js/datacapture.js')
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load datacapture.js'))
      document.head.appendChild(s)
    })
  }
  return datacaptureScriptPromise
}

/**
 * React `/datacapture`：壳与 Transaction/Dashboard 一致；主区由 `js/datacapture.js` 驱动。
 * 经典全页见 `datacapture_classic.php`（顶栏「经典版」）。
 */
export function DataCaptureMain({ bootstrap }: Props) {
  const w = useTransactionWorkspace(bootstrap)
  const [dcPageReady, setDcPageReady] = useState(false)
  /** `restore=1` 时由 legacy 写日期/工序，避免与受控组件冲突 */
  const useReactDateProcessFields = useMemo(
    () => new URLSearchParams(window.location.search).get('restore') !== '1',
    [],
  )

  const activeRef = useRef(w.activeCompanyId)
  const companiesRef = useRef(w.companies)

  useLayoutEffect(() => {
    activeRef.current = w.activeCompanyId
    companiesRef.current = w.companies
  })

  useLayoutEffect(() => {
    if (useReactDateProcessFields) {
      window.__DC_REACT_DATE_PROCESS__ = true
    } else {
      delete window.__DC_REACT_DATE_PROCESS__
    }
    return () => {
      if (useReactDateProcessFields) {
        delete window.__DC_REACT_DATE_PROCESS__
      }
    }
  }, [useReactDateProcessFields])

  useLayoutEffect(() => {
    document.body.classList.add('datacapture-spa-embed')
    return () => {
      document.body.classList.remove('datacapture-spa-embed')
    }
  }, [])

  useEffect(() => {
    window.__C168_API_BASE__ = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
    window.__C168_SPA_LINK_BASE__ = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    return () => {
      delete window.__C168_API_BASE__
      delete window.__C168_SPA_LINK_BASE__
    }
  }, [])

  useLayoutEffect(() => {
    if (!w.companiesReady || w.loadCompaniesError) return
    const id = w.activeCompanyId
    const row = w.companies.find((c) => Number(c.id) === Number(id))
    window.DATACAPTURE_COMPANY_ID = id ?? null
    window.DATACAPTURE_COMPANY_CODE = row ? String(row.company_id || '') : ''
  }, [w.companiesReady, w.loadCompaniesError, w.activeCompanyId, w.companies])

  useEffect(() => {
    const onSessionUpdated = () => {
      const id = activeRef.current
      const list = companiesRef.current
      const row = list.find((c) => Number(c.id) === Number(id))
      if (id != null) {
        window.DATACAPTURE_COMPANY_ID = id
        window.DATACAPTURE_COMPANY_CODE = row ? String(row.company_id || '') : ''
      }
      void window.refreshDataCapturePageData?.()
    }
    window.addEventListener('c168:company-session-updated', onSessionUpdated)
    return () => window.removeEventListener('c168:company-session-updated', onSessionUpdated)
  }, [])

  useEffect(() => {
    if (!w.companiesReady || w.loadCompaniesError) return
    if (w.activeCompanyId == null) return

    setDcPageReady(false)
    let alive = true
    void ensureDatacaptureScript()
      .then(() => {
        if (!alive) return
        return window.runDataCapturePageInit?.()
      })
      .then(() => {
        if (!alive) return
        setDcPageReady(true)
      })
      .catch((err) => {
        console.error(err)
      })

    return () => {
      alive = false
    }
  }, [w.companiesReady, w.loadCompaniesError, w.activeCompanyId])

  if (w.loadCompaniesError) {
    return (
      <div className="dcShell dcShell--message">
        <p className="dcShell__messageTitle">无法加载公司列表</p>
        <button type="button" className="dcShell__retry" onClick={() => w.retryLoadCompanies()}>
          重试
        </button>
      </div>
    )
  }

  if (!w.companiesReady || w.activeCompanyId == null) {
    return (
      <div className="dcShell dcShell--message" role="status" aria-live="polite">
        <p className="dcShell__messageTitle">加载中…</p>
      </div>
    )
  }

  return (
    <div className="dcShell">
      <div className="container">
        <div className="dcShell__pageHeader">
          <h1 className="dcShell__title">Data Capture</h1>

          <div className="dcShell__headerTools">
            <div
              id="data-capture-permission-filter"
              className="data-capture-company-filter data-capture-permission-filter-header"
              style={{ display: 'none' }}
            >
              <span className="data-capture-company-label">Category:</span>
              <div id="data-capture-permission-buttons" className="data-capture-company-buttons" />
            </div>
          </div>
        </div>

        <div className="top-section">
          <div className="form-column">
            <div className="form-container">
              <form id="dataCaptureForm" className="process-form" method="POST">
                {w.groupIds.length > 0 && (
                  <div
                    id="group-buttons-wrapper"
                    className="data-capture-company-filter shared-group-wrapper"
                  >
                    <span className="data-capture-company-label">GroupID:</span>
                    <div id="group-buttons-container" className="data-capture-company-buttons">
                      {w.groupIds.map((g) => {
                        const active =
                          w.selectedGroup != null &&
                          String(w.selectedGroup).toUpperCase() === g
                        return (
                          <button
                            key={g}
                            type="button"
                            className={
                              active
                                ? 'data-capture-company-btn shared-group-btn active'
                                : 'data-capture-company-btn shared-group-btn'
                            }
                            data-group-id={g}
                            onClick={() => w.setGroup(w.selectedGroup === g ? null : g)}
                          >
                            {g}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {w.companies.length > 0 && (
                  <div
                    id="company-buttons-wrapper"
                    className="data-capture-company-filter shared-company-wrapper"
                  >
                    <span className="data-capture-company-label">Company:</span>
                    <div
                      id="company-buttons-container"
                      className="data-capture-company-buttons"
                      role="group"
                      aria-label="Company"
                    >
                      {w.companies.map((c) => {
                        const code = String(c.company_id || '').trim()
                        if (!code) return null
                        const cGid = String(c.group_id || '').trim().toUpperCase()
                        const selG =
                          w.selectedGroup != null
                            ? String(w.selectedGroup).toUpperCase()
                            : null
                        const visible = selG ? cGid === selG : !cGid
                        const isActive = Number(c.id) === Number(w.activeCompanyId)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            style={{ display: visible ? undefined : 'none' }}
                            className={
                              isActive
                                ? 'data-capture-company-btn shared-company-btn active'
                                : 'data-capture-company-btn shared-company-btn'
                            }
                            data-company-id={c.id}
                            data-group-id={cGid}
                            data-company-code={code}
                            onClick={() => w.onPickCompany(c.id)}
                          >
                            {code}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {useReactDateProcessFields ? (
                  <DataCaptureDateProcessFields
                    companyId={w.activeCompanyId}
                    legacyPageReady={dcPageReady}
                  />
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="capture_date">Date</label>
                      <select id="capture_date" name="capture_date" required defaultValue="">
                        <option value="">Select Date</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="capture_process">Process</label>
                      <div className="custom-select-wrapper">
                        <button
                          type="button"
                          className="custom-select-button"
                          id="capture_process"
                          data-placeholder="Select Process"
                          name="process"
                        >
                          Select Process
                        </button>
                        <div className="custom-select-dropdown" id="capture_process_dropdown">
                          <div className="custom-select-search">
                            <input type="text" placeholder="Search process..." autoComplete="off" />
                          </div>
                          <div className="custom-select-options" />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label htmlFor="capture_description">Description</label>
                  <div className="input-with-icon">
                    <input
                      type="text"
                      id="capture_description"
                      name="description"
                      required
                      readOnly
                      placeholder="Click + to select descriptions"
                    />
                    <button type="button" className="add-icon" onClick={dcCall('expandDescription')}>
                      +
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_currency">Currency</label>
                  <select id="capture_currency" name="currency" defaultValue="">
                    <option value="">Select Currency</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_remove_word">Remove Word</label>
                  <input
                    type="text"
                    id="capture_remove_word"
                    name="remove_word"
                    placeholder="Enter words to remove"
                  />
                  <small
                    className="field-help"
                    style={{ display: 'block', marginTop: 0, fontStyle: 'italic', color: '#666' }}
                  >
                    (Use semicolon to separate multiple words, e.g. abc;cde;efg)
                  </small>
                </div>

                <div className="form-group replace-word-group">
                  <label htmlFor="capture_replace_word_from">Replace Word</label>
                  <div className="replace-word-fields">
                    <input
                      type="text"
                      id="capture_replace_word_from"
                      name="replace_word_from"
                      placeholder="Old word"
                    />
                    <span className="replace-arrow">→</span>
                    <input
                      type="text"
                      id="capture_replace_word_to"
                      name="replace_word_to"
                      placeholder="New word"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_remark">Remark</label>
                  <input
                    type="text"
                    id="capture_remark"
                    name="remark"
                    placeholder="Enter remark"
                  />
                </div>
              </form>
            </div>
          </div>

          <div className="submitted-column">
            <div className="submitted-container">
              <h2 className="submitted-title">Submitted Processes</h2>
              <div className="submitted-list" id="submittedProcessesList">
                <div className="no-data">No processes submitted yet</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-section">
          <div className="excel-table-container">
            <div className="excel-table-header">
              <span>Data Capture Table</span>
              <select id="dataCaptureTypeSelector" className="data-capture-type-selector" defaultValue="1.Text">
                <option value="1.Text">1.TEXT</option>
                <option value="2.Format">2.FORMAT</option>
                <option value="CITIBET_MAJOR">3.CITIBET</option>
                <option value="4.RETURN">4.RETURN</option>
              </select>
              <button type="button" className="btn btn-cancel" onClick={dcCall('resetForm')}>
                Reset
              </button>
            </div>
            <table className="excel-table" id="dataTable">
              <thead id="tableHeader">
                <tr>
                  <th />
                </tr>
              </thead>
              <tbody id="tableBody" />
            </table>
            <div
              id="tablePreviewFormat"
              className="table-preview-format"
              style={{ display: 'none' }}
            >
              <iframe
                id="tablePreviewFrameFormat"
                className="table-preview-frame-format"
                title="Format Table Preview"
              />
            </div>
            <div
              id="pasteAreaFormat"
              className="paste-area-format"
              style={{ display: 'none' }}
              contentEditable
              data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
            />
          </div>

          <div className="form-actions">
            <button
              id="dataCaptureSubmitBtn"
              type="button"
              className="btn btn-save"
              onClick={dcCall('submitDataCaptureForm')}
            >
              Submit
            </button>
          </div>
        </div>
      </div>

      <div id="descriptionSelectionModal" className="modal" style={{ display: 'none' }}>
        <div className="modal-content description-selection-modal">
          <div className="modal-header">
            <h2>Select or Add Description</h2>
            <span
              className="close"
              onClick={dcCall('closeDescriptionSelectionModal')}
              role="presentation"
            >
              &times;
            </span>
          </div>
          <div className="modal-body">
            <div className="description-selection-container">
              <div className="selected-descriptions-section">
                <h3>Selected Descriptions</h3>
                <div className="selected-descriptions-list" id="selectedDescriptionsInModal" />
              </div>
              <div className="available-descriptions-section">
                <div className="add-description-bar">
                  <h3>Add New Description</h3>
                  <form id="addDescriptionForm" className="add-description-form">
                    <div className="add-description-input-group">
                      <input
                        type="text"
                        id="new_description_name"
                        name="description_name"
                        placeholder="Enter new description name..."
                        required
                      />
                      <button type="submit" className="btn btn-save">
                        Add
                      </button>
                    </div>
                  </form>
                </div>
                <h3>Available Descriptions</h3>
                <div className="description-search">
                  <input
                    type="text"
                    id="descriptionSearch"
                    placeholder="Search descriptions..."
                    onKeyUp={dcCall('filterDescriptions')}
                  />
                </div>
                <div className="description-list" id="existingDescriptions" />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-save"
                id="confirmDescriptionsBtn"
                onClick={dcCall('confirmDescriptions')}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-cancel"
                onClick={dcCall('closeDescriptionSelectionModal')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="processNotificationContainer" className="process-notification-container" />

      <div id="contextMenu" className="context-menu" style={{ display: 'none' }}>
        <div
          className="context-menu-item"
          onClick={(e) => {
            dcCall('copySelectedCells')()
            e.stopPropagation()
          }}
          role="presentation"
        >
          <span>📋 Copy</span>
        </div>
        <div
          className="context-menu-item"
          onClick={(e) => {
            dcCall('pasteToSelectedCells')()
            e.stopPropagation()
          }}
          role="presentation"
        >
          <span>📄 Paste</span>
        </div>
        <div
          className="context-menu-item"
          onClick={(e) => {
            dcCall('clearSelectedCells')()
            e.stopPropagation()
          }}
          role="presentation"
        >
          <span>🗑️ Clear</span>
        </div>
        <div
          className="context-menu-item"
          onClick={(e) => {
            const fn = (window as unknown as Record<string, ((ev: MouseEvent) => void) | undefined>)
              .showDeleteDialog
            fn?.(e.nativeEvent)
            e.stopPropagation()
          }}
          role="presentation"
        >
          <span>🗑️ Delete</span>
        </div>
        <div
          className="context-menu-item"
          onClick={(e) => {
            const fn = (window as unknown as Record<string, ((ev: MouseEvent) => void) | undefined>)
              .selectAllCells
            fn?.(e.nativeEvent)
          }}
          role="presentation"
        >
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu" style={{ display: 'none' }}>
        <div className="context-menu-item" onClick={dcCall('insertColumnLeft')} role="presentation">
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('insertColumnRight')} role="presentation">
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('deleteColumn')} role="presentation">
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('clearColumn')} role="presentation">
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu" style={{ display: 'none' }}>
        <div className="context-menu-item" onClick={dcCall('insertRowAbove')} role="presentation">
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('insertRowBelow')} role="presentation">
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('deleteRow')} role="presentation">
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" onClick={dcCall('clearRow')} role="presentation">
          <span>❌ Clear row</span>
        </div>
      </div>

      <div id="deleteDialog" className="delete-dialog" style={{ display: 'none' }}>
        <div className="delete-dialog-content">
          <div className="delete-dialog-header">
            <span>Delete</span>
            <span className="delete-dialog-close" onClick={dcCall('closeDeleteDialog')} role="presentation">
              &times;
            </span>
          </div>
          <div className="delete-dialog-body">
            <div className="delete-dialog-title">Delete</div>
            <div className="delete-options">
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftLeft" defaultChecked />
                <span>Shift cells left</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftUp" />
                <span>Shift cells up</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireRow" />
                <span>Entire row</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireColumn" />
                <span>Entire column</span>
              </label>
            </div>
          </div>
          <div className="delete-dialog-footer">
            <button
              type="button"
              className="btn btn-save"
              onClick={(e) => {
                dcCall('confirmDelete')()
                e.stopPropagation()
              }}
            >
              OK
            </button>
            <button
              type="button"
              className="btn btn-cancel"
              onClick={(e) => {
                dcCall('closeDeleteDialog')()
                e.stopPropagation()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
