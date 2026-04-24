import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { BankProcessRow } from '../../lib/processListTypes'
import { apiUrl } from '../../lib/api'
import {
  BANK_FORM_ACCOUNT_ROLES,
  fetchAccountList,
  fetchBankCountryDropdown,
  fetchGetProcess,
  fetchProcessList,
  fetchSelectedBanksByCountry,
  postAddProcess,
  postDeleteProcesses,
  postUpdateBankRemark,
  postUpdateProcess,
} from '../../lib/processListApi'
import {
  formatContractLabel,
  getContractStateClass,
  isBankInactiveLike,
  isGrayContractActive,
  matchesCurrentBankFilters,
  parseProfitSharingString,
  type ProfitSharingEntry,
  processMatchesSelectedDate,
  serializeProfitSharingEntries,
  ymdToday,
} from '../../lib/processListBankUtils'
import type { ProcessListWorkspacePick } from './processListWorkspacePick'
import { BankResendAccountingDueModal } from './BankResendAccountingDueModal'
import { BankAccountCustomSelect } from './BankAccountCustomSelect'
import { BankListSelectionModal, BankCountrySelectionModal } from './BankRegionalModals'
import { BankProfitSharingModal } from './BankProfitSharingModal'
import { BankStatusDropdown } from './BankStatusDropdown'
import { ProcessListCompanyGroupFilters } from './ProcessListCompanyGroupFilters'

const PAGE_SIZE = 20

type Props = {
  companyId: number
  onNotice: (msg: string, kind: 'ok' | 'err') => void
  workspace: ProcessListWorkspacePick
}

type AccountOpt = { id: number; account_id: string; name?: string; role?: string }

const BANK_CONTRACT_OPTIONS = [
  '1 MONTH',
  '2 MONTHS',
  '3 MONTHS',
  '6 MONTHS',
  '1+1',
  '1+2',
  '1+3',
] as const

function dashIfEmpty(val: unknown): string {
  if (val == null) return '-'
  const s = String(val).trim()
  return s === '' ? '-' : s
}

function dmyToIso(v: string): string {
  const t = String(v || '').trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (!m) return ''
  const dd = m[1]!.padStart(2, '0')
  const mm = m[2]!.padStart(2, '0')
  const yy = m[3]!
  return `${yy}-${mm}-${dd}`
}

