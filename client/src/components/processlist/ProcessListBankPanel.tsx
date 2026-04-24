import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { BankProcessRow } from '../../lib/processListTypes'
import { apiUrl } from '../../lib/api'
import {
  fetchAccountList,
  fetchGetProcess,
  fetchProcessList,
  postAddProcess,
  postDeleteProcesses,
  postUpdateBankRemark,
  postUpdateProcess,
} from '../../lib/processListApi'
import {
  formatContractLabel,
  getContractStateClass,
  isGrayContractActive,
  matchesCurrentBankFilters,
  processMatchesSelectedDate,
  ymdToday,
} from '../../lib/processListBankUtils'
import { BankStatusDropdown } from './BankStatusDropdown'

const PAGE_SIZE = 20

type Props = {
  companyId: number
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

type AccountOpt = { id: number; account_id: string; name?: string; role?: string }

function dashIfEmpty(val: unknown): string {
  if (val == null) return '-'
  const s = String(val).trim()
  return s === '' ? '-' : s
}

export function ProcessListBankPanel({ companyId, onNotice }: Props) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<BankProcessRow[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortAsc, setSortAsc] = useState(true)

  const [showAll, setShowAll] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showOfficial, setShowOfficial] = useState(false)
  const [showEInvoice, setShowEInvoice] = useState(false)
  const [showBlock, setShowBlock] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [bankOpen, setBankOpen] = useState(false)
  const [editBankId, setEditBankId] = useState<number | null>(null)

  const [bCountry, setBCountry] = useState('')
  const [bBank, setBBank] = useState('')
  const [bType, setBType] = useState('')
  const [bName, setBName] = useState('')
  const [bCard, setBCard] = useState<number | ''>('')
  const [bCust, setBCust] = useState<number | ''>('')
  const [bProfitAcc, setBProfitAcc] = useState<number | ''>('')
  const [bContract, setBContract] = useState('')
  const [bInsurance, setBInsurance] = useState('')
  const [bSop, setBSop] = useState('')
  const [bRemark, setBRemark] = useState('')
  const [bCost, setBCost] = useState('')
  const [bPrice, setBPrice] = useState('')
  const [bProfitText, setBProfitText] = useState('')
  const [bProfitShare, setBProfitShare] = useState('')
  const [bDayStart, setBDayStart] = useState('')
  const [bDayEnd, setBDayEnd] = useState('')
  const [bFreq, setBFreq] = useState('1st_of_every_month')
  const [bStatus, setBStatus] = useState('active')

  const [delSel, setDelSel] = useState<Record<number, boolean>>({})

  const [quickRemarkId, setQuickRemarkId] = useState<number | null>(null)
  const [quickRemarkText, setQuickRemarkText] = useState('')

  const todayY = ymdToday()

  useLayoutEffect(() => {
    if (showAll) {
      document.body.classList.add('process-page--bank-show-all')
    } else {
      document.body.classList.remove('process-page--bank-show-all')
    }
    return () => document.body.classList.remove('process-page--bank-show-all')
  }, [showAll])

  useEffect(() => {
    if (!showAll) return
    setShowInactive(false)
    setShowOfficial(false)
    setShowEInvoice(false)
    setShowBlock(false)
  }, [showAll])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchProcessList(companyId, 'Bank', {
        search,
        showInactive: false,
        showAll: true,
        showOfficial: false,
        showEInvoice: false,
        showBlock: false,
      })
      if (r.success) setRows((r.data as BankProcessRow[]) || [])
      else onNotice(r.error, 'err')
    } finally {
      setLoading(false)
    }
  }, [companyId, search, onNotice])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await fetchAccountList(companyId)
      if (alive && r.success) setAccounts((r.data.accounts || []) as AccountOpt[])
    })()
    return () => {
      alive = false
    }
  }, [companyId])

  const filtered = useMemo(() => {
    const opts = {
      showAll,
      showInactive,
      showOfficial,
      showEInvoice,
      showBlock,
      dateFrom,
      dateTo,
    }
    return rows.filter((p) => {
      if (!processMatchesSelectedDate(p, dateFrom, dateTo)) return false
      if (!matchesCurrentBankFilters(p, opts)) return false
      if (waiting) {
        const c = getContractStateClass(
          p.day_start || null,
          p.day_end || null,
          todayY,
        )
        if (c !== 'contract-pending') return false
      }
      return true
    })
  }, [
    rows,
    showAll,
    showInactive,
    showOfficial,
    showEInvoice,
    showBlock,
    dateFrom,
    dateTo,
    waiting,
    todayY,
  ])

  const sorted = useMemo(() => {
    const a = [...filtered]
    a.sort((x, y) => {
      const kx = String(x.card_lower || x.supplier || '')
        .toLowerCase()
      const ky = String(y.card_lower || y.supplier || '')
        .toLowerCase()
      let c = 0
      if (kx < ky) c = -1
      if (kx > ky) c = 1
      if (!sortAsc) c = -c
      return c
    })
    return a
  }, [filtered, sortAsc])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const pageItems = useMemo(() => {
    if (showAll) return sorted
    const s = (page - 1) * PAGE_SIZE
    return sorted.slice(s, s + PAGE_SIZE)
  }, [sorted, page, showAll])
  const startIndex = showAll ? 0 : (page - 1) * PAGE_SIZE

  const resetBankForm = () => {
    setEditBankId(null)
    setBCountry('')
    setBBank('')
    setBType('')
    setBName('')
    setBCard('')
    setBCust('')
    setBProfitAcc('')
    setBContract('')
    setBInsurance('')
    setBSop('')
    setBRemark('')
    setBCost('')
    setBPrice('')
    setBProfitText('')
    setBProfitShare('')
    setBDayStart('')
    setBDayEnd('')
    setBFreq('1st_of_every_month')
    setBStatus('active')
  }

  const openAddBank = () => {
    resetBankForm()
    setBankOpen(true)
  }

  const loadBankToForm = (d: Record<string, unknown>, id: number | null) => {
    setEditBankId(id)
    setBCountry(String(d.country || ''))
    setBBank(String(d.bank || ''))
    setBType(String(d.type || ''))
    setBName(String(d.name || d.process_name || ''))
    setBCard(d.card_merchant_id != null && d.card_merchant_id !== '' ? Number(d.card_merchant_id) : '')
    setBCust(d.customer_id != null && d.customer_id !== '' ? Number(d.customer_id) : '')
    setBProfitAcc(
      d.profit_account_id != null && d.profit_account_id !== '' ? Number(d.profit_account_id) : '',
    )
    setBContract(String(d.contract || ''))
    setBInsurance(d.insurance != null && d.insurance !== '' ? String(d.insurance) : '')
    setBSop(String(d.sop || ''))
    setBRemark(String(d.remark || ''))
    setBCost(d.cost != null && d.cost !== '' ? String(d.cost) : '')
    setBPrice(d.price != null && d.price !== '' ? String(d.price) : '')
    setBProfitText(d.profit != null && d.profit !== '' ? String(d.profit) : '')
    setBProfitShare(String(d.profit_sharing || ''))
    setBDayStart(d.day_start != null ? String(d.day_start).slice(0, 10) : '')
    setBDayEnd(d.day_end != null ? String(d.day_end).slice(0, 10) : '')
    setBFreq(String(d.day_start_frequency || '1st_of_every_month'))
    setBStatus(String(d.status || 'active'))
  }

  const openEditBank = async (id: number) => {
    const g = await fetchGetProcess(id, 'Bank')
    if (!g.success || !g.data) {
      onNotice('Load failed', 'err')
      return
    }
    loadBankToForm(g.data, id)
    setBankOpen(true)
  }

  const submitBank = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bCountry.trim() || !bBank.trim() || !bType.trim() || !bName.trim()) {
      onNotice('Country, Bank, Type and Name are required', 'err')
      return
    }
    const fd = new FormData()
    fd.set('permission', 'Bank')
    if (editBankId != null) fd.set('id', String(editBankId))
    fd.set('country', bCountry.trim())
    fd.set('bank', bBank.trim())
    fd.set('type', bType.trim())
    fd.set('name', bName.trim())
    if (bCard !== '') fd.set('card_merchant_id', String(bCard))
    if (bCust !== '') fd.set('customer_id', String(bCust))
    if (bProfitAcc !== '') fd.set('profit_account_id', String(bProfitAcc))
    fd.set('contract', bContract)
    if (bInsurance !== '') fd.set('insurance', bInsurance)
    fd.set('sop', bSop)
    fd.set('remark', bRemark)
    if (bCost !== '') fd.set('cost', bCost)
    if (bPrice !== '') fd.set('price', bPrice)
    if (bProfitText !== '') fd.set('profit', bProfitText)
    fd.set('profit_sharing', bProfitShare)
    if (bDayStart) fd.set('day_start', bDayStart)
    if (bDayEnd) fd.set('day_end', bDayEnd)
    fd.set('day_start_frequency', bFreq)
    fd.set('status', bStatus)

    if (editBankId == null) {
      const r = await postAddProcess(fd)
      if (r.success) {
        onNotice('Bank process added', 'ok')
        setBankOpen(false)
        void loadList()
      } else onNotice(r.error, 'err')
    } else {
      const r = await postUpdateProcess(fd)
      if (r.success) {
        onNotice('Updated', 'ok')
        setBankOpen(false)
        void loadList()
      } else onNotice(r.error, 'err')
    }
  }

  const toDelete = Object.entries(delSel)
    .filter(([, v]) => v)
    .map(([k]) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))

  const doDelete = async () => {
    if (toDelete.length === 0) {
      onNotice('Select processes', 'err')
      return
    }
    if (!window.confirm(`Delete ${toDelete.length} bank process(es)?`)) return
    const r = await postDeleteProcesses(toDelete, 'Bank')
    if (r.success) {
      onNotice('Deleted', 'ok')
      setDelSel({})
      void loadList()
    } else onNotice(r.error, 'err')
  }

  const showHeaderDeleteCb =
    showInactive || showOfficial || showEInvoice || showBlock

  const openQuickRemark = (p: BankProcessRow) => {
    setQuickRemarkId(p.id)
    setQuickRemarkText(String(p.remark || '').trim())
  }

  const saveQuickRemark = async () => {
    if (quickRemarkId == null) return
    const r = await postUpdateBankRemark(quickRemarkId, quickRemarkText.trim())
    if (r.success) {
      onNotice('Remark updated', 'ok')
      setQuickRemarkId(null)
      void loadList()
    } else onNotice(r.error, 'err')
  }

  const toggleSelectAllBank = (checked: boolean) => {
    setDelSel((prev) => {
      const next = { ...prev }
      pageItems.forEach((p) => {
        const isRealInactive = String(p.status || '').toLowerCase() === 'inactive'
        if (isRealInactive && !p.has_transactions) {
          next[p.id] = checked
        }
      })
      return next
    })
  }

  return (
    <>
      <div className="action-buttons-container" id="processListBankActionBar">
        <div className="action-buttons">
          <div
            className="action-controls-row"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <button type="button" className="btn btn-add" onClick={openAddBank}>
              Add Process
            </button>
            <div className="process-list-date-filter" id="processListDateFilter">
              <span style={{ fontSize: 12, color: '#64748b', marginRight: 6 }}>From (dd/mm/yyyy)</span>
              <input
                type="text"
                className="search-input"
                style={{ maxWidth: 120 }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="dd/mm/yyyy"
                aria-label="Date from"
              />
              <span style={{ fontSize: 12, color: '#64748b', margin: '0 6px' }}>To</span>
              <input
                type="text"
                className="search-input"
                style={{ maxWidth: 120 }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="dd/mm/yyyy"
                aria-label="Date to"
              />
            </div>
            <div className="search-container" style={{ position: 'relative' }}>
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="searchInput"
                aria-label="Search"
              />
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showAllBank"
                checked={showAll}
                onChange={(e) => {
                  setShowAll(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="showAllBank">Show All</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showInactiveBank"
                checked={showInactive}
                onChange={(e) => {
                  setShowInactive(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="showInactiveBank">Inactive</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showOfficialBank"
                checked={showOfficial}
                onChange={(e) => {
                  setShowOfficial(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="showOfficialBank">Official</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showEInvoiceBank"
                checked={showEInvoice}
                onChange={(e) => {
                  setShowEInvoice(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="showEInvoiceBank">E-Invoice</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showBlockBank"
                checked={showBlock}
                onChange={(e) => {
                  setShowBlock(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="showBlockBank">Block</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="waitingBank"
                checked={waiting}
                onChange={(e) => {
                  setWaiting(e.target.checked)
                  setCurrentPage(1)
                }}
              />
              <label htmlFor="waitingBank">Waiting</label>
            </div>
            <button
              type="button"
              className="btn"
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                background: '#fff',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
              onClick={() => {
                setSortAsc((s) => !s)
                setCurrentPage(1)
              }}
            >
              Sort supplier {sortAsc ? '▲' : '▼'}
            </button>
            {loading ? (
              <span style={{ color: '#64748b', fontSize: 13 }}>Loading…</span>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-delete"
            id="processDeleteSelectedBtn"
            onClick={() => void doDelete()}
            disabled={!toDelete.length}
            title="Only inactive processes can be deleted"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="bank-table-wrapper" id="bankTableWrapper">
        <table className="bank-data-table" id="bankTable">
          <thead>
            <tr id="bankTableHeadRow">
              <th className="bank-th-no">No</th>
              <th>Supplier</th>
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
              <th className="bank-th-action bank-action-header">
                Action
                {showHeaderDeleteCb ? (
                  <input
                    type="checkbox"
                    className="header-action-checkbox"
                    title="Select all"
                    aria-label="Select all bank processes for delete"
                    onChange={(e) => toggleSelectAllBank(e.target.checked)}
                  />
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody id="bankTableBody">
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={15} className="bank-empty-cell">
                  No process data found
                </td>
              </tr>
            ) : null}
            {pageItems.map((p, idx) => {
              const cLabel = formatContractLabel(p.contract)
              const baseC = getContractStateClass(
                p.day_start || null,
                p.day_end || null,
                todayY,
              )
              const cClass = isGrayContractActive(cLabel, baseC)
              const isRealInactive = String(p.status || '').toLowerCase() === 'inactive'
              const dateCell =
                p.date != null && String(p.date).trim() !== ''
                  ? String(p.date)
                  : dashIfEmpty(p.day_start)
              return (
                <tr key={p.id} data-id={p.id} data-status={p.status} data-has-transactions={p.has_transactions ? '1' : '0'}>
                  <td className="bank-td-no">{startIndex + idx + 1}</td>
                  <td>{dashIfEmpty(p.supplier)}</td>
                  <td className="bank-td-country">{dashIfEmpty(p.country)}</td>
                  <td>{dashIfEmpty(p.bank)}</td>
                  <td className="bank-td-types">{dashIfEmpty(p.types)}</td>
                  <td className="bank-td-card-owner">{dashIfEmpty(p.card_lower)}</td>
                  <td>
                    {cLabel ? (
                      <span className={`contract-badge ${cClass}`}>{cLabel}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{dashIfEmpty(p.insurance)}</td>
                  <td>{dashIfEmpty(p.customer)}</td>
                  <td>{dashIfEmpty(p.cost)}</td>
                  <td>{dashIfEmpty(p.price)}</td>
                  <td>{dashIfEmpty(p.profit)}</td>
                  <td className="bank-td-status">
                    <BankStatusDropdown
                      process={p}
                      onAfterChange={() => void loadList()}
                      onNotice={onNotice}
                    />
                  </td>
                  <td>{dateCell}</td>
                  <td className="bank-td-action">
                    <div className="bank-action-tools">
                      <button
                        type="button"
                        className="edit-btn"
                        onClick={() => void openEditBank(p.id)}
                        title="Edit"
                        aria-label="Edit"
                      >
                        <img src={apiUrl('/images/edit.svg')} alt="" width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        className="edit-btn remark-action-btn"
                        onClick={() => openQuickRemark(p)}
                        title="Remark"
                        aria-label="Remark"
                      >
                        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
                          <path
                            d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    {isRealInactive ? (
                      <input
                        type="checkbox"
                        className="row-checkbox bank-checkbox"
                        data-id={p.id}
                        style={{ marginLeft: 8 }}
                        disabled={!!p.has_transactions}
                        title={
                          p.has_transactions
                            ? 'Cannot delete: has transactions'
                            : 'Select for deletion'
                        }
                        checked={!!delSel[p.id]}
                        onChange={(e) =>
                          setDelSel((s) => ({ ...s, [p.id]: e.target.checked }))
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!showAll && sorted.length > 0 ? (
        <div className="pagination-container" id="paginationContainer">
          <button
            type="button"
            className="pagination-btn"
            id="prevBtn"
            disabled={page <= 1}
            onClick={() => setCurrentPage((x) => Math.max(1, x - 1))}
            aria-label="Previous page"
          >
            ◀
          </button>
          <span className="pagination-info" id="paginationInfo">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="pagination-btn"
            id="nextBtn"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((x) => Math.min(totalPages, x + 1))}
            aria-label="Next page"
          >
            ▶
          </button>
        </div>
      ) : null}

      {quickRemarkId != null ? (
        <div className="modal" style={{ display: 'block' }} role="dialog" aria-modal>
          <div
            className="modal-content"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Process Remark</h2>
              <span
                className="close"
                onClick={() => setQuickRemarkId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setQuickRemarkId(null)}
              >
                &times;
              </span>
            </div>
            <div className="modal-body">
              <textarea
                className="plInput plInput--ta"
                style={{ width: '100%', minHeight: 100, boxSizing: 'border-box' }}
                value={quickRemarkText}
                onChange={(e) => setQuickRemarkText(e.target.value)}
                placeholder="Enter remark for this process..."
              />
              <div className="plModal__actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => setQuickRemarkId(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-add"
                  onClick={() => void saveQuickRemark()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {bankOpen ? (
        <div className="plModalHost">
          <div
            className="plModalBackdrop"
            onClick={() => {
              setBankOpen(false)
              resetBankForm()
            }}
            role="presentation"
          />
          <div className="plModal plModal--wide plModal--tall">
            <h3 className="plModal__title">
              {editBankId == null ? 'Add Bank Process' : 'Edit Bank Process'}
            </h3>
            <form onSubmit={(e) => void submitBank(e)} className="plModalForm plBankForm">
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Country *</span>
                  <input
                    className="plInput"
                    value={bCountry}
                    onChange={(e) => setBCountry(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Bank *</span>
                  <input
                    className="plInput"
                    value={bBank}
                    onChange={(e) => setBBank(e.target.value)}
                  />
                </label>
              </div>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Type *</span>
                  <input
                    className="plInput"
                    value={bType}
                    onChange={(e) => setBType(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Name (Supplier) *</span>
                  <input
                    className="plInput"
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                  />
                </label>
              </div>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Card merchant (account id)</span>
                  <select
                    className="plInput"
                    value={bCard === '' ? '' : String(bCard)}
                    onChange={(e) =>
                      setBCard(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_id} {a.name ? `[${a.name}]` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="plField">
                  <span className="plField__label">Customer (account id)</span>
                  <select
                    className="plInput"
                    value={bCust === '' ? '' : String(bCust)}
                    onChange={(e) =>
                      setBCust(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={`c-${a.id}`} value={a.id}>
                        {a.account_id} {a.name ? `[${a.name}]` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">Profit account</span>
                <select
                  className="plInput"
                  value={bProfitAcc === '' ? '' : String(bProfitAcc)}
                  onChange={(e) =>
                    setBProfitAcc(e.target.value ? parseInt(e.target.value, 10) : '')
                  }
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={`p-${a.id}`} value={a.id}>
                      {a.account_id} {a.name ? `[${a.name}]` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Contract</span>
                  <input
                    className="plInput"
                    value={bContract}
                    onChange={(e) => setBContract(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Insurance</span>
                  <input
                    className="plInput"
                    value={bInsurance}
                    onChange={(e) => setBInsurance(e.target.value)}
                  />
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">SOP</span>
                <textarea
                  className="plInput plInput--ta"
                  value={bSop}
                  onChange={(e) => setBSop(e.target.value)}
                  rows={2}
                />
              </label>
              <label className="plField">
                <span className="plField__label">Remark</span>
                <textarea
                  className="plInput plInput--ta"
                  value={bRemark}
                  onChange={(e) => setBRemark(e.target.value)}
                  rows={2}
                />
              </label>
              <div className="plRow3">
                <label className="plField">
                  <span className="plField__label">Cost</span>
                  <input
                    className="plInput"
                    value={bCost}
                    onChange={(e) => setBCost(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Price</span>
                  <input
                    className="plInput"
                    value={bPrice}
                    onChange={(e) => setBPrice(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Profit</span>
                  <input
                    className="plInput"
                    value={bProfitText}
                    onChange={(e) => setBProfitText(e.target.value)}
                  />
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">Profit sharing</span>
                <input
                  className="plInput"
                  value={bProfitShare}
                  onChange={(e) => setBProfitShare(e.target.value)}
                />
              </label>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Day start (Y-m-d)</span>
                  <input
                    className="plInput"
                    type="date"
                    value={bDayStart}
                    onChange={(e) => setBDayStart(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Day end (Y-m-d)</span>
                  <input
                    className="plInput"
                    type="date"
                    value={bDayEnd}
                    onChange={(e) => setBDayEnd(e.target.value)}
                  />
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">Day start frequency</span>
                <select
                  className="plInput"
                  value={bFreq}
                  onChange={(e) => setBFreq(e.target.value)}
                >
                  <option value="1st_of_every_month">1st of every month</option>
                  <option value="monthly">monthly</option>
                </select>
              </label>
              {editBankId != null ? (
                <label className="plField">
                  <span className="plField__label">Status</span>
                  <select
                    className="plInput"
                    value={bStatus}
                    onChange={(e) => setBStatus(e.target.value)}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="waiting">waiting</option>
                  </select>
                </label>
              ) : null}
              <div className="plModal__actions">
                <button
                  type="button"
                  className="plBtn"
                  onClick={() => {
                    setBankOpen(false)
                    resetBankForm()
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="plBtn plBtn--primary">
                  {editBankId == null ? 'Add' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
