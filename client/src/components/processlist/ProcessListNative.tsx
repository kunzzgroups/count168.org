import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import { appendCompanyIdToClassicRedirect } from '../../lib/resolvePostLoginRedirect'
import {
  bankContractStateClass,
  bankRowMatchesFilters,
  formatBankContract,
  normalizeBankIssueFlag,
  sortBankBySupplier,
  sortGamesProcesses,
} from '../../lib/bankProcessClientFilter'
import {
  fetchProcessListRows,
  type BankProcessRow,
  type GamesProcessRow,
  type ProcessListPermission,
} from '../../lib/processListApi'
import {
  fetchProcessListCategoriesForCompanyCode,
  type ProcessListCategory,
} from '../../lib/processListCategoryApi'
import { fetchSidebarContext } from '../../lib/fetchSidebarContext'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'

const PAGE_SIZE = 20

type Workspace = ReturnType<typeof useTransactionWorkspace>

type Props = {
  bootstrap: DashboardBootstrapData
  workspace: Workspace
  replaceCompanyInUrl: (companyId: number, companyCode: string) => void
}

function dashCell(v: unknown): string {
  if (v == null) return '—'
  const s = String(v).trim()
  return s === '' ? '—' : s
}

function gamesDisplayRows(
  raw: GamesProcessRow[],
  showAll: boolean,
): GamesProcessRow[] {
  const sorted = sortGamesProcesses(raw)
  if (showAll) {
    return sorted.filter((p) => String(p.status || '').toLowerCase() === 'active')
  }
  return sorted
}

