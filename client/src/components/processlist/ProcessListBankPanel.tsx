import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BankProcessRow } from '../../lib/processListTypes'
import { BANK_STATUS_OPTIONS } from '../../lib/processListTypes'
import {
  fetchAccountList,
  fetchGetProcess,
  fetchProcessList,
  postAddProcess,
  postDeleteProcesses,
  postToggleProcessStatus,
  postUpdateBankIssueFlag,
  postUpdateProcess,
} from '../../lib/processListApi'
import {
  formatContractLabel,
  getBankStatusSelectValue,
  getContractStateClass,
  isGrayContractActive,
  matchesCurrentBankFilters,
  normalizeBankIssueFlag,
  processMatchesSelectedDate,
  ymdToday,
} from '../../lib/processListBankUtils'

const PAGE_SIZE = 20

type Props = {
  companyId: number
  search: string
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

type AccountOpt = { id: number; account_id: string; name?: string; role?: string }

export function ProcessListBankPanel({ companyId, search, onNotice }: Props) {
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

  const todayY = ymdToday()

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

  const onBankStatusSelect = async (p: BankProcessRow, newVal: string) => {
    const v = newVal.toLowerCase()
    const prevSel = getBankStatusSelectValue(p)
    if (v === prevSel) return

    if (v === 'official' || v === 'e_invoice' || v === 'block') {
      const r = await postUpdateBankIssueFlag(p.id, v)
      if (r.success) {
        onNotice('Status updated', 'ok')
        void loadList()
      } else onNotice(r.error, 'err')
      return
    }

    if (v !== 'active' && v !== 'inactive') return

    const st = String(p.status || '').toLowerCase()
    const hasIssue = !!normalizeBankIssueFlag(p.issue_flag)
    // 与 `handleBankStatusSelectChange`：已是 active/ inactive 但仅清 issue 旗标
    if (v === 'active' && st === 'active' && hasIssue) {
      const r = await postUpdateBankIssueFlag(p.id, '')
      if (r.success) {
        onNotice('Updated', 'ok')
        void loadList()
      } else onNotice(r.error, 'err')
      return
    }
    if (v === 'inactive' && st === 'inactive' && hasIssue) {
      const r = await postUpdateBankIssueFlag(p.id, '')
      if (r.success) {
        onNotice('Updated', 'ok')
        void loadList()
      } else onNotice(r.error, 'err')
      return
    }

    if (!window.confirm(v === 'inactive' ? 'Switch to Inactive?' : 'Switch to Active?')) return
    const t = await postToggleProcessStatus(p.id, 'Bank')
    if (!t.success) {
      onNotice(t.error, 'err')
      return
    }
    try {
      await postUpdateBankIssueFlag(p.id, '')
    } catch {
      /* ignore: 与经典 confirmInactive 后清旗标 */
    }
    onNotice('Status updated', 'ok')
    void loadList()
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

  return (
    <div className="plBank">
      <div className="plBank__filters">
        <label className="plCheck">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => {
              setShowAll(e.target.checked)
              setCurrentPage(1)
            }}
          />{' '}
          Show all (no pager)
        </label>
        <label className="plCheck">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => {
              setShowInactive(e.target.checked)
              setCurrentPage(1)
            }}
          />
          Inactive
        </label>
        <label className="plCheck">
          <input
            type="checkbox"
            checked={showOfficial}
            onChange={(e) => {
              setShowOfficial(e.target.checked)
              setCurrentPage(1)
            }}
          />
          Official
        </label>
        <label className="plCheck">
          <input
            type="checkbox"
            checked={showEInvoice}
            onChange={(e) => {
              setShowEInvoice(e.target.checked)
              setCurrentPage(1)
            }}
          />
          E-Invoice
        </label>
        <label className="plCheck">
          <input
            type="checkbox"
            checked={showBlock}
            onChange={(e) => {
              setShowBlock(e.target.checked)
              setCurrentPage(1)
            }}
          />
          Block
        </label>
        <label className="plCheck">
          <input
            type="checkbox"
            checked={waiting}
            onChange={(e) => {
              setWaiting(e.target.checked)
              setCurrentPage(1)
            }}
          />
          Waiting
        </label>
        <div className="plBank__dates">
          <label>
            From (dd/mm/yyyy)
            <input
              className="plInput plInput--sm"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setCurrentPage(1)
              }}
            />
          </label>
          <label>
            To
            <input
              className="plInput plInput--sm"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setCurrentPage(1)
              }}
            />
          </label>
        </div>
      </div>

      <div className="plBank__toolbar">
        <button type="button" className="plBtn plBtn--primary" onClick={openAddBank}>
          Add
        </button>
        <button type="button" className="plBtn" onClick={() => void doDelete()} disabled={!toDelete.length}>
          Delete
        </button>
        <button
          type="button"
          className="plBtn"
          onClick={() => {
            setSortAsc((s) => !s)
            setCurrentPage(1)
          }}
        >
          Sort supplier {sortAsc ? '▲' : '▼'}
        </button>
        {loading ? <span>Loading…</span> : null}
      </div>

      <div className="plBank__scroll">
        <table className="plBank__table">
          <thead>
            <tr>
              <th>No</th>
              <th>Supplier</th>
              <th>Country</th>
              <th>Bank</th>
              <th>Types</th>
              <th>Card Owner</th>
              <th>Contract</th>
              <th>Insurance</th>
              <th>Customer</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Profit</th>
              <th>Status</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={15} className="plBank__empty">
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
              const sel = getBankStatusSelectValue(p)
              const isRealInactive = String(p.status || '').toLowerCase() === 'inactive'
              return (
                <tr key={p.id} data-id={p.id}>
                  <td>{startIndex + idx + 1}</td>
                  <td>{(p.supplier || '-').toString()}</td>
                  <td>{p.country || '-'}</td>
                  <td>{p.bank || '-'}</td>
                  <td>{p.types || '-'}</td>
                  <td>{p.card_lower || '-'}</td>
                  <td>
                    {cLabel ? (
                      <span className={`contract-badge ${cClass}`}>{cLabel}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{p.insurance ?? '-'}</td>
                  <td>{p.customer || '-'}</td>
                  <td>{p.cost ?? '-'}</td>
                  <td>{p.price ?? '-'}</td>
                  <td>{p.profit ?? '-'}</td>
                  <td>
                    <select
                      className={'plBank__status ' + (sel || 'active')}
                      value={sel}
                      onChange={(e) => void onBankStatusSelect(p, e.target.value)}
                    >
                      {BANK_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {p.date != null && String(p.date).trim() !== ''
                      ? String(p.date)
                      : p.day_start || '-'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="plBtn plBtn--sm"
                      onClick={() => void openEditBank(p.id)}
                    >
                      Edit
                    </button>
                    {isRealInactive ? (
                      <input
                        type="checkbox"
                        className="row-checkbox bank-checkbox"
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
        <div className="plPager">
          <button
            type="button"
            className="plBtn"
            disabled={page <= 1}
            onClick={() => setCurrentPage((x) => Math.max(1, x - 1))}
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="plBtn"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((x) => Math.min(totalPages, x + 1))}
          >
            Next
          </button>
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
    </div>
  )
}