function isoToDmy(v: string): string {
  const t = String(v || '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return ''
  return `${m[3]!}/${m[2]!}/${m[1]!}`
}

export function ProcessListBankPanel({ companyId, onNotice, workspace }: Props) {
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
  const [dateOpen, setDateOpen] = useState(false)
  const [dateDraftFrom, setDateDraftFrom] = useState('')
  const [dateDraftTo, setDateDraftTo] = useState('')

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
  const [bDayStart, setBDayStart] = useState('')
  const [bDayEnd, setBDayEnd] = useState('')
  const [bFreq, setBFreq] = useState('1st_of_every_month')
  const [bStatus, setBStatus] = useState('active')

  const [delSel, setDelSel] = useState<Record<number, boolean>>({})

  const [quickRemarkId, setQuickRemarkId] = useState<number | null>(null)
  const [quickRemarkText, setQuickRemarkText] = useState('')

  const [resendRow, setResendRow] = useState<BankProcessRow | null>(null)

  const [bankNoteModal, setBankNoteModal] = useState<'sop' | 'remark' | null>(null)
  const [bankNoteDraft, setBankNoteDraft] = useState('')

  const [countryOptions, setCountryOptions] = useState<string[]>([])
  const [banksByCountryMap, setBanksByCountryMap] = useState<Record<string, string[]>>({})
  const [countryPickModal, setCountryPickModal] = useState(false)
  const [bankPickModal, setBankPickModal] = useState(false)
  const [profitPickModal, setProfitPickModal] = useState(false)
  const [profitSharingEntries, setProfitSharingEntries] = useState<ProfitSharingEntry[]>([])
  const [accountDropdownGate, setAccountDropdownGate] = useState<string | null>(null)

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

  useEffect(() => {
    setDateDraftFrom(dateFrom)
    setDateDraftTo(dateTo)
  }, [dateFrom, dateTo])

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
    const onRefresh = () => void loadList()
    window.addEventListener('c168:bank-accounting-due-updated', onRefresh)
    return () => window.removeEventListener('c168:bank-accounting-due-updated', onRefresh)
  }, [loadList])

  useEffect(() => {
    if (!bankOpen) return
    const preserveCo = bCountry.trim()
    const preserveBk = bBank.trim()
    let alive = true
    void (async () => {
      const [c, b, a] = await Promise.all([
        fetchBankCountryDropdown(companyId),
        fetchSelectedBanksByCountry(companyId),
        fetchAccountList(companyId, { roles: BANK_FORM_ACCOUNT_ROLES }),
      ])
      if (!alive) return
      if (c.success) {
        const merged = new Set(c.data)
        if (preserveCo) merged.add(preserveCo)
        setCountryOptions([...merged].sort((x, y) => x.localeCompare(y)))
      }
      if (b.success) {
        const map: Record<string, string[]> = { ...b.data }
        if (preserveCo && preserveBk) {
          const cur = map[preserveCo] || []
          if (!cur.includes(preserveBk)) {
            map[preserveCo] = [...cur, preserveBk].sort((x, y) => x.localeCompare(y))
          }
        }
        setBanksByCountryMap(map)
      }
      if (a.success) setAccounts((a.data.accounts || []) as AccountOpt[])
    })()
    return () => {
      alive = false
    }
  }, [bankOpen, companyId])

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

  const bankRowOptions = useMemo(() => {
    const c = bCountry.trim()
    const raw = (c ? banksByCountryMap[c] : undefined) || []
    const uniq = new Set(raw.map((x) => String(x).trim()).filter(Boolean))
    const bk = bBank.trim()
    if (bk) uniq.add(bk)
    return [...uniq].sort((a, b) => a.localeCompare(b))
  }, [banksByCountryMap, bCountry, bBank])

  const grossProfit = useMemo(() => {
    const cost = parseFloat(bCost) || 0
    const price = parseFloat(bPrice) || 0
    return price - cost
  }, [bCost, bPrice])

  const profitSharingSum = useMemo(
    () =>
      profitSharingEntries.reduce((s, e) => {
        const n = parseFloat(e.amount)
        return s + (Number.isFinite(n) ? n : 0)
      }, 0),
    [profitSharingEntries],
  )

  const displayedNetProfit = Math.max(0, grossProfit - profitSharingSum).toFixed(2)

  useEffect(() => {
    const opts = banksByCountryMap[bCountry.trim()] || []
    if (opts.length === 0) return
    const bk = bBank.trim()
    if (bk && !opts.includes(bk)) setBBank('')
  }, [bCountry, banksByCountryMap, bBank])

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
    setProfitSharingEntries([])
    setBDayStart('')
    setBDayEnd('')
    setBFreq('1st_of_every_month')
    setBStatus('active')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (profitPickModal) {
        setProfitPickModal(false)
        return
      }
      if (bankPickModal) {
        setBankPickModal(false)
        return
      }
      if (countryPickModal) {
        setCountryPickModal(false)
        return
      }
      if (bankNoteModal) {
        setBankNoteModal(null)
        return
      }
      if (bankOpen) {
        setBankOpen(false)
        resetBankForm()
      }
    }
    if (
      bankOpen ||
      bankNoteModal ||
      countryPickModal ||
      bankPickModal ||
      profitPickModal
    ) {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
    return undefined
  }, [bankOpen, bankNoteModal, countryPickModal, bankPickModal, profitPickModal])

  const openBankNote = (kind: 'sop' | 'remark') => {
    setBankNoteDraft(kind === 'sop' ? bSop : bRemark)
    setBankNoteModal(kind)
  }

  const saveBankNoteAndClose = () => {
    if (bankNoteModal === 'sop') setBSop(bankNoteDraft)
    if (bankNoteModal === 'remark') setBRemark(bankNoteDraft)
    setBankNoteModal(null)
  }

  const closeBankModal = () => {
    setBankOpen(false)
    setBankNoteModal(null)
    setCountryPickModal(false)
    setBankPickModal(false)
    setProfitPickModal(false)
    setAccountDropdownGate(null)
    resetBankForm()
  }

  const openAddBank = () => {
    resetBankForm()
    setBankOpen(true)
  }

  const loadBankToForm = (d: Record<string, unknown>, id: number | null) => {
    setEditBankId(id)
    setBCountry(String(d.country || ''))
    setBBank(String(d.bank || ''))
    {
      const t = String(d.type || '')
      const tu = t.toUpperCase()
      setBType(['PERSONAL', 'ENTERPRISE', 'BUSINESS'].includes(tu) ? tu : t)
    }
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
    setProfitSharingEntries(parseProfitSharingString(d.profit_sharing))
    setBDayStart(d.day_start != null ? String(d.day_start).slice(0, 10) : '')
    setBDayEnd(d.day_end != null ? String(d.day_end).slice(0, 10) : '')
    setBFreq(String(d.day_start_frequency || '1st_of_every_month'))
    setBStatus(String(d.status || 'active'))
    const co = String(d.country || '').trim()
    const bk = String(d.bank || '').trim()
    if (co) {
      setCountryOptions((prev) =>
        prev.includes(co) ? prev : [...prev, co].sort((a, b) => a.localeCompare(b)),
      )
    }
    if (co && bk) {
      setBanksByCountryMap((prev) => {
        const cur = prev[co] || []
        if (cur.includes(bk)) return prev
        return { ...prev, [co]: [...cur, bk].sort((a, b) => a.localeCompare(b)) }
      })
    }
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
    if (editBankId == null && !bContract.trim()) {
      onNotice('Please select a contract', 'err')
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
    const gross = (parseFloat(bPrice) || 0) - (parseFloat(bCost) || 0)
    fd.set('profit', gross.toFixed(2))
    fd.set('profit_sharing', serializeProfitSharingEntries(profitSharingEntries))
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

  /** 与 `bank_process_list.js` persistOpenBankEditBeforeResend 一致：不提交 country/bank/type/name/day 系列，避免 Resend 误改主档 */
  const persistOpenBankEditBeforeResend = useCallback(
    async (targetProcessId: number) => {
      if (!bankOpen || editBankId !== targetProcessId) return
      const fd = new FormData()
      fd.set('permission', 'Bank')
      fd.set('id', String(editBankId))
      const gross = (parseFloat(bPrice) || 0) - (parseFloat(bCost) || 0)
      fd.set('profit', gross.toFixed(2))
      fd.set('profit_sharing', serializeProfitSharingEntries(profitSharingEntries))
      fd.set('contract', bContract)
      if (bInsurance !== '') fd.set('insurance', bInsurance)
      fd.set('sop', bSop)
      fd.set('remark', bRemark)
      if (bCost !== '') fd.set('cost', bCost)
      if (bPrice !== '') fd.set('price', bPrice)
      if (bCard !== '') fd.set('card_merchant_id', String(bCard))
      if (bCust !== '') fd.set('customer_id', String(bCust))
      if (bProfitAcc !== '') fd.set('profit_account_id', String(bProfitAcc))
      fd.set('status', bStatus)
      try {
        await postUpdateProcess(fd)
      } catch {
        /* 与经典一致：失败不阻塞 Resend */
      }
    },
    [
      bankOpen,
      editBankId,
      bCard,
      bCust,
      bProfitAcc,
      bContract,
      bInsurance,
      bSop,
      bRemark,
      bCost,
      bPrice,
      bStatus,
      profitSharingEntries,
    ],
  )

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

  const dateLabel = (() => {
    const from = dateFrom.trim()
    const to = dateTo.trim()
    if (!from && !to) return 'Select date ran...'
    return `${from || '...'} ~ ${to || '...'}`
  })()

  return (
    <>
      <div className="action-buttons-container" id="processListBankActionBar">
        <ProcessListCompanyGroupFilters
          groupIds={workspace.groupIds}
          selectedGroup={workspace.selectedGroup}
          onSetGroup={workspace.setGroup}
          scopeCompanies={workspace.scopeCompanies}
          activeCompanyId={workspace.activeCompanyId}
          onPickCompany={workspace.onPickCompany}
        />
        <div className="action-buttons">
          <div className="action-controls-row">
            <button type="button" className="btn btn-add" onClick={openAddBank}>
              Add Process
            </button>
            <div className="process-list-date-filter process-list-date-filter--bank-classic" id="processListDateFilter">
              <button
                type="button"
                className="bank-date-trigger-icon"
                onClick={() => setDateOpen((v) => !v)}
                aria-label="Open date range picker"
                title="Open date range picker"
              >
                📅
              </button>
              <button
                type="button"
                className="bank-date-trigger"
                onClick={() => setDateOpen((v) => !v)}
                aria-label="Select date range"
                title="Select date range"
              >
                <span className="bank-date-trigger__icon" aria-hidden>📅</span>
                <span className="bank-date-trigger__text">{dateLabel}</span>
              </button>
              {dateOpen ? (
                <div className="bank-date-popover" role="dialog" aria-label="Date range">
                  <div className="bank-date-popover__row">
                    <input
                      type="date"
                      className="search-input"
                      value={dmyToIso(dateDraftFrom)}
                      onChange={(e) => {
                        const dmy = isoToDmy(e.target.value)
                        setDateDraftFrom(dmy)
                        setDateFrom(dmy)
                        setCurrentPage(1)
                      }}
                      aria-label="Date from"
                    />
                    <span className="bank-date-filter-hint" aria-hidden>~</span>
                    <input
                      type="date"
                      className="search-input"
                      value={dmyToIso(dateDraftTo)}
                      onChange={(e) => {
                        const dmy = isoToDmy(e.target.value)
                        setDateDraftTo(dmy)
                        setDateTo(dmy)
                        setCurrentPage(1)
                      }}
                      aria-label="Date to"
                    />
                  </div>
                  <div className="bank-date-popover__actions">
                    <button
                      type="button"
                      className="btn btn-cancel"
                      onClick={() => {
                        setDateDraftFrom('')
                        setDateDraftTo('')
                        setDateFrom('')
                        setDateTo('')
                        setCurrentPage(1)
                        setDateOpen(false)
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-add"
                      onClick={() => setDateOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
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
              <label htmlFor="showInactiveBank">Show Inactive</label>
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
              <label htmlFor="showOfficialBank">Show Official</label>
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
              <label htmlFor="showEInvoiceBank">Show E-Invoice</label>
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
              <label htmlFor="showBlockBank">Show Block</label>
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
              <th className="bank-th-supplier-sort">
                <button
                  type="button"
                  className="bank-th-sort-btn"
                  title="Sort supplier"
                  aria-label={`Sort supplier ${sortAsc ? 'ascending' : 'descending'}`}
                  onClick={() => {
                    setSortAsc((s) => !s)
                    setCurrentPage(1)
                  }}
                >
                  Supplier <span aria-hidden>{sortAsc ? '▲' : '▼'}</span>
                </button>
              </th>
              <th className="bank-th-country">Country</th>
              <th>Bank</th>
              <th className="bank-th-types">Types</th>
              <th className="bank-th-card-owner">Card Owner</th>
              <th>Contract</th>
              <th className="bank-th-num">Insurance</th>
              <th>Customer</th>
              <th className="bank-th-num">Cost</th>
              <th className="bank-th-num">Price</th>
              <th className="bank-th-num">Profit</th>
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
              const isBankStatusActive = String(p.status || '').trim().toLowerCase() === 'active'
              const showResend = isBankStatusActive && !isBankInactiveLike(p.status, p.issue_flag ?? undefined)
              const dateCell =
                p.date != null && String(p.date).trim() !== ''
                  ? String(p.date)
                  : dashIfEmpty(p.day_start)
              return (
                <tr
                  key={p.id}
                  data-id={p.id}
                  data-status={p.status}
                  data-issue-flag={p.issue_flag != null ? String(p.issue_flag) : ''}
                  data-has-transactions={p.has_transactions ? '1' : '0'}
                >
                  <td className="bank-td-no">{startIndex + idx + 1}</td>
                  <td className="bank-td-supplier">{dashIfEmpty(p.supplier)}</td>
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
                  <td className="bank-td-num">{dashIfEmpty(p.insurance)}</td>
                  <td>{dashIfEmpty(p.customer)}</td>
                  <td className="bank-td-num">{dashIfEmpty(p.cost)}</td>
                  <td className="bank-td-num">{dashIfEmpty(p.price)}</td>
                  <td className="bank-td-num">{dashIfEmpty(p.profit)}</td>
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
                      {showResend ? (
                        <button
                          type="button"
                          className="bank-resend-btn"
                          title="Resend"
                          aria-label="Resend to Accounting Due"
                          onClick={() => {
                            const st = String(p.status || '').trim().toLowerCase()
                            if (st !== 'active' || isBankInactiveLike(p.status, p.issue_flag ?? undefined)) {
                              onNotice(
                                'Resend is only available for Active processes (not Inactive, Official, E-INVOICE, or Block).',
                                'err',
                              )
                              return
                            }
                            setResendRow(p)
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
                            <path
                              d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M3 3v5h5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      ) : null}
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
            {page} of {totalPages}
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
        <div
          id="addBankModal"
          className="modal bank-modal"
          style={{ display: 'block' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bankModalTitle"
        >
          <div className="modal-content bank-modal-content">
            <div className="modal-header">
              <h2 id="bankModalTitle">
                {editBankId == null ? 'Add Bank Process' : 'Edit Bank Process'}
              </h2>
              <button type="button" className="close" onClick={closeBankModal} aria-label="Close">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form
                id="addBankProcessForm"
                className="process-form bank-form"
                onSubmit={(e) => void submitBank(e)}
              >
                <input type="hidden" id="bank_edit_id" name="id" value={editBankId ?? ''} />
                <div className="bank-form-fields-scroll">
                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <h3 className="bank-section-title">Bank Information</h3>
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_country">Country (Currency)</label>
                          <div className="select-with-add">
                            <select
                              id="bank_country"
                              name="country"
                              className="bank-select"
                              value={bCountry}
                              onChange={(e) => {
                                setBCountry(e.target.value)
                                setBBank('')
                              }}
                              required
                            >
                              <option value="">Select Country</option>
                              {countryOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="bank-add-btn"
                              title="Add New Country"
                              onClick={() => setCountryPickModal(true)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_bank">Bank</label>
                          <div className="select-with-add">
                            <select
                              id="bank_bank"
                              name="bank"
                              className="bank-select"
                              value={bBank}
                              onChange={(e) => setBBank(e.target.value)}
                              required
                            >
                              <option value="">Select Bank</option>
                              {bankRowOptions.map((bk) => (
                                <option key={bk} value={bk}>
                                  {bk}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="bank-add-btn"
                              title="Add New Bank"
                              onClick={() => {
                                if (!bCountry.trim()) {
                                  onNotice('Please select Country first', 'err')
                                  return
                                }
                                setBankPickModal(true)
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <h3 className="bank-section-title">Detail</h3>
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_card_merchant">Supplier</label>
                          <BankAccountCustomSelect
                            gate="bank_card_merchant"
                            openGate={accountDropdownGate}
                            setOpenGate={setAccountDropdownGate}
                            accounts={accounts}
                            value={bCard}
                            onChange={setBCard}
                            buttonId="bank_card_merchant"
                            dropdownId="bank_card_merchant_dropdown"
                            onAddAccountClick={() =>
                              onNotice('新增账户请使用经典银行页或账户管理。', 'ok')
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_cost">Buy Price</label>
                          <input
                            type="text"
                            id="bank_cost"
                            name="cost"
                            className="bank-input"
                            placeholder="Enter amount"
                            inputMode="decimal"
                            autoComplete="off"
                            value={bCost}
                            onChange={(e) => setBCost(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-row bank-row-two-cols bank-row-type-name">
                        <div className="form-group">
                          <label htmlFor="bank_type">Type</label>
                          <select
                            id="bank_type"
                            name="type"
                            className="bank-select"
                            value={bType}
                            onChange={(e) => setBType(e.target.value)}
                            required
                          >
                            <option value="">Select Type</option>
                            <option value="PERSONAL">PERSONAL</option>
                            <option value="ENTERPRISE">ENTERPRISE</option>
                            <option value="BUSINESS">BUSINESS</option>
                            {bType &&
                            !['PERSONAL', 'ENTERPRISE', 'BUSINESS'].includes(
                              String(bType).toUpperCase(),
                            ) ? (
                              <option value={bType}>{bType}</option>
                            ) : null}
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_name">Card Owner</label>
                          <input
                            type="text"
                            id="bank_name"
                            name="name"
                            className="bank-input"
                            placeholder="Enter Card Owner"
                            value={bName}
                            onChange={(e) => setBName(e.target.value.toUpperCase())}
                            required
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_customer">Customer</label>
                          <BankAccountCustomSelect
                            gate="bank_customer"
                            openGate={accountDropdownGate}
                            setOpenGate={setAccountDropdownGate}
                            accounts={accounts}
                            value={bCust}
                            onChange={setBCust}
                            buttonId="bank_customer"
                            dropdownId="bank_customer_dropdown"
                            onAddAccountClick={() =>
                              onNotice('新增账户请使用经典银行页或账户管理。', 'ok')
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_price">Sell Price</label>
                          <input
                            type="text"
                            id="bank_price"
                            name="price"
                            className="bank-input"
                            placeholder="Enter amount"
                            inputMode="decimal"
                            autoComplete="off"
                            value={bPrice}
                            onChange={(e) => setBPrice(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-row bank-day-start-row">
                        <div className="form-group bank-day-start-input-wrap">
                          <label htmlFor="bank_day_start">Day start</label>
                          <input
                            type="date"
                            id="bank_day_start"
                            name="day_start"
                            className="bank-input"
                            value={bDayStart}
                            onChange={(e) => setBDayStart(e.target.value)}
                          />
                        </div>
                        <div className="form-group bank-day-end-input-wrap">
                          <label htmlFor="bank_day_end">Day end</label>
                          <input
                            type="date"
                            id="bank_day_end"
                            name="day_end"
                            className="bank-input"
                            value={bDayEnd}
                            onChange={(e) => setBDayEnd(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_profit_account">Company</label>
                          <BankAccountCustomSelect
                            gate="bank_profit_account"
                            openGate={accountDropdownGate}
                            setOpenGate={setAccountDropdownGate}
                            accounts={accounts}
                            value={bProfitAcc}
                            onChange={setBProfitAcc}
                            buttonId="bank_profit_account"
                            dropdownId="bank_profit_account_dropdown"
                            onAddAccountClick={() =>
                              onNotice('新增账户请使用经典银行页或账户管理。', 'ok')
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_profit">Profit</label>
                          <input
                            type="text"
                            id="bank_profit"
                            name="profit"
                            className="bank-input"
                            placeholder="Auto calculated"
                            readOnly
                            style={{ backgroundColor: '#f5f5f5' }}
                            value={displayedNetProfit}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bank-form-row bank-form-row-last">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-group bank-day-start-frequency-wrap" style={{ marginBottom: 20 }}>
                        <label htmlFor="bank_day_start_frequency">Frequency</label>
                        <select
                          id="bank_day_start_frequency"
                          name="day_start_frequency"
                          className="bank-input bank-select"
                          value={bFreq}
                          onChange={(e) => setBFreq(e.target.value)}
                        >
                          <option value="1st_of_every_month">1st of Every Month</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div className="bank-profit-sharing-container form-group">
                        <div className="bank-profit-sharing-header">
                          <h3>Selected Profit Sharing</h3>
                          <button
                            type="button"
                            className="bank-add-btn"
                            title="Add Profit Sharing"
                            onClick={() => setProfitPickModal(true)}
                          >
                            +
                          </button>
                        </div>
                        <input
                          type="hidden"
                          id="bank_profit_sharing"
                          name="profit_sharing"
                          value={serializeProfitSharingEntries(profitSharingEntries)}
                        />
                        <div className="bank-profit-sharing-list" id="selectedProfitSharingList">
                          {profitSharingEntries.length === 0 ? (
                            <div className="no-profit-sharing">
                              <p>No profit sharing selected</p>
                            </div>
                          ) : (
                            profitSharingEntries.map((entry, index) => {
                              const num = parseFloat(entry.amount)
                              const displayAmount = Number.isFinite(num) ? num.toFixed(2) : entry.amount
                              const text = `${entry.accountText} - ${displayAmount}`
                              return (
                                <div key={`${text}_${index}`} className="selected-country-modal-item">
                                  <span>{text}</span>
                                  <button
                                    type="button"
                                    className="remove-country-modal"
                                    onClick={() =>
                                      setProfitSharingEntries((prev) => prev.filter((_, i) => i !== index))
                                    }
                                  >
                                    &times;
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_contract">Contract</label>
                          <select
                            id="bank_contract"
                            name="contract"
                            className="bank-select"
                            value={bContract}
                            onChange={(e) => setBContract(e.target.value)}
                            required={editBankId == null}
                          >
                            <option value="">Select Contract</option>
                            {BANK_CONTRACT_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt === '1+1'
                                  ? '1+1 MONTH'
                                  : opt === '1+2'
                                    ? '1+2 MONTHS'
                                    : opt === '1+3'
                                      ? '1+3 MONTHS'
                                      : opt}
                              </option>
                            ))}
                            {bContract &&
                            !(BANK_CONTRACT_OPTIONS as readonly string[]).includes(bContract) ? (
                              <option value={bContract}>{bContract}</option>
                            ) : null}
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_insurance">Insurance</label>
                          <input
                            type="text"
                            id="bank_insurance"
                            name="insurance"
                            className="bank-input"
                            placeholder="Enter amount"
                            inputMode="decimal"
                            autoComplete="off"
                            value={bInsurance}
                            onChange={(e) => setBInsurance(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-group bank-remark-wrap" style={{ marginTop: 12 }}>
                        <div className="bank-remark-actions">
                          <button
                            type="button"
                            id="bank_sop_btn"
                            className="btn btn-save"
                            onClick={() => openBankNote('sop')}
                          >
                            SOP
                          </button>
                          <button
                            type="button"
                            id="bank_remark_btn"
                            className="btn btn-save"
                            onClick={() => openBankNote('remark')}
                          >
                            Remark
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {editBankId != null ? (
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="form-group" style={{ maxWidth: 280 }}>
                        <label htmlFor="bank_status_edit">Status</label>
                        <select
                          id="bank_status_edit"
                          className="bank-select"
                          value={bStatus}
                          onChange={(e) => setBStatus(e.target.value)}
                        >
                          <option value="active">ACTIVE</option>
                          <option value="inactive">INACTIVE</option>
                          <option value="waiting">WAITING</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="form-actions bank-actions">
                  <button type="submit" className="btn btn-save" id="bankSubmitBtn">
                    {editBankId == null ? 'Add Process' : 'Update Process'}
                  </button>
                  <button type="button" className="btn btn-cancel" onClick={closeBankModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {bankNoteModal ? (
        <div
          id="sopModal"
          className="modal bank-modal sop-modal"
          style={{ display: 'block' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="processNoteModalTitle"
        >
          <div className="modal-content sop-modal-content">
            <div className="modal-header">
              <h2 id="processNoteModalTitle">
                {bankNoteModal === 'sop' ? 'SOP' : 'Remark'}
              </h2>
              <button
                type="button"
                className="close"
                onClick={() => setBankNoteModal(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body sop-modal-body">
              <textarea
                id="sop_content"
                className="bank-input sop-modal-textarea"
                placeholder="Enter notes for this process..."
                value={bankNoteDraft}
                onChange={(e) => setBankNoteDraft(e.target.value)}
              />
              <div className="form-actions bank-actions sop-modal-actions">
                <button type="button" className="btn btn-save" onClick={saveBankNoteAndClose}>
                  Save
                </button>
                <button type="button" className="btn btn-cancel" onClick={() => setBankNoteModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <BankProfitSharingModal
        open={profitPickModal}
        onClose={() => setProfitPickModal(false)}
        accounts={accounts}
        onSubmit={(entries) => setProfitSharingEntries((prev) => [...prev, ...entries])}
      />
      <BankCountrySelectionModal
        open={countryPickModal}
        companyId={companyId}
        initialSelected={countryOptions}
        onClose={() => setCountryPickModal(false)}
        onSaved={(list) => {
          setCountryOptions(list)
          setBCountry((cur) => (list.includes(cur) ? cur : list[0] || ''))
        }}
        onNotice={onNotice}
      />
      <BankListSelectionModal
        open={bankPickModal}
        companyId={companyId}
        country={bCountry}
        initialSelectedBanks={banksByCountryMap[bCountry.trim()] || []}
        fullSelectedBanksMap={banksByCountryMap}
        onClose={() => setBankPickModal(false)}
        onSaved={(next) => {
          setBanksByCountryMap(next)
          const cur = bCountry.trim()
          const banks = (cur ? next[cur] : undefined) || []
          if (banks.length && bBank.trim() && !banks.includes(bBank.trim())) setBBank(banks[0] || '')
        }}
        onNotice={onNotice}
      />

      <BankResendAccountingDueModal
        process={resendRow}
        open={resendRow != null}
        onClose={() => setResendRow(null)}
        beforeResend={persistOpenBankEditBeforeResend}
        onSuccess={() => {
          void loadList()
          window.dispatchEvent(new Event('c168:bank-accounting-due-updated'))
        }}
        onNotice={onNotice}
      />
    </>
  )
}