export function ProcessListNative({ bootstrap, workspace: w, replaceCompanyInUrl }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('search') ?? '')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [permCats, setPermCats] = useState<ProcessListCategory[]>([])
  const [permReady, setPermReady] = useState(false)
  const [rows, setRows] = useState<(GamesProcessRow | BankProcessRow)[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'err'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [page, setPage] = useState(1)
  const [bankSort, setBankSort] = useState<'asc' | 'desc'>('asc')

  const rawCompanyId = searchParams.get('company_id')
  const urlCompanyId = rawCompanyId ? parseInt(rawCompanyId, 10) : NaN
  const effectiveCompanyId = Number.isFinite(urlCompanyId)
    ? urlCompanyId
    : w.activeCompanyId

  const activeRow = useMemo(
    () => w.companies.find((c) => Number(c.id) === Number(effectiveCompanyId)),
    [w.companies, effectiveCompanyId],
  )
  const companyCode = activeRow ? String(activeRow.company_id || '').trim() : ''

  const urlCatRaw = searchParams.get('category')?.toLowerCase()
  const urlCategory: ProcessListPermission =
    urlCatRaw === 'bank' ? 'Bank' : 'Games'

  const showAll = searchParams.has('showAll')
  const showInactive = searchParams.has('showInactive')
  const showOfficial = searchParams.has('showOfficial')
  const showEInvoice = searchParams.has('showEInvoice')
  const showBlock = searchParams.has('showBlock')
  const searchQ = searchParams.get('search') ?? ''

  const resolvedCategory: ProcessListPermission = useMemo(() => {
    if (permCats.length === 0) return urlCategory
    if (urlCategory === 'Bank' && permCats.includes('Bank')) return 'Bank'
    if (urlCategory === 'Games' && permCats.includes('Games')) return 'Games'
    if (permCats.includes('Games')) return 'Games'
    if (permCats.includes('Bank')) return 'Bank'
    return urlCategory
  }, [permCats, urlCategory])

  const pageTitle = resolvedCategory === 'Bank' ? 'Bank Process List' : 'Process List'

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  /** 拉取公司 Games/Bank 权限 */
  useEffect(() => {
    let alive = true
    setPermReady(false)
    void (async () => {
      if (!companyCode) {
        if (!alive) return
        setPermCats([])
        setPermReady(true)
        return
      }
      const list = await fetchProcessListCategoriesForCompanyCode(companyCode)
      if (!alive) return
      setPermCats(list)
      setPermReady(true)
    })()
    return () => {
      alive = false
    }
  }, [companyCode])

  /** URL category 与公司权限不一致时纠正 */
  useEffect(() => {
    if (permCats.length === 0) return
    if (permCats.includes(urlCategory)) return
    const next = permCats.includes('Games')
      ? 'Games'
      : permCats.includes('Bank')
        ? 'Bank'
        : 'Games'
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('category', next)
        return p
      },
      { replace: true },
    )
  }, [permCats, urlCategory, setSearchParams])

  /** category 写入 localStorage + 侧栏 */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ctx = await fetchSidebarContext()
      if (cancelled || !ctx) return
      const code = companyCode.trim().toUpperCase()
      if (code) {
        try {
          localStorage.setItem(`selectedPermission_${code}`, resolvedCategory)
        } catch {
          /* ignore */
        }
      }
      if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
        window.updateSidebarDataCaptureVisibility(ctx.companyHasGambling, ctx.companyHasBank)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolvedCategory, companyCode])

  /** 搜索框 debounce → URL */
  useEffect(() => {
    setSearchDraft(searchQ)
  }, [searchQ])

  const commitSearchToUrl = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const t = q.trim()
          if (t) p.set('search', t)
          else p.delete('search')
          return p
        },
        { replace: true },
      )
      setPage(1)
    },
    [setSearchParams],
  )

  const onSearchChange = (v: string) => {
    setSearchDraft(v)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      commitSearchToUrl(v)
    }, 350)
  }

  /** 列表请求 */
  useEffect(() => {
    if (!permReady) return
    if (effectiveCompanyId == null || !Number.isFinite(Number(effectiveCompanyId))) return
    let cancelled = false
    setLoadState('loading')
    setErrorMessage('')
    void (async () => {
      const res = await fetchProcessListRows(Number(effectiveCompanyId), resolvedCategory, {
        search: searchQ,
        showInactive,
        showAll,
        showOfficial,
        showEInvoice,
        showBlock,
      })
      if (cancelled) return
      if (!res.ok) {
        setRows([])
        setLoadState('err')
        setErrorMessage(res.message)
        return
      }
      setRows(res.rows)
      setLoadState('idle')
      setPage(1)
    })()
    return () => {
      cancelled = true
    }
  }, [
    effectiveCompanyId,
    resolvedCategory,
    searchQ,
    showInactive,
    showAll,
    showOfficial,
    showEInvoice,
    showBlock,
    permReady,
  ])

  const gamesPrepared = useMemo(() => {
    if (resolvedCategory !== 'Games') return []
    return gamesDisplayRows(rows as GamesProcessRow[], showAll)
  }, [resolvedCategory, rows, showAll])

  const bankPrepared = useMemo(() => {
    if (resolvedCategory !== 'Bank') return []
    const filtered = (rows as BankProcessRow[]).filter((p) =>
      bankRowMatchesFilters(p, {
        showAll,
        showInactive,
        showOfficial,
        showEInvoice,
        showBlock,
      }),
    )
    return sortBankBySupplier(filtered, bankSort)
  }, [resolvedCategory, rows, showAll, showInactive, showOfficial, showEInvoice, showBlock, bankSort])

  const totalPages = useMemo(() => {
    const n =
      resolvedCategory === 'Games'
        ? gamesPrepared.length
        : bankPrepared.length
    if (showAll) return 1
    return Math.max(1, Math.ceil(n / PAGE_SIZE))
  }, [resolvedCategory, gamesPrepared.length, bankPrepared.length, showAll])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageSlice = useMemo(() => {
    if (showAll) {
      return resolvedCategory === 'Games'
        ? gamesPrepared
        : bankPrepared
    }
    const list = resolvedCategory === 'Games' ? gamesPrepared : bankPrepared
    const start = (page - 1) * PAGE_SIZE
    return list.slice(start, start + PAGE_SIZE)
  }, [showAll, resolvedCategory, gamesPrepared, bankPrepared, page])

  const toggleUrlFlag = (key: string, on: boolean) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (on) p.set(key, '1')
        else p.delete(key)
        return p
      },
      { replace: true },
    )
    setPage(1)
  }

  const setCategory = (cat: ProcessListPermission) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('category', cat)
        return p
      },
      { replace: true },
    )
    setPage(1)
    const code = companyCode.trim().toUpperCase()
    if (code) {
      try {
        localStorage.setItem(`selectedPermission_${code}`, cat)
      } catch {
        /* ignore */
      }
    }
  }

  const classicHref = appendCompanyIdToClassicRedirect(
    'processlist_classic.php',
    effectiveCompanyId ?? bootstrap.companyId,
  )

  const showCategoryTabs = permCats.includes('Games') && permCats.includes('Bank')

  useLayoutEffect(() => {
    if (showAll && resolvedCategory === 'Games') {
      document.body.classList.add('process-page--show-all')
    } else {
      document.body.classList.remove('process-page--show-all')
    }
    if (showAll && resolvedCategory === 'Bank') {
      document.body.classList.add('process-page--bank-show-all')
    } else {
      document.body.classList.remove('process-page--bank-show-all')
    }
  }, [showAll, resolvedCategory])

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
                      replaceCompanyInUrl(c.id, code)
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

  const gamesHeaderStyle: CSSProperties =
    resolvedCategory === 'Games'
      ? {
          display: 'grid',
          gridTemplateColumns: '0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr',
        }
      : { display: 'none' }

  const bankWrapStyle: CSSProperties =
    resolvedCategory === 'Bank' ? {} : { display: 'none' }

  const gamesWrapStyle: CSSProperties =
    resolvedCategory === 'Games' ? {} : { display: 'none' }

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
            <h1 className="page-title" style={{ margin: 0 }}>
              {pageTitle}
            </h1>
            {showCategoryTabs ? (
              <div
                className="process-company-filter process-permission-filter-header"
                style={{ display: 'flex' }}
              >
                <span className="process-company-label">Category:</span>
                <div className="process-company-buttons">
                  {permCats.includes('Games') && (
                    <button
                      type="button"
                      className={
                        resolvedCategory === 'Games'
                          ? 'process-company-btn active'
                          : 'process-company-btn'
                      }
                      onClick={() => setCategory('Games')}
                    >
                      Games
                    </button>
                  )}
                  {permCats.includes('Bank') && (
                    <button
                      type="button"
                      className={
                        resolvedCategory === 'Bank'
                          ? 'process-company-btn active'
                          : 'process-company-btn'
                      }
                      onClick={() => setCategory('Bank')}
                    >
                      Bank
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="separator-line" />

          <div className="action-buttons-container">
            <div className="action-buttons">
              <div
                className="action-controls-row"
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
              >
                <a className="btn btn-add" href={classicHref}>
                  Add Process
                </a>
                <div className="search-container">
                  <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search"
                    className="search-input"
                    value={searchDraft}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                </div>
                <div className="checkbox-section">
                  <input
                    type="checkbox"
                    id="showAll"
                    checked={showAll}
                    onChange={(e) => toggleUrlFlag('showAll', e.target.checked)}
                  />
                  <label htmlFor="showAll">Show All</label>
                </div>
                <div className="checkbox-section">
                  <input
                    type="checkbox"
                    id="showInactive"
                    checked={showInactive}
                    onChange={(e) => toggleUrlFlag('showInactive', e.target.checked)}
                  />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                {resolvedCategory === 'Bank' ? (
                  <div
                    className="process-list-bank-only-filters"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                  >
                    <div className="checkbox-section">
                      <input
                        type="checkbox"
                        id="showOfficial"
                        checked={showOfficial}
                        onChange={(e) => toggleUrlFlag('showOfficial', e.target.checked)}
                      />
                      <label htmlFor="showOfficial">Show Official</label>
                    </div>
                    <div className="checkbox-section">
                      <input
                        type="checkbox"
                        id="showEInvoice"
                        checked={showEInvoice}
                        onChange={(e) => toggleUrlFlag('showEInvoice', e.target.checked)}
                      />
                      <label htmlFor="showEInvoice">Show E-Invoice</label>
                    </div>
                    <div className="checkbox-section">
                      <input
                        type="checkbox"
                        id="showBlock"
                        checked={showBlock}
                        onChange={(e) => toggleUrlFlag('showBlock', e.target.checked)}
                      />
                      <label htmlFor="showBlock">Show Block</label>
                    </div>
                  </div>
                ) : null}
              </div>
              <a
                className="btn btn-delete"
                href={classicHref}
                title="Delete and bulk actions are available in the classic Process List page"
              >
                Delete
              </a>
            </div>
            {companyRow}
          </div>

          <div className="process-table-wrapper" id="processTableWrapper" style={gamesWrapStyle}>
            <div className="table-header" id="tableHeader" style={gamesHeaderStyle}>
              <div className="header-item gambling-header">No</div>
              <div className="header-item gambling-header">Process ID</div>
              <div className="header-item gambling-header">Description</div>
              <div className="header-item gambling-header">Status</div>
              <div className="header-item gambling-header">Currency</div>
              <div className="header-item gambling-header">Day Use</div>
              <div className="header-item gambling-header">Action</div>
            </div>
            <div className="process-cards" id="processTableBody">
              {loadState === 'loading' && (
                <div className="process-card">
                  <div className="card-item" style={{ gridColumn: '1 / -1', padding: 20 }}>
                    Loading…
                  </div>
                </div>
              )}
              {loadState === 'err' && (
                <div className="process-card">
                  <div
                    className="card-item"
                    style={{ gridColumn: '1 / -1', padding: 20, color: '#c00' }}
                  >
                    {errorMessage}
                  </div>
                </div>
              )}
              {loadState === 'idle' &&
                resolvedCategory === 'Games' &&
                pageSlice.length === 0 && (
                  <div className="process-card">
                    <div className="card-item" style={{ gridColumn: '1 / -1', padding: 20 }}>
                      No process data found
                    </div>
                  </div>
                )}
              {loadState === 'idle' &&
                resolvedCategory === 'Games' &&
                (pageSlice as GamesProcessRow[]).map((process, idx) => {
                  const globalIdx = showAll
                    ? idx
                    : (page - 1) * PAGE_SIZE + idx
                  const statusClass =
                    String(process.status || '').toLowerCase() === 'active'
                      ? 'status-active'
                      : 'status-inactive'
                  return (
                    <div
                      key={process.id}
                      className="process-card"
                      data-id={process.id}
                      style={{
                        gridTemplateColumns: '0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr',
                      }}
                    >
                      <div className="card-item">{globalIdx + 1}</div>
                      <div className="card-item">
                        {String(process.process_name || '').toUpperCase()}
                      </div>
                      <div className="card-item">
                        {String(process.description || '').toUpperCase()}
                      </div>
                      <div className="card-item">
                        <span className={`role-badge ${statusClass}`}>
                          {String(process.status || '').toUpperCase()}
                        </span>
                      </div>
                      <div className="card-item">{dashCell(process.currency)}</div>
                      <div className="card-item">{dashCell(process.day_use)}</div>
                      <div className="card-item">
                        <a
                          className="edit-btn"
                          href={classicHref}
                          aria-label="Edit in classic"
                          title="Edit in classic version"
                        >
                          <img src={apiUrl('/images/edit.svg')} alt="" />
                        </a>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="bank-table-wrapper" id="bankTableWrapper" style={bankWrapStyle}>
            <table id="bankTable" className="bank-data-table">
              <thead>
                <tr>
                  <th className="bank-th-no">No</th>
                  <th className="bank-th-supplier bank-th-sortable">
                    <button
                      type="button"
                      onClick={() => setBankSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        font: 'inherit',
                        padding: 0,
                        color: 'inherit',
                      }}
                    >
                      Supplier {bankSort === 'asc' ? '▲' : '▼'}
                    </button>
                  </th>
                  <th className="bank-th-country">Country</th>
                  <th>Bank</th>
                  <th className="bank-th-types">Types</th>
                  <th className="bank-th-card-owner">Card Owner</th>
                  <th>Contract</th>
                  <th>Insurance</th>
                  <th>Customer</th>
                  <th>Cost</th>
                  <th>Price</th>
                  <th>Profit</th>
                  <th className="bank-th-status">Status</th>
                  <th>Date</th>
                  <th className="bank-th-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadState === 'loading' && (
                  <tr>
                    <td colSpan={15} className="bank-empty-cell">
                      Loading…
                    </td>
                  </tr>
                )}
                {loadState === 'err' && (
                  <tr>
                    <td colSpan={15} className="bank-empty-cell" style={{ color: '#c00' }}>
                      {errorMessage}
                    </td>
                  </tr>
                )}
                {loadState === 'idle' &&
                  resolvedCategory === 'Bank' &&
                  pageSlice.length === 0 && (
                    <tr>
                      <td colSpan={15} className="bank-empty-cell">
                        No process data found
                      </td>
                    </tr>
                  )}
                {loadState === 'idle' &&
                  resolvedCategory === 'Bank' &&
                  (pageSlice as BankProcessRow[]).map((process, idx) => {
                    const globalIdx = showAll
                      ? idx
                      : (page - 1) * PAGE_SIZE + idx
                    const contract = formatBankContract(process.contract)
                    const cClass = bankContractStateClass(
                      process.day_start ?? process.date,
                      process.day_end,
                    )
                    const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS']
                    const contractClass =
                      grayContracts.includes(contract) && cClass === 'contract-active'
                        ? 'contract-1month-active'
                        : cClass
                    const iflag = normalizeBankIssueFlag(process.issue_flag)
                    const statusLabel =
                      iflag === 'official'
                        ? 'OFFICIAL'
                        : iflag === 'e_invoice'
                          ? 'E-INVOICE'
                          : iflag === 'block'
                            ? 'BLOCK'
                            : String(process.status || '').toUpperCase()
                    const stLow = String(process.status || '').toLowerCase()
                    const statusBadgeClass =
                      iflag === 'official' || iflag === 'e_invoice' || iflag === 'block'
                        ? 'status-inactive'
                        : stLow === 'active'
                          ? 'status-active'
                          : 'status-inactive'
                    return (
                      <tr key={process.id} data-id={process.id}>
                        <td>{globalIdx + 1}</td>
                        <td>{dashCell(process.supplier)}</td>
                        <td>{dashCell(process.country)}</td>
                        <td>{dashCell(process.bank)}</td>
                        <td>{dashCell(process.types)}</td>
                        <td>{dashCell(process.card_lower)}</td>
                        <td>
                          {contract ? (
                            <span className={`contract-badge ${contractClass}`}>{contract}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{dashCell(process.insurance)}</td>
                        <td>{dashCell(process.customer)}</td>
                        <td>{dashCell(process.cost)}</td>
                        <td>{dashCell(process.price)}</td>
                        <td>{dashCell(process.profit)}</td>
                        <td>
                          <span className={`role-badge ${statusBadgeClass}`}>{statusLabel}</span>
                        </td>
                        <td>{dashCell(process.date ?? process.day_start)}</td>
                        <td>
                          <a
                            className="edit-btn"
                            href={classicHref}
                            aria-label="Edit in classic"
                            title="Edit in classic version"
                          >
                            <img src={apiUrl('/images/edit.svg')} alt="" />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <div className="pagination-container" id="paginationContainer">
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1 || showAll}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>
            <span className="pagination-info">
              {totalPages === 0 ? 0 : page} of {totalPages}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages || showAll}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
