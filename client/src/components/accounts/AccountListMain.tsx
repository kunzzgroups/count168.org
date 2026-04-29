import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/accountCSS.css'
import '../../../../css/account-list.css'
import '../../../../css/global-13inch.css'
import './AccountListMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

type AccountRow = {
  id: number
  account_id: string
  name: string
  role: string
  status: string
  payment_alert: number | boolean | string
  last_login: string | null
  remark: string | null
}

type ApiWrap<T> = {
  success: boolean
  message?: string
  error?: string
  data?: T
}

/**
 * React `/accounts` 纯 React 版本：
 * - 与经典一致保留 URL 查询串：`company_id`、`showInactive`、`showAll`、`search`
 * - 公司切换走 `useTransactionWorkspace` + React Router
 */
export function AccountListMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()

  const w = useTransactionWorkspace(bootstrap)
  const wRef = useRef(w)
  wRef.current = w
  const [rows, setRows] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [sortKey, setSortKey] = useState<'account' | 'role'>('account')
  const [sortAsc, setSortAsc] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [deleteSel, setDeleteSel] = useState<Record<number, boolean>>({})
  const PAGE_SIZE = 20
  const showInactive = searchParams.has('showInactive')
  const showAll = searchParams.has('showAll')
  const searchText = searchParams.get('search') ?? ''

  useLayoutEffect(() => {
    document.body.classList.add('account-list-spa-embed', 'account-page')
    return () => {
      document.body.classList.remove('account-list-spa-embed', 'account-page')
      document.body.classList.remove('account-page--show-all')
    }
  }, [])

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

  useEffect(() => {
    window.onSharedCompanyFilterChanged = (companyId, _companyCode) => {
      const wr = wRef.current
      if (companyId == null || companyId === '') {
        wr.setGroup(null)
        return
      }
      const id = typeof companyId === 'number' ? companyId : parseInt(String(companyId), 10)
      if (!Number.isFinite(id)) return
      wr.onPickCompany(id)
      replaceCompanyInUrl(id)
    }
    return () => {
      delete window.onSharedCompanyFilterChanged
    }
  }, [replaceCompanyInUrl])

  useEffect(() => {
    if (!w.companiesReady) return
    const raw = searchParams.get('company_id')
    if (raw == null || raw === '') return
    const want = parseInt(raw, 10)
    if (!Number.isFinite(want)) return
    const active = wRef.current.activeCompanyId
    if (active != null && Number(active) === want) return
    const row = wRef.current.companies.find((c) => Number(c.id) === want)
    if (!row) return
    const g =
      row.group_id && String(row.group_id).trim() !== ''
        ? String(row.group_id).toUpperCase()
        : null
    if (g) wRef.current.setGroup(g)
    window.setTimeout(() => {
      wRef.current.onPickCompany(want)
    }, 0)
  }, [w.companiesReady, searchParams, w.companies])

  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    if (searchParams.get('company_id')) return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

  const loadAccounts = useCallback(async () => {
    if (w.activeCompanyId == null) return
    setLoading(true)
    setErr(null)
    const q = new URLSearchParams()
    q.set('company_id', String(w.activeCompanyId))
    if (searchText.trim()) q.set('search', searchText.trim())
    if (showInactive) q.set('showInactive', '1')
    if (showAll) q.set('showAll', '1')
    try {
      const res = await apiFetch(`/api/accounts/accountlistapi.php?${q.toString()}`)
      const json = (await res.json()) as ApiWrap<{ accounts: AccountRow[] }>
      if (!json.success) {
        setErr(String(json.error || json.message || 'Failed to load accounts'))
        setRows([])
        return
      }
      setRows(Array.isArray(json.data?.accounts) ? json.data!.accounts : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load accounts')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [w.activeCompanyId, searchText, showInactive, showAll])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'account') {
        cmp = String(a.account_id || '').localeCompare(String(b.account_id || ''))
      } else {
        cmp = String(a.role || '').localeCompare(String(b.role || ''))
      }
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [rows, sortKey, sortAsc])

  const pageRows = useMemo(() => {
    if (showAll) return sortedRows.filter((x) => String(x.status).toLowerCase() === 'active')
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedRows.slice(start, start + PAGE_SIZE)
  }, [sortedRows, currentPage, showAll])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage(1)
    setDeleteSel({})
  }, [searchText, showInactive, showAll, w.activeCompanyId])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const toggleParam = (key: 'showInactive' | 'showAll', checked: boolean) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (checked) p.set(key, '1')
        else p.delete(key)
        return p
      },
      { replace: true },
    )
  }

  const setSearchTerm = (value: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (value.trim()) p.set('search', value)
        else p.delete('search')
        return p
      },
      { replace: true },
    )
  }

  const postFormToggle = async (url: string, id: number) => {
    const fd = new FormData()
    fd.set('id', String(id))
    const res = await apiFetch(url, { method: 'POST', body: fd })
    const json = (await res.json()) as ApiWrap<unknown>
    if (!json.success) throw new Error(String(json.error || json.message || 'Update failed'))
  }

  const onToggleStatus = async (id: number) => {
    try {
      await postFormToggle('/api/accounts/toggle_account_status_api.php', id)
      setNotice({ msg: 'Status updated', kind: 'ok' })
      void loadAccounts()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Status update failed', kind: 'err' })
    }
  }

  const onTogglePaymentAlert = async (id: number) => {
    try {
      await postFormToggle('/api/accounts/toggle_payment_alert_api.php', id)
      setNotice({ msg: 'Payment alert updated', kind: 'ok' })
      void loadAccounts()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Payment alert update failed', kind: 'err' })
    }
  }

  const selectedIds = Object.entries(deleteSel)
    .filter(([, v]) => v)
    .map(([k]) => Number(k))
    .filter((x) => Number.isFinite(x))

  const onDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} account(s)?`)) return
    try {
      const res = await apiFetch('/api/accounts/delete_accounts_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = (await res.json()) as ApiWrap<{ deleted?: number }>
      if (!json.success) throw new Error(String(json.error || json.message || 'Delete failed'))
      setNotice({ msg: json.message || 'Deleted', kind: 'ok' })
      setDeleteSel({})
      void loadAccounts()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Delete failed', kind: 'err' })
    }
  }

  const canDeleteRow = (r: AccountRow) => String(r.status || '').toLowerCase() === 'inactive'
  const openClassicAccountList = (opts?: { accountId?: number }) => {
    const p = new URLSearchParams()
    p.set('company_id', String(w.activeCompanyId))
    if (searchText.trim()) p.set('search', searchText.trim())
    if (showInactive) p.set('showInactive', '1')
    if (showAll) p.set('showAll', '1')
    if (opts?.accountId) p.set('focus_account_id', String(opts.accountId))
    window.location.href = `/account-list_classic.php?${p.toString()}`
  }

  const companyRow =
    w.groupIds.length > 0 || w.companies.length > 0 ? (
      <>
        {w.groupIds.length > 0 && (
          <div id="group-buttons-wrapper" className="account-company-filter shared-group-wrapper">
            <span className="account-company-label">GroupID:</span>
            <div id="group-buttons-container" className="account-company-buttons">
              {w.groupIds.map((g) => {
                const active =
                  w.selectedGroup != null && String(w.selectedGroup).toUpperCase() === g
                return (
                  <button
                    key={g}
                    type="button"
                    className={
                      active
                        ? 'account-company-btn shared-group-btn active'
                        : 'account-company-btn shared-group-btn'
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
          <div id="company-buttons-wrapper" className="account-company-filter shared-company-wrapper">
            <span className="account-company-label">Company:</span>
            <div id="company-buttons-container" className="account-company-buttons" role="group" aria-label="Company">
              {w.companies.map((c) => {
                const code = String(c.company_id || '').trim()
                if (!code) return null
                const cGid = String(c.group_id || '').trim().toUpperCase()
                const selG = w.selectedGroup != null ? String(w.selectedGroup).toUpperCase() : null
                const visible = selG ? cGid === selG : !cGid
                const isActive = Number(c.id) === Number(w.activeCompanyId)
                return (
                  <button
                    key={c.id}
                    type="button"
                    style={{ display: visible ? undefined : 'none' }}
                    className={
                      isActive
                        ? 'account-company-btn shared-company-btn active'
                        : 'account-company-btn shared-company-btn'
                    }
                    data-company-id={c.id}
                    data-group-id={cGid}
                    data-company-code={code}
                    onClick={() => {
                      w.onPickCompany(c.id)
                      replaceCompanyInUrl(c.id)
                    }}
                  >
                    {code}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </>
    ) : null

  const onSort = (k: 'account' | 'role') => {
    if (sortKey === k) setSortAsc((s) => !s)
    else {
      setSortKey(k)
      setSortAsc(true)
    }
  }

  const statusClass = (status: string) =>
    String(status).toLowerCase() === 'active'
      ? 'account-status-active'
      : 'account-status-inactive'

  if (w.loadCompaniesError) {
    return (
      <div className="container">
        <div className="content">
          <p className="account-page-title">无法加载公司列表</p>
          <button type="button" className="account-btn account-btn-add" onClick={() => w.retryLoadCompanies()}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!w.companiesReady || w.activeCompanyId == null) {
    return (
      <div className="container">
        <div className="content">
          <p className="account-page-title">加载中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="alShell" data-account-list-spa="1">
      <div className="container">
        <div className="content">
          <h1 className="account-page-title">Account List</h1>
          <div className="account-separator-line" />
          <div className="account-action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="account-action-buttons" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="account-btn account-btn-add" onClick={() => openClassicAccountList()}>
                  Add Account
                </button>
                <div className="account-search-container">
                  <svg className="account-search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input type="text" value={searchText} placeholder="Search by Account or Name" className="account-search-input" onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="account-checkbox-section">
                  <input type="checkbox" id="showInactive" checked={showInactive} onChange={(e) => toggleParam('showInactive', e.target.checked)} />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                <div className="account-checkbox-section">
                  <input type="checkbox" id="showAll" checked={showAll} onChange={(e) => toggleParam('showAll', e.target.checked)} />
                  <label htmlFor="showAll">Show All</label>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="account-btn account-btn-setting" onClick={() => openClassicAccountList()}>
                  Currency Setting
                </button>
                <button type="button" className="account-btn account-btn-delete" disabled={selectedIds.length === 0} onClick={() => void onDeleteSelected()}>
                  Delete
                </button>
              </div>
            </div>
            {companyRow}
          </div>

          {notice && (
            <p className={notice.kind === 'ok' ? 'tShell__searchOk' : 'tShell__searchErr'}>
              {notice.msg}
            </p>
          )}
          {err && <p className="tShell__searchErr">{err}</p>}

          <div className="account-table-wrapper" id="accountTableWrapper">
            <div className="account-table-header">
              <div className="account-header-item">No</div>
              <div className="account-header-item account-header-sortable" role="presentation" onClick={() => onSort('account')}>
                Account <span className="account-sort-indicator">{sortKey === 'account' ? (sortAsc ? '▲' : '▼') : ''}</span>
              </div>
              <div className="account-header-item">Name</div>
              <div className="account-header-item account-header-sortable" role="presentation" onClick={() => onSort('role')}>
                Role <span className="account-sort-indicator">{sortKey === 'role' ? (sortAsc ? '▲' : '▼') : ''}</span>
              </div>
              <div className="account-header-item">Alert</div>
              <div className="account-header-item">Status</div>
              <div className="account-header-item">Last Login</div>
              <div className="account-header-item">Remark</div>
              <div className="account-header-item">Action</div>
            </div>
            <div className="account-cards" id="accountTableBody">
              {loading ? (
                <div className="account-card"><div className="account-card-item">Loading...</div></div>
              ) : pageRows.length === 0 ? (
                <div className="account-card"><div className="account-card-item">No account data found</div></div>
              ) : (
                pageRows.map((r, idx) => {
                  const hasAlert =
                    r.payment_alert === 1 || r.payment_alert === true || String(r.payment_alert) === '1'
                  return (
                    <div className="account-card" key={r.id}>
                      <div className="account-card-item">{(currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                      <div className="account-card-item">{String(r.account_id || '').toUpperCase()}</div>
                      <div className="account-card-item">{String(r.name || '').toUpperCase()}</div>
                      <div className="account-card-item">
                        <span className={`account-role-badge account-role-${String(r.role || 'none').toLowerCase().replace(/\s+/g, '-')}`}>
                          {String(r.role || '').toUpperCase() === 'UPLINE' ? 'SUPPLIER' : String(r.role || '').toUpperCase()}
                        </span>
                      </div>
                      <div className="account-card-item">
                        <span className={`account-role-badge ${hasAlert ? 'account-status-active' : 'account-status-inactive'} account-status-clickable`} title="Click to toggle payment alert" onClick={() => void onTogglePaymentAlert(r.id)}>
                          {hasAlert ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <div className="account-card-item">
                        <span className={`account-role-badge ${statusClass(r.status)} account-status-clickable`} title="Click to toggle status" onClick={() => void onToggleStatus(r.id)}>
                          {String(r.status || '').toUpperCase()}
                        </span>
                      </div>
                      <div className="account-card-item">{r.last_login || '-'}</div>
                      <div className="account-card-item">{String(r.remark || '').toUpperCase()}</div>
                      <div className="account-card-item">
                        <button
                          className="account-edit-btn"
                          onClick={() => openClassicAccountList({ accountId: r.id })}
                          aria-label="Edit in classic page"
                          title="Edit in classic page"
                        >
                          <img src="/images/edit.svg" alt="Edit" />
                        </button>
                        {canDeleteRow(r) ? (
                          <input
                            type="checkbox"
                            checked={!!deleteSel[r.id]}
                            onChange={(e) => setDeleteSel((s) => ({ ...s, [r.id]: e.target.checked }))}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {!showAll && (
            <div className="account-pagination-container" id="paginationContainer">
              <button type="button" className="account-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                ◀
              </button>
              <span className="account-pagination-info">{currentPage} of {totalPages}</span>
              <button type="button" className="account-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                ▶
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
