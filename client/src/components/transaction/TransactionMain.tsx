import type { DashboardBootstrapData } from '../../types/dashboard'
import type {
  TxAccountOption,
  TxPaymentHistoryPayload,
  TxPaymentHistoryRow,
  TxSearchRow,
  TxTotals,
} from '../../lib/transactionLib'
import {
  applyTxDisplayFilters,
  calculateTxTotals,
  fetchContraInbox,
  fetchTxAccounts,
  fetchTxCategories,
  fetchTxPaymentHistory,
  fetchTxSearch,
  formatTxNumber,
  getRoleClass,
  postContraApprove,
  postContraReject,
  resolveSubmitAccountIds,
  sortTxRowsByRole,
  parseRateExpression,
  submitRateTransaction,
  showTxNotification,
  submitStandardTransaction,
  ymdToDmY,
  type ContraInboxRow,
  type TxSearchPayload,
} from '../../lib/transactionLib'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import { DashboardCalendarPopup } from '../dashboard/DashboardCalendarPopup'
import { QUICK_RANGE_LABEL, type QuickRangeId } from '../../lib/quickDateRange'
import flatpickr from 'flatpickr'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import 'flatpickr/dist/flatpickr.min.css'
import '../../../../css/date-range-picker.css'
import '../../../../css/transaction.css'
import '../../../../css/global-13inch.css'
import './TransactionMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

const QUICK_ORDER: QuickRangeId[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
]

type AccountSlot = { id: number; label: string; code: string } | null

function toUpperDisplay(s: string | undefined): string {
  return (s || '-').toUpperCase()
}

function getHistoryRemark(row: TxPaymentHistoryRow): string {
  const r = row.remark
  if (r != null && String(r).trim() !== '') return toUpperDisplay(String(r))
  return toUpperDisplay(row.sms || '-')
}

function todayDmY(): string {
  const t = new Date()
  const d = String(t.getDate()).padStart(2, '0')
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const y = t.getFullYear()
  return `${d}/${m}/${y}`
}

const TYPES_NEED_FROM = new Set([
  'CONTRA',
  'PAYMENT',
  'RECEIVE',
  'CLAIM',
  'PROFIT',
  'CLEAR',
])

type SingleFlatpickr = {
  destroy: () => void
  setDate: (date: string | Date, triggerChange?: boolean, format?: string) => void
}

function singleFlatpickr(
  el: HTMLInputElement,
  opts: Record<string, unknown>,
): SingleFlatpickr {
  const r = flatpickr(el, opts as Parameters<typeof flatpickr>[1])
  return (Array.isArray(r) ? r[0] : r) as SingleFlatpickr
}

function AccountSearchField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: AccountSlot
  onChange: (v: AccountSlot) => void
  options: TxAccountOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const u = q.trim().toUpperCase()
    if (!u) return options
    return options.filter((o) => {
      const hay = `${o.account_id} ${o.name} ${o.display_text}`.toUpperCase()
      return hay.includes(u)
    })
  }, [options, q])

  return (
    <div className="custom-select-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`custom-select-button${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? value.label : placeholder}
      </button>
      <div className={`custom-select-dropdown${open ? ' show' : ''}`}>
        <div className="custom-select-search">
          <input
            type="text"
            placeholder="Search account..."
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="custom-select-options">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className="custom-select-option"
              onClick={() => {
                onChange({
                  id: o.id,
                  label: o.display_text,
                  code: o.account_id,
                })
                setOpen(false)
                setQ('')
              }}
            >
              {o.display_text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TransactionMain({ bootstrap }: Props) {
  const w = useTransactionWorkspace(bootstrap)
  const viewerRole = String(bootstrap.userData?.role || '').toLowerCase()
  const canApproveContra = ['manager', 'admin', 'owner'].includes(viewerRole)
  /** 与 `transaction_classic.php` 一致：全角色显示 Description 列 */
  const showDescriptionColumn = true

  const [categories, setCategories] = useState<string[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const catRef = useRef<HTMLDivElement>(null)

  const [showName, setShowName] = useState(false)
  const [showCaptureOnly, setShowCaptureOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showZeroBalance, setShowZeroBalance] = useState(false)

  const [accounts, setAccounts] = useState<TxAccountOption[]>([])
  const [rawSearch, setRawSearch] = useState<TxSearchPayload | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)

  const [calendarOpen, setCalendarOpen] = useState(false)
  const dateAnchorRef = useRef<HTMLDivElement>(null)
  const calendarKey = useMemo(
    () => `${w.dateFrom}|${w.dateTo}|${calendarOpen}`,
    [w.dateFrom, w.dateTo, calendarOpen],
  )

  const [quickOpen, setQuickOpen] = useState(false)
  const quickRef = useRef<HTMLDivElement>(null)

  const [contraOpen, setContraOpen] = useState(false)
  const [contraRows, setContraRows] = useState<ContraInboxRow[]>([])
  const [contraLoading, setContraLoading] = useState(false)

  const [txType, setTxType] = useState('CONTRA')
  const [profitSide, setProfitSide] = useState<'WIN' | 'LOSE'>('WIN')
  const [txDateDmY, setTxDateDmY] = useState(todayDmY)
  const [toAccount, setToAccount] = useState<AccountSlot>(null)
  const [fromAccount, setFromAccount] = useState<AccountSlot>(null)
  const [formCurrency, setFormCurrency] = useState('')
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [rateDateDmY, setRateDateDmY] = useState(todayDmY)
  const [rateAcctTo, setRateAcctTo] = useState<AccountSlot>(null)
  const [rateAcctFrom, setRateAcctFrom] = useState<AccountSlot>(null)
  const [rateXferTo, setRateXferTo] = useState<AccountSlot>(null)
  const [rateXferFrom, setRateXferFrom] = useState<AccountSlot>(null)
  const [rateMiddleAcct, setRateMiddleAcct] = useState<AccountSlot>(null)
  const [rateCurFrom, setRateCurFrom] = useState('')
  const [rateCurTo, setRateCurTo] = useState('')
  const [rateFromAmt, setRateFromAmt] = useState('')
  const [rateExchRaw, setRateExchRaw] = useState('')
  const [rateMMRate, setRateMMRate] = useState('')
  const [rateToAmtOverride, setRateToAmtOverride] = useState<string | null>(null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState<TxPaymentHistoryPayload | null>(null)
  const [historyTitle, setHistoryTitle] = useState('Payment History')
  const historyAbortRef = useRef<AbortController | null>(null)

  const txDateInputRef = useRef<HTMLInputElement>(null)
  const rateDateInputRef = useRef<HTMLInputElement>(null)
  const fpTxRef = useRef<SingleFlatpickr | null>(null)
  const fpRateRef = useRef<SingleFlatpickr | null>(null)
  const prevTxTypeRef = useRef(txType)

  const isRate = txType === 'RATE'
  const showFromAndReverse = !isRate && TYPES_NEED_FROM.has(txType)

  useLayoutEffect(() => {
    const prev = prevTxTypeRef.current
    if (txType !== prev) {
      if (txType === 'RATE') setRateDateDmY(txDateDmY)
      else if (prev === 'RATE') setTxDateDmY(rateDateDmY)
      prevTxTypeRef.current = txType
    }
  }, [txType, txDateDmY, rateDateDmY])

  useLayoutEffect(() => {
    fpTxRef.current?.destroy()
    fpTxRef.current = null
    fpRateRef.current?.destroy()
    fpRateRef.current = null
    if (isRate) {
      const el = rateDateInputRef.current
      if (el) {
        fpRateRef.current = singleFlatpickr(el, {
          dateFormat: 'd/m/Y',
          allowInput: false,
          defaultDate: rateDateDmY,
          onChange: (_d: Date[], str: string) => setRateDateDmY(str),
        })
      }
      return () => {
        fpRateRef.current?.destroy()
        fpRateRef.current = null
      }
    }
    const el = txDateInputRef.current
    if (el) {
      fpTxRef.current = singleFlatpickr(el, {
        dateFormat: 'd/m/Y',
        allowInput: false,
        defaultDate: txDateDmY,
        onChange: (_d: Date[], str: string) => setTxDateDmY(str),
      })
    }
    return () => {
      fpTxRef.current?.destroy()
      fpTxRef.current = null
    }
    // 仅随 RATE / 非 RATE 切换重建；日期由下方 effect 同步到 flatpickr
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isRate])

  useEffect(() => {
    const fp = fpTxRef.current
    if (!fp || isRate) return
    fp.setDate(txDateDmY, false, 'd/m/Y')
  }, [txDateDmY, isRate])

  useEffect(() => {
    const fp = fpRateRef.current
    if (!fp || !isRate) return
    fp.setDate(rateDateDmY, false, 'd/m/Y')
  }, [rateDateDmY, isRate])

  useEffect(() => {
    if (w.currencyList.length === 0) return
    const codes = w.currencyList.map((c) => String(c.code || '').toUpperCase())
    setRateCurTo((prev) => {
      if (prev && codes.includes(prev)) return prev
      if (codes.includes('MYR')) return 'MYR'
      return codes[0] || ''
    })
    setRateCurFrom((prev) => (prev && codes.includes(prev) ? prev : ''))
  }, [w.currencyList])

  useEffect(() => {
    setRateToAmtOverride(null)
  }, [rateFromAmt, rateExchRaw, rateMMRate])

  useEffect(() => {
    if (txType === 'RATE') {
      setFromAccount(null)
    }
  }, [txType])

  useEffect(() => {
    if (!contraOpen) return
    const onDoc = (e: MouseEvent) => {
      const wrap = document.getElementById('contraInboxWrap')
      if (wrap?.contains(e.target as Node)) return
      setContraOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [contraOpen])

  const closePaymentHistory = useCallback(() => {
    historyAbortRef.current?.abort()
    historyAbortRef.current = null
    setHistoryOpen(false)
    setHistoryData(null)
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    if (!historyOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePaymentHistory()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyOpen, closePaymentHistory])

  useEffect(() => {
    let alive = true
    void fetchTxCategories().then((c) => {
      if (alive) setCategories(c)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (w.activeCompanyId == null) {
      setAccounts([])
      return
    }
    let alive = true
    void fetchTxAccounts(w.activeCompanyId).then((a) => {
      if (alive) setAccounts(a)
    })
    return () => {
      alive = false
    }
  }, [w.activeCompanyId])

  useEffect(() => {
    if (!catOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!catRef.current?.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [catOpen])

  useEffect(() => {
    if (!quickOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!quickRef.current?.contains(e.target as Node)) setQuickOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [quickOpen])

  const refreshContra = useCallback(async () => {
    if (!canApproveContra || w.activeCompanyId == null) return
    setContraLoading(true)
    try {
      const rows = await fetchContraInbox(w.activeCompanyId)
      setContraRows(rows)
    } finally {
      setContraLoading(false)
    }
  }, [canApproveContra, w.activeCompanyId])

  useEffect(() => {
    void refreshContra()
  }, [refreshContra])

  const categoryAllSelected =
    selectedCategories.length === 0 ||
    selectedCategories.length === categories.length

  const toggleCategory = (role: string) => {
    const u = role.toUpperCase()
    setSelectedCategories((prev) => {
      const set = new Set(prev.map((x) => x.toUpperCase()))
      if (set.has(u)) set.delete(u)
      else set.add(u)
      return Array.from(set)
    })
  }

  const setCategorySelectAll = () => {
    setSelectedCategories([])
  }

  const displayDmYRange = `${ymdToDmY(w.dateFrom)} - ${ymdToDmY(w.dateTo)}`

  const filteredData = useMemo(() => {
    if (!rawSearch) return { left: [] as TxSearchRow[], right: [] as TxSearchRow[] }
    return applyTxDisplayFilters(
      rawSearch.left_table || [],
      rawSearch.right_table || [],
      {
        showZeroBalance: showZeroBalance,
        showPaymentOnly: showInactive,
        showWinLossOnly: showCaptureOnly,
      },
    )
  }, [rawSearch, showZeroBalance, showInactive, showCaptureOnly])

  const sortedLeft = useMemo(
    () => sortTxRowsByRole(filteredData.left),
    [filteredData.left],
  )
  const sortedRight = useMemo(
    () => sortTxRowsByRole(filteredData.right),
    [filteredData.right],
  )

  const multiCurrencyView = w.showAllCurrencies || w.selectedCurrencies.length > 1

  const runSearch = async (overrides?: {
    showInactive?: boolean
    showCaptureOnly?: boolean
    showZeroBalance?: boolean
    quiet?: boolean
  }) => {
    const si = overrides?.showInactive ?? showInactive
    const sc = overrides?.showCaptureOnly ?? showCaptureOnly
    const sz = overrides?.showZeroBalance ?? showZeroBalance
    const quiet = overrides?.quiet === true

    if (w.activeCompanyId == null) {
      if (!quiet) showTxNotification('Please select a company', 'err')
      return
    }
    if (!w.showAllCurrencies && w.selectedCurrencies.length === 0) {
      if (!quiet) showTxNotification('Please select at least one Currency or All', 'info')
      return
    }

    const dateFromDmY = ymdToDmY(w.dateFrom)
    const dateToDmY = ymdToDmY(w.dateTo)

    let categoryCsv: string | null = null
    if (selectedCategories.length > 0 && !categoryAllSelected) {
      categoryCsv = selectedCategories.join(',')
    }
    const currencyCsv =
      !w.showAllCurrencies && w.selectedCurrencies.length > 0
        ? w.selectedCurrencies.join(',')
        : null

    searchAbortRef.current?.abort()
    const ac = new AbortController()
    searchAbortRef.current = ac

    setSearchLoading(true)
    setSearchError(null)
    const r = await fetchTxSearch({
      dateFromDmY,
      dateToDmY,
      categoryCsv,
      companyId: w.activeCompanyId,
      currencyCsv,
      showInactive: si,
      showCaptureOnly: sc,
      hideZeroBalance: !sz,
      signal: ac.signal,
    })
    setSearchLoading(false)
    if (r.ok === false) {
      if (r.error === 'AbortError') return
      setSearchError(r.error)
      setRawSearch(null)
      return
    }

    let data = r.data
    const singleCur =
      !w.showAllCurrencies && w.selectedCurrencies.length === 1
        ? w.selectedCurrencies[0]!.toUpperCase()
        : ''
    const leftN = data.left_table?.length ?? 0
    const rightN = data.right_table?.length ?? 0
    if (singleCur && leftN + rightN === 0) {
      const r2 = await fetchTxSearch({
        dateFromDmY,
        dateToDmY,
        categoryCsv,
        companyId: w.activeCompanyId,
        currencyCsv: null,
        showInactive: si,
        showCaptureOnly: sc,
        hideZeroBalance: !sz,
        signal: ac.signal,
      })
      if (r2.ok && r2.data) {
        const fl = (r2.data.left_table || []).filter(
          (row) => String(row.currency || '').toUpperCase() === singleCur,
        )
        const fr = (r2.data.right_table || []).filter(
          (row) => String(row.currency || '').toUpperCase() === singleCur,
        )
        data = {
          ...r2.data,
          left_table: fl,
          right_table: fr,
          totals: {
            left: calculateTxTotals(fl),
            right: calculateTxTotals(fr),
            summary: calculateTxTotals([...fl, ...fr]),
          },
        }
      }
    }

    if (sc && (data.left_table?.length ?? 0) + (data.right_table?.length ?? 0) === 0) {
      const r3 = await fetchTxSearch({
        dateFromDmY,
        dateToDmY,
        categoryCsv,
        companyId: w.activeCompanyId,
        currencyCsv,
        showInactive: si,
        showCaptureOnly: false,
        hideZeroBalance: !sz,
        signal: ac.signal,
      })
      if (r3.ok && r3.data?.totals) {
        data = { ...data, totals: r3.data.totals }
      }
    }

    setRawSearch(data)
    const disp = applyTxDisplayFilters(data.left_table || [], data.right_table || [], {
      showZeroBalance: sz,
      showPaymentOnly: si,
      showWinLossOnly: sc,
    })
    const displayed = (disp.left?.length ?? 0) + (disp.right?.length ?? 0)
    const totalRows = (data.left_table?.length ?? 0) + (data.right_table?.length ?? 0)
    if (quiet) return
    if (totalRows === 0) {
      showTxNotification(
        'Search completed but no data found. Please check date range, Currency filter, or confirm data has been submitted',
        'info',
      )
    } else if (displayed === 0) {
      showTxNotification(
        `Search returned ${totalRows} row(s), but none match current display filters (e.g. zero balance hidden when "Show 0 balance" is off, or "Show Payment Only" / "Show Win/Loss Only"). Enable "Show 0 balance" or adjust filters.`,
        'info',
      )
    } else {
      showTxNotification(`Search completed, found ${displayed} record(s)`, 'ok')
    }
  }

  const runSearchRef = useRef(runSearch)
  runSearchRef.current = runSearch

  /** 与 `transaction.js` 一致：币别/公司/日期/分类 变化时自动 search_api；复选框仍由各自 onChange 显式触发，避免重复请求 */
  const lastStructuralSearchKeyRef = useRef<string>('')

  useEffect(() => {
    if (!w.companiesReady) return
    if (w.activeCompanyId == null) return
    if (w.currencyList.length === 0) return
    if (!w.showAllCurrencies && w.selectedCurrencies.length === 0) return

    const categoryKey =
      selectedCategories.length > 0 && !categoryAllSelected
        ? [...selectedCategories].map((x) => x.toUpperCase()).sort().join(',')
        : 'ALL'

    const structuralKey = [
      w.activeCompanyId,
      w.dateFrom,
      w.dateTo,
      w.showAllCurrencies ? 'A' : 'S',
      [...w.selectedCurrencies].map((x) => x.toUpperCase()).sort().join(','),
      categoryKey,
    ].join('|')

    if (lastStructuralSearchKeyRef.current === structuralKey) return
    lastStructuralSearchKeyRef.current = structuralKey

    void runSearchRef.current({ quiet: true })
  }, [
    w.companiesReady,
    w.activeCompanyId,
    w.dateFrom,
    w.dateTo,
    w.showAllCurrencies,
    w.selectedCurrencies,
    w.currencyList.length,
    selectedCategories,
    categoryAllSelected,
  ])

  const openPaymentHistory = useCallback(
    (row: TxSearchRow) => {
      const idRaw = row.account_db_id
      const parsed =
        typeof idRaw === 'number'
          ? idRaw
          : parseInt(String(idRaw ?? '').trim(), 10)
      const aid = Number.isFinite(parsed) ? parsed : 0
      const accountCode = String(row.account_id || '').trim()
      const virtualCompanyCode = accountCode.toUpperCase()
      const isVirtualCompanyRow =
        (!aid || aid <= 0) && virtualCompanyCode !== ''

      if ((!aid || aid <= 0) && !isVirtualCompanyRow) {
        showTxNotification('Invalid account for history', 'err')
        return
      }
      if (!w.dateFrom || !w.dateTo) {
        showTxNotification('Please search first to set date range', 'err')
        return
      }
      if (w.activeCompanyId == null) {
        showTxNotification('No company selected', 'err')
        return
      }

      historyAbortRef.current?.abort()
      const ac = new AbortController()
      historyAbortRef.current = ac

      const dateFromDmY = ymdToDmY(w.dateFrom)
      const dateToDmY = ymdToDmY(w.dateTo)
      const rowCur = String(row.currency || '').trim()
      const selectedCsv =
        w.selectedCurrencies.length > 0 ? w.selectedCurrencies.join(',') : ''

      setHistoryOpen(true)
      setHistoryLoading(true)
      setHistoryData(null)
      setHistoryTitle(
        `Payment History - ${row.account_id} (${toUpperDisplay(row.account_name)})`,
      )

      void (async () => {
        const r = await fetchTxPaymentHistory({
          accountId: aid,
          virtualCompanyCode: isVirtualCompanyRow ? virtualCompanyCode : undefined,
          dateFromDmY,
          dateToDmY,
          rowCurrency: rowCur || null,
          selectedCurrenciesCsv: rowCur ? null : selectedCsv || null,
          companyId: w.activeCompanyId!,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setHistoryLoading(false)
        if (r.ok === false) {
          if (r.error === 'AbortError') return
          setHistoryOpen(false)
          showTxNotification(r.error, 'err')
          return
        }
        setHistoryData(r.data)
        const acc = r.data.account
        const titleCode = acc?.account_id ?? row.account_id
        const titleName = acc?.name ?? row.account_name ?? ''
        setHistoryTitle(`Payment History - ${titleCode} (${titleName})`)
      })()
    },
    [w.activeCompanyId, w.dateFrom, w.dateTo, w.selectedCurrencies],
  )

  const onBalanceCellClick = (row: TxSearchRow, isLeftTable: boolean) => {
    if (txType === 'RATE') {
      const idRaw = row.account_db_id
      const id = typeof idRaw === 'number' ? idRaw : parseInt(String(idRaw), 10)
      if (!Number.isFinite(id) || id <= 0) return
      const code = String(row.account_id || '')
      const acc = accounts.find((a) => a.id === id)
      const label = acc?.display_text || code
      const slot: AccountSlot = { id, label, code }
      const cur = String(row.currency || '').trim().toUpperCase()
      const rawBal = parseFloat(String(row.balance).replace(/,/g, ''))
      const absBal = Number.isFinite(rawBal) ? Math.abs(rawBal).toFixed(2) : ''
      if (isLeftTable) {
        setRateAcctTo(slot)
        setRateXferFrom(slot)
        if (absBal) setRateToAmtOverride(absBal)
      } else {
        setRateAcctFrom(slot)
        setRateXferTo(slot)
        if (absBal) {
          setRateFromAmt(absBal)
          setRateToAmtOverride(null)
        }
      }
      if (cur) setRateCurFrom(cur)
      return
    }
    const idRaw = row.account_db_id
    const id = typeof idRaw === 'number' ? idRaw : parseInt(String(idRaw), 10)
    const code = String(row.account_id || '')
    const acc = accounts.find((a) => a.id === id)
    const label = acc?.display_text || code
    const cur = String(row.currency || '').trim().toUpperCase()

    let treatAsLeft = isLeftTable
    if (txType === 'PROFIT') {
      const bal = parseFloat(String(row.balance).replace(/,/g, ''))
      if (!Number.isNaN(bal)) treatAsLeft = bal >= 0
    }

    if (treatAsLeft) {
      setToAccount({ id, label, code })
    } else {
      setFromAccount({ id, label, code })
    }
    const b = parseFloat(String(row.balance).replace(/,/g, ''))
    if (!Number.isNaN(b)) setAmount(Math.abs(b).toFixed(2))
    if (cur) setFormCurrency(cur)
  }

  const leftTotals: TxTotals = calculateTxTotals(sortedLeft)
  const rightTotals: TxTotals = calculateTxTotals(sortedRight)
  const summaryTotals: TxTotals = {
    bf: leftTotals.bf + rightTotals.bf,
    win_loss: leftTotals.win_loss + rightTotals.win_loss,
    cr_dr: leftTotals.cr_dr + rightTotals.cr_dr,
    balance: leftTotals.balance + rightTotals.balance,
  }

  const rateParsed = useMemo(() => parseRateExpression(rateExchRaw), [rateExchRaw])
  const rateMmAmtNum = useMemo(() => {
    const a = parseFloat(String(rateFromAmt).replace(/,/g, '')) || 0
    const m = parseFloat(String(rateMMRate).replace(/,/g, '')) || 0
    if (a > 0 && m > 0) return a * m
    return 0
  }, [rateFromAmt, rateMMRate])
  const rateToComputedNum = useMemo(() => {
    const a = parseFloat(String(rateFromAmt).replace(/,/g, '')) || 0
    const er = rateParsed.valid ? rateParsed.value : 0
    if (a > 0 && er > 0) return a * er - rateMmAmtNum
    return NaN
  }, [rateFromAmt, rateParsed, rateMmAmtNum])
  const rateToDisplayStr =
    rateToAmtOverride !== null && rateToAmtOverride !== ''
      ? rateToAmtOverride
      : Number.isFinite(rateToComputedNum) && rateToComputedNum > 0
        ? rateToComputedNum.toFixed(2)
        : ''
  const rateMmDisplayStr = rateMmAmtNum > 0 ? rateMmAmtNum.toFixed(2) : ''

  const reverseRatePrimary = () => {
    const a = rateAcctTo
    setRateAcctTo(rateAcctFrom)
    setRateAcctFrom(a)
    const tv =
      rateToAmtOverride !== null && rateToAmtOverride !== ''
        ? rateToAmtOverride
        : Number.isFinite(rateToComputedNum) && rateToComputedNum > 0
          ? rateToComputedNum.toFixed(2)
          : ''
    setRateToAmtOverride(rateFromAmt || null)
    setRateFromAmt(tv)
  }

  const reverseRateTransferRow = () => {
    const a = rateXferTo
    setRateXferTo(rateXferFrom)
    setRateXferFrom(a)
  }

  const groupedSections = useMemo(() => {
    if (!multiCurrencyView) return []
    const by: Record<string, { left: TxSearchRow[]; right: TxSearchRow[] }> = {}
    for (const row of sortedLeft) {
      const c = String(row.currency || 'UNKNOWN')
      if (!by[c]) by[c] = { left: [], right: [] }
      by[c]!.left.push(row)
    }
    for (const row of sortedRight) {
      const c = String(row.currency || 'UNKNOWN')
      if (!by[c]) by[c] = { left: [], right: [] }
      by[c]!.right.push(row)
    }
    let order = w.currencyList
      .map((x) => String(x.code || '').toUpperCase())
      .filter((c) => by[c])
    for (const k of Object.keys(by)) {
      if (!order.includes(k)) order.push(k)
    }
    if (showZeroBalance && rawSearch?.active_currency_codes?.length) {
      const active = new Set(
        rawSearch.active_currency_codes.map((x) => String(x || '').toUpperCase()),
      )
      order = order.filter((c) => active.has(c))
    }
    return order.map((currency) => {
      const g = by[currency]!
      const lt = calculateTxTotals(g.left)
      const rt = calculateTxTotals(g.right)
      return {
        currency,
        left: sortTxRowsByRole(g.left),
        right: sortTxRowsByRole(g.right),
        summary: {
          bf: lt.bf + rt.bf,
          win_loss: lt.win_loss + rt.win_loss,
          cr_dr: lt.cr_dr + rt.cr_dr,
          balance: lt.balance + rt.balance,
        },
      }
    })
  }, [
    multiCurrencyView,
    sortedLeft,
    sortedRight,
    w.currencyList,
    showZeroBalance,
    rawSearch?.active_currency_codes,
  ])

  const reverseAccounts = () => {
    const a = toAccount
    setToAccount(fromAccount)
    setFromAccount(a)
  }

  const onSubmit = async () => {
    if (!confirmSubmit) {
      showTxNotification('Please confirm submit', 'err')
      return
    }
    if (w.activeCompanyId == null) {
      showTxNotification('No company selected', 'err')
      return
    }
    if (txType === 'RATE') {
      const rateToId = rateAcctTo?.id
      const rateFromId = rateAcctFrom?.id
      if (!rateToId) {
        showTxNotification('Please select To Account', 'err')
        return
      }
      if (!rateFromId) {
        showTxNotification('Rate transaction requires From Account', 'err')
        return
      }
      const rdf = rateCurFrom.trim().toUpperCase()
      const rdt = rateCurTo.trim().toUpperCase()
      if (!rdf || !rdt) {
        showTxNotification('Please select both currencies', 'err')
        return
      }
      const fromNum = parseFloat(String(rateFromAmt).replace(/,/g, '')) || 0
      const toNum = parseFloat(String(rateToDisplayStr).replace(/,/g, '')) || 0
      if (fromNum <= 0 || toNum <= 0) {
        showTxNotification('Please enter valid currency amounts', 'err')
        return
      }
      if (!rateParsed.valid) {
        showTxNotification('Please enter a valid rate value (supports * and /)', 'err')
        return
      }
      if (!rateDateDmY.trim()) {
        showTxNotification('Please select transaction date', 'err')
        return
      }

      const rawRate = rateExchRaw.trim()
      const fromDesc = `Transaction to ${rateAcctTo?.code || ''} (Rate: ${rawRate})`
      const toDesc = `Transaction from ${rateAcctFrom?.code || ''} (Rate: ${rawRate})`

      const xferT = rateXferTo?.id
      const xferF = rateXferFrom?.id
      const hasSecond = !!(xferT && xferF)

      let secondLeg: {
        rate_transfer_from_amount: string
        rate_transfer_from_description: string
        rate_transfer_to_amount: string
        rate_transfer_to_description: string
        rate_transfer_from_currency: string
        rate_transfer_to_currency: string
        middleman: {
          rate_middleman_currency: string
          rate_middleman_amount: string
          rate_middleman_description: string
        } | null
      } | null = null

      if (hasSecond) {
        const transferAmountValue = toNum
        if (transferAmountValue <= 0) {
          showTxNotification('Please enter currency amounts or transfer amount', 'err')
          return
        }
        const mmId = rateMiddleAcct?.id
        const mmRateN = parseFloat(String(rateMMRate).replace(/,/g, '')) || 0
        let middlemanAmount = rateMmAmtNum
        if (mmId || rateMMRate.trim()) {
          if (!mmId) {
            showTxNotification('Please select Middle-Man account', 'err')
            return
          }
          if (mmRateN <= 0) {
            showTxNotification('Please enter Middle-Man rate multiplier', 'err')
            return
          }
        } else {
          middlemanAmount = 0
        }
        const xferFromDesc = `Transaction to ${rateXferFrom?.code || ''} (Rate: ${rawRate})`
        const xferToDesc = `Transaction from ${rateXferTo?.code || ''} (Rate: ${rawRate})`
        const originalTransferFromAmount = fromNum * rateParsed.value
        let middlemanDescription = ''
        if (middlemanAmount > 0) {
          middlemanDescription = `Rate charge (x${rateMMRate}) from ${rdf} ${fromNum.toFixed(2)}`
        }
        secondLeg = {
          rate_transfer_from_amount: originalTransferFromAmount.toFixed(2),
          rate_transfer_from_description: xferFromDesc,
          rate_transfer_to_amount: transferAmountValue.toFixed(2),
          rate_transfer_to_description: xferToDesc,
          rate_transfer_from_currency: rdt,
          rate_transfer_to_currency: rdt,
          middleman:
            mmId && middlemanAmount > 0
              ? {
                  rate_middleman_currency: rdt,
                  rate_middleman_amount: middlemanAmount.toFixed(2),
                  rate_middleman_description: middlemanDescription,
                }
              : null,
        }
      }

      setSubmitting(true)
      const rfa = String(rateFromAmt).trim().replace(/,/g, '') || String(fromNum)
      const res = await submitRateTransaction({
        companyId: w.activeCompanyId,
        transactionDateDmY: rateDateDmY.trim(),
        description: '',
        sms: '',
        rateToAccountId: rateToId,
        rateFromAccountId: rateFromId,
        rateFromCurrency: rdf,
        rateToCurrency: rdt,
        rateFromAmount: rfa,
        rateToAmount: rateToDisplayStr,
        rateFromDescription: fromDesc,
        rateToDescription: toDesc,
        rateExchangeRateRaw: rawRate,
        rateExchangeRateNumeric: rateParsed.value,
        rateTransferFromAccountId: rateXferTo?.id ?? '',
        rateTransferToAccountId: rateXferFrom?.id ?? '',
        rateTransferAmount: '',
        rateMiddlemanAccountId: rateMiddleAcct?.id ?? '',
        rateMiddlemanRate: rateMMRate,
        rateMiddlemanAmount: rateMmDisplayStr || '',
        secondLeg,
      })
      setSubmitting(false)
      if (res.ok === false) {
        showTxNotification(res.error, 'err')
        return
      }
      showTxNotification(res.message || 'Submitted', 'ok')
      setRateFromAmt('')
      setRateExchRaw('')
      setRateMMRate('')
      setRateToAmtOverride(null)
      setRateXferTo(null)
      setRateXferFrom(null)
      setRateMiddleAcct(null)
      setConfirmSubmit(false)
      void refreshContra()
      void runSearch()
      return
    }
    const { effectiveType, accountId, fromAccountId } = resolveSubmitAccountIds(
      txType,
      profitSide,
      toAccount?.id ?? null,
      fromAccount?.id ?? null,
    )
    if (!accountId) {
      showTxNotification('Please select To Account', 'err')
      return
    }
    if (!txDateDmY.trim()) {
      showTxNotification('Please select transaction date', 'err')
      return
    }
    const amtNorm = amount.trim().replace(/,/g, '')
    const amtNum = parseFloat(amtNorm)
    if (!Number.isFinite(amtNum) || amtNum < 0) {
      showTxNotification('Please enter a valid amount (>= 0)', 'err')
      return
    }
    if (!formCurrency) {
      showTxNotification('Please select Currency', 'err')
      return
    }
    if (
      ['CONTRA', 'PAYMENT', 'RECEIVE', 'CLAIM', 'CLEAR'].includes(effectiveType) &&
      !fromAccountId
    ) {
      showTxNotification('This transaction type requires From Account', 'err')
      return
    }

    setSubmitting(true)
    const res = await submitStandardTransaction({
      companyId: w.activeCompanyId,
      transactionType: effectiveType,
      accountId,
      fromAccountId,
      amount: amtNorm,
      transactionDateDmY: txDateDmY.trim(),
      description: '',
      sms: remark,
      currency: formCurrency,
    })
    setSubmitting(false)
    if (res.ok === false) {
      showTxNotification(res.error, 'err')
      return
    }
    const approval = (res.data as { approval_status?: string } | undefined)?.approval_status
    if (String(approval || '').toUpperCase() === 'PENDING') {
      showTxNotification('Submitted. Waiting for Manager+ approval to take effect.', 'info')
    } else {
      showTxNotification(res.message || 'Submitted', 'ok')
    }
    setAmount('')
    setConfirmSubmit(false)
    void refreshContra()
    void runSearch()
  }

  const submitEnabled = confirmSubmit && !submitting && w.activeCompanyId != null

  return (
    <div className="transaction-page tShell__transactionPage">
    <div className="transaction-container tShell__transactionRoot">
      <div
        id="notificationContainer"
        className="transaction-notification-container"
        aria-live="polite"
      />

      <div className="transaction-header-bar">
        <div className="transaction-header-left">
          <h1 className="transaction-title">Transaction List</h1>
          {canApproveContra && (
            <div className="contra-inbox-wrap" id="contraInboxWrap">
              <button
                type="button"
                className="contra-inbox-btn contra-inbox-main"
                id="contraInboxBtn"
                onClick={() => {
                  setContraOpen((o) => !o)
                  void refreshContra()
                }}
              >
                <svg className="contra-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                Contra Inbox
                <span className="contra-inbox-badge" id="contraInboxCount">
                  {contraRows.length}
                </span>
              </button>
              <div
                className="contra-inbox-popover"
                id="contraInboxPopover"
                style={{ display: contraOpen ? 'block' : 'none' }}
              >
                <div className="contra-inbox-popover-header">
                  <div className="contra-inbox-popover-title">
                    Contra Inbox
                    <span className="contra-inbox-badge" id="contraInboxCount2">
                      {contraRows.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="contra-inbox-btn"
                    id="contraInboxRefreshBtn"
                    onClick={() => void refreshContra()}
                  >
                    Refresh
                  </button>
                </div>
                <div className="contra-inbox-popover-body">
                  {contraLoading ? (
                    <p className="tShell__muted">Loading…</p>
                  ) : (
                    <table className="contra-inbox-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Currency</th>
                          <th>Amount</th>
                          <th>Submitted By</th>
                          <th>Description</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="contraInboxTbody">
                        {contraRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: '10px 8px', color: '#6b7280' }}>
                              No pending contra.
                            </td>
                          </tr>
                        ) : (
                          contraRows.map((r) => (
                            <tr key={r.id}>
                              <td>{r.transaction_date}</td>
                              <td>
                                {(r.from_account_code || '-') +
                                  (r.from_account_name ? ` - ${r.from_account_name}` : '')}
                              </td>
                              <td>
                                {(r.to_account_code || '-') +
                                  (r.to_account_name ? ` - ${r.to_account_name}` : '')}
                              </td>
                              <td>{r.currency}</td>
                              <td>{formatTxNumber(r.amount)}</td>
                              <td>{r.submitted_by}</td>
                              <td>{r.description}</td>
                              <td>
                                <button
                                  type="button"
                                  className="contra-inbox-btn contra-inbox-approve"
                                  onClick={async () => {
                                    if (!w.activeCompanyId) return
                                    const x = await postContraApprove(w.activeCompanyId, r.id)
                                    if (!x.ok)
                                      showTxNotification(x.error || 'Approve failed', 'err')
                                    else {
                                      showTxNotification('Approved', 'ok')
                                      void refreshContra()
                                      void runSearch()
                                    }
                                  }}
                                >
                                  Approve
                                </button>{' '}
                                <button
                                  type="button"
                                  className="contra-inbox-btn contra-inbox-reject"
                                  onClick={async () => {
                                    if (!w.activeCompanyId) return
                                    const x = await postContraReject(w.activeCompanyId, r.id)
                                    if (!x.ok)
                                      showTxNotification(x.error || 'Reject failed', 'err')
                                    else {
                                      showTxNotification('Rejected', 'ok')
                                      void refreshContra()
                                      void runSearch()
                                    }
                                  }}
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="transaction-separator-line" />

      <div className="transaction-main-content">
        <div className="transaction-search-section">
          <div className="transaction-form-group">
            <label className="transaction-label">Category</label>
            <div id="filter_category" className="transaction-category-multiselect" ref={catRef}>
              <div className="category-dropdown">
                <button
                  type="button"
                  className="category-dropdown-button"
                  id="category_dropdown_button"
                  onClick={() => setCatOpen((o) => !o)}
                >
                  <div id="category_selected_tags" className="category-selected-tags">
                    {categoryAllSelected ? (
                      <span className="category-placeholder">--Select All--</span>
                    ) : (
                      selectedCategories.map((c) => (
                        <span key={c} className="category-tag">
                          {c}
                        </span>
                      ))
                    )}
                  </div>
                  <i className="fas fa-chevron-down" />
                </button>
                <div
                  className={`category-dropdown-menu${catOpen ? ' show' : ''}`}
                  id="category_dropdown_menu"
                >
                  <div className="category-option">
                    <label className="category-checkbox-label">
                      <input
                        type="checkbox"
                        className="category-checkbox"
                        id="category_all"
                        value=""
                        checked={categoryAllSelected}
                        onChange={setCategorySelectAll}
                      />
                      <span>--Select All--</span>
                    </label>
                  </div>
                  <div id="category_options_container">
                    {categories.map((role) => (
                      <div key={role} className="category-option">
                        <label className="category-checkbox-label">
                          <input
                            type="checkbox"
                            className="category-checkbox"
                            checked={selectedCategories.map((x) => x.toUpperCase()).includes(role.toUpperCase())}
                            onChange={() => toggleCategory(role)}
                          />
                          <span>{role}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="transaction-date-quick-row">
            <label className="transaction-label transaction-capture-date-label">Capture Date</label>
            <div className="transaction-date-range-group">
              <div
                className="date-range-picker"
                id="date-range-picker"
                ref={dateAnchorRef}
                onClick={() => setCalendarOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setCalendarOpen(true)
                }}
              >
                <i className="fas fa-calendar-alt" />
                <span id="date-range-display">{displayDmYRange}</span>
              </div>
              <input type="hidden" id="date_from" value={ymdToDmY(w.dateFrom)} readOnly />
              <input type="hidden" id="date_to" value={ymdToDmY(w.dateTo)} readOnly />
            </div>
            <div className="quick-select-dropdown quick-select-dropdown-toggle" ref={quickRef}>
              <button
                type="button"
                className="dropdown-toggle"
                onClick={(e) => {
                  e.stopPropagation()
                  setQuickOpen((o) => !o)
                }}
              >
                <i className="fas fa-calendar-alt" />
                <span id="quick-select-text">{w.quickSelectLabel || 'Period'}</span>
                <i className="fas fa-chevron-down" />
              </button>
              <div
                className={`dropdown-menu${quickOpen ? ' show' : ''}`}
                id="quick-select-dropdown"
              >
                {QUICK_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      w.selectQuickRange(k)
                      setQuickOpen(false)
                    }}
                  >
                    {QUICK_RANGE_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DashboardCalendarPopup
            key={calendarKey}
            open={calendarOpen}
            anchorRef={dateAnchorRef}
            dateFrom={w.dateFrom}
            dateTo={w.dateTo}
            onClose={() => setCalendarOpen(false)}
            onCommit={(from, to) => {
              w.setDateFrom(from)
              w.setDateTo(to)
              setCalendarOpen(false)
            }}
          />

          <div className="transaction-checkboxes">
            <label className="transaction-checkbox-label">
              <input
                type="checkbox"
                id="show_name"
                className="transaction-checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
              />
              Show Name
            </label>
            <label className="transaction-checkbox-label">
              <input
                type="checkbox"
                id="show_capture_only"
                className="transaction-checkbox"
                checked={showCaptureOnly}
                onChange={(e) => {
                  const v = e.target.checked
                  setShowCaptureOnly(v)
                  void runSearch({ showCaptureOnly: v })
                }}
              />
              Show Win/Loss Only
            </label>
            <label className="transaction-checkbox-label">
              <input
                type="checkbox"
                id="show_inactive"
                className="transaction-checkbox"
                checked={showInactive}
                onChange={(e) => {
                  const v = e.target.checked
                  setShowInactive(v)
                  void runSearch({ showInactive: v })
                }}
              />
              Show Payment Only
            </label>
            <label className="transaction-checkbox-label">
              <input
                type="checkbox"
                id="show_zero_balance"
                className="transaction-checkbox"
                checked={showZeroBalance}
                onChange={(e) => {
                  const v = e.target.checked
                  setShowZeroBalance(v)
                  void runSearch({ showZeroBalance: v })
                }}
              />
              Show 0 balance
            </label>
          </div>

          <div className="transaction-bottom-filters">
            {w.groupIds.length > 0 && (
              <div
                id="group-buttons-wrapper"
                className="transaction-company-filter shared-group-wrapper"
              >
                <span className="transaction-company-label">GroupID:</span>
                <div
                  id="group-buttons-container"
                  className="transaction-company-buttons"
                  role="group"
                  aria-label="Group"
                >
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
                            ? 'transaction-company-btn shared-group-btn active'
                            : 'transaction-company-btn shared-group-btn'
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
                className="transaction-company-filter shared-company-wrapper"
              >
                <span className="transaction-company-label">Company:</span>
                <div
                  id="company-buttons-container"
                  className="transaction-company-buttons"
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
                            ? 'transaction-company-btn shared-company-btn active'
                            : 'transaction-company-btn shared-company-btn'
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

            <div id="currency-buttons-wrapper" className="transaction-company-filter">
              <span className="transaction-company-label">Currency:</span>
              <div id="currency-buttons-container" className="transaction-company-buttons">
                <button
                  type="button"
                  className={
                    w.showAllCurrencies
                      ? 'transaction-company-btn active'
                      : 'transaction-company-btn'
                  }
                  onClick={() => w.toggleShowAllCurrencies()}
                >
                  ALL
                </button>
                {w.currencyList.map((c) => {
                  const code = String(c.code || '').toUpperCase()
                  const active =
                    !w.showAllCurrencies &&
                    w.selectedCurrencies.map((x) => x.toUpperCase()).includes(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      className={active ? 'transaction-company-btn active' : 'transaction-company-btn'}
                      onClick={() => w.toggleCurrencyCode(code)}
                    >
                      {code}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="transaction-add-section">
          <div className="transaction-form-group">
            <label className="transaction-label">Type</label>
            <select
              id="transaction_type"
              className="transaction-select"
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
            >
              <option value="CONTRA">CONTRA</option>
              <option value="PAYMENT">PAYMENT</option>
              <option value="RECEIVE">RECEIVE</option>
              <option value="CLAIM">CLAIM</option>
              <option value="PROFIT">PROFIT</option>
              <option value="RATE">RATE</option>
              <option value="CLEAR">CLEAR</option>
            </select>
          </div>

          {txType === 'PROFIT' && (
            <div className="transaction-form-group transaction-inline-row">
              <label className="transaction-label">Side</label>
              <label className="transaction-checkbox-label">
                <input
                  type="radio"
                  name="win_lose_side"
                  checked={profitSide === 'WIN'}
                  onChange={() => setProfitSide('WIN')}
                />
                WIN
              </label>
              <label className="transaction-checkbox-label">
                <input
                  type="radio"
                  name="win_lose_side"
                  checked={profitSide === 'LOSE'}
                  onChange={() => setProfitSide('LOSE')}
                />
                LOSE
              </label>
            </div>
          )}

          <div
            id="standard-transaction-fields"
            style={{ display: isRate ? 'none' : 'block' }}
          >
              <div className="transaction-form-group">
                <label className="transaction-label">Date</label>
                <input
                  ref={txDateInputRef}
                  type="text"
                  id="transaction_date"
                  className="transaction-input"
                  readOnly
                  style={{ cursor: 'pointer' }}
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Account</label>
                <div className="transaction-account-inputs">
                  <AccountSearchField
                    value={toAccount}
                    onChange={setToAccount}
                    options={accounts}
                    placeholder="--Select To Account--"
                  />
                  {showFromAndReverse && (
                    <>
                      <AccountSearchField
                        value={fromAccount}
                        onChange={setFromAccount}
                        options={accounts}
                        placeholder="--Select From Account--"
                      />
                      <button
                        type="button"
                        id="account_reverse_btn"
                        className="transaction-account-reverse-btn"
                        title="Reverse accounts"
                        aria-label="Reverse accounts"
                        onClick={reverseAccounts}
                      >
                        Reverse
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Currency</label>
                <select
                  id="transaction_currency"
                  className="transaction-select"
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                >
                  <option value="">--Select Currency--</option>
                  {w.currencyList.map((c) => (
                    <option key={c.code} value={String(c.code).toUpperCase()}>
                      {String(c.code).toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="transaction-form-group">
                <label className="transaction-label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  id="action_amount"
                  className="transaction-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

          <div
            id="rate-transaction-fields"
            className="rate-fields"
            style={{ display: isRate ? 'flex' : 'none' }}
          >
              <div className="rate-section">
                <label className="transaction-label">Date</label>
                <input
                  ref={rateDateInputRef}
                  type="text"
                  id="rate_transaction_date"
                  className="transaction-input"
                  readOnly
                  style={{ cursor: 'pointer' }}
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <AccountSearchField
                    value={rateAcctTo}
                    onChange={setRateAcctTo}
                    options={accounts}
                    placeholder="--Select To Account--"
                  />
                  <AccountSearchField
                    value={rateAcctFrom}
                    onChange={setRateAcctFrom}
                    options={accounts}
                    placeholder="--Select From Account--"
                  />
                  <button
                    type="button"
                    id="rate_account_reverse_btn"
                    className="transaction-account-reverse-btn rate-reverse-btn"
                    title="Reverse accounts"
                    aria-label="Reverse accounts"
                    onClick={reverseRatePrimary}
                  >
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Currency</label>
                <div className="rate-row rate-row-five-cols">
                  <select
                    id="rate_currency_from"
                    className="transaction-select"
                    value={rateCurFrom}
                    onChange={(e) => setRateCurFrom(e.target.value.toUpperCase())}
                  >
                    <option value="">Currency</option>
                    {w.currencyList.map((c) => (
                      <option key={c.code} value={String(c.code).toUpperCase()}>
                        {String(c.code).toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    id="rate_currency_from_amount"
                    className="transaction-input"
                    placeholder="Amount"
                    value={rateFromAmt}
                    onChange={(e) => setRateFromAmt(e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    id="rate_exchange_rate"
                    className="transaction-input"
                    placeholder="Rate"
                    value={rateExchRaw}
                    onChange={(e) => setRateExchRaw(e.target.value)}
                  />
                  <select
                    id="rate_currency_to"
                    className="transaction-select"
                    value={rateCurTo}
                    onChange={(e) => setRateCurTo(e.target.value.toUpperCase())}
                  >
                    <option value="">Currency</option>
                    {w.currencyList.map((c) => (
                      <option key={c.code} value={String(c.code).toUpperCase()}>
                        {String(c.code).toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    id="rate_currency_to_amount"
                    className="transaction-input"
                    placeholder="Amount"
                    readOnly
                    value={rateToDisplayStr}
                  />
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <AccountSearchField
                    value={rateXferTo}
                    onChange={setRateXferTo}
                    options={accounts}
                    placeholder="--Select To Account--"
                  />
                  <AccountSearchField
                    value={rateXferFrom}
                    onChange={setRateXferFrom}
                    options={accounts}
                    placeholder="--Select From Account--"
                  />
                  <button
                    type="button"
                    id="rate_transfer_reverse_btn"
                    className="transaction-account-reverse-btn rate-reverse-btn"
                    title="Reverse accounts"
                    aria-label="Reverse accounts"
                    onClick={reverseRateTransferRow}
                  >
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Middle-Man</label>
                <div className="rate-row rate-row-three-cols">
                  <AccountSearchField
                    value={rateMiddleAcct}
                    onChange={setRateMiddleAcct}
                    options={accounts}
                    placeholder="--Select Account--"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    id="rate_middleman_rate"
                    className="transaction-input"
                    placeholder="Rate multiplier"
                    value={rateMMRate}
                    onChange={(e) => setRateMMRate(e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    id="rate_middleman_amount"
                    className="transaction-input"
                    placeholder="Amount"
                    readOnly
                    value={rateMmDisplayStr}
                  />
                </div>
              </div>
            </div>

          <div className="transaction-form-group" style={{ display: 'none' }}>
            <label className="transaction-label">Description</label>
            <input
              type="text"
              id="action_description"
              className="transaction-input text-uppercase"
              readOnly
              defaultValue=""
              aria-hidden
            />
          </div>

          <div
            className="transaction-two-col"
            style={{ display: isRate ? 'none' : undefined }}
          >
            <div className="transaction-form-group" id="remark_form_group">
              <label className="transaction-label">Remark</label>
              <input
                type="text"
                id="action_sms"
                className="transaction-input text-uppercase"
                value={remark}
                onChange={(e) => setRemark(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="transaction-confirm-actions">
            <label className="transaction-checkbox-label transaction-confirm-label">
              <input
                type="checkbox"
                id="confirm_submit"
                className="transaction-checkbox"
                checked={confirmSubmit}
                onChange={(e) => setConfirmSubmit(e.target.checked)}
              />
              Confirm Submit
            </label>
            <div className="transaction-action-btns">
              <button
                type="button"
                id="submit_btn"
                className="transaction-submit-btn"
                disabled={!submitEnabled}
                onClick={() => void onSubmit()}
              >
                Submit
              </button>
              <button
                type="button"
                id="action_search_btn"
                className="transaction-search-btn"
                disabled={searchLoading || w.activeCompanyId == null}
                onClick={() => void runSearch()}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="transaction-tables-section"
        style={{
          display: rawSearch ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        <div
          id="transaction-tables-loading"
          className="transaction-tables-loading"
          style={{ display: searchLoading ? 'flex' : 'none' }}
          aria-live="polite"
        >
          Loading...
        </div>

        {!multiCurrencyView && rawSearch && (
          <div id="default-tables-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {w.selectedCurrencies.length === 1 && (
              <h3 id="default-currency-title" style={{ display: 'block' }}>
                Currency: {w.selectedCurrencies[0]}
              </h3>
            )}
            <div style={{ display: 'flex', gap: 20, width: '100%' }}>
              <div className="transaction-table-wrapper" style={{ flex: '1 1 0', minWidth: 0 }}>
                <table className="transaction-table" id="table_left">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th
                        className="transaction-name-column"
                        style={{ display: showName ? '' : 'none' }}
                      >
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_left">
                    {sortedLeft.map((row) => {
                      const rc = getRoleClass(String(row.role || ''))
                      const alertClass =
                        row.is_alert == 1 || row.is_alert === true
                          ? ' transaction-alert-row'
                          : ''
                      return (
                        <tr key={`${row.account_db_id}_${row.currency}`} className={'transaction-table-row' + alertClass}>
                          <td
                            className={rc ? `transaction-account-cell ${rc}` : 'transaction-account-cell'}
                            style={{ cursor: 'pointer' }}
                            onClick={() => openPaymentHistory(row)}
                          >
                            {row.account_id}
                          </td>
                          <td
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          >
                            {toUpperDisplay(row.account_name)}
                          </td>
                          <td>{formatTxNumber(row.bf)}</td>
                          <td>{formatTxNumber(row.win_loss)}</td>
                          <td>{formatTxNumber(row.cr_dr)}</td>
                          <td
                            className="transaction-balance-cell"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onBalanceCellClick(row, true)}
                          >
                            {formatTxNumber(row.balance)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td
                        className="transaction-name-column"
                        style={{ display: showName ? '' : 'none' }}
                      />
                      <td>{formatTxNumber(leftTotals.bf)}</td>
                      <td>{formatTxNumber(leftTotals.win_loss)}</td>
                      <td>{formatTxNumber(leftTotals.cr_dr)}</td>
                      <td>{formatTxNumber(leftTotals.balance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="transaction-table-wrapper" style={{ flex: '1 1 0', minWidth: 0 }}>
                <table className="transaction-table" id="table_right">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th
                        className="transaction-name-column"
                        style={{ display: showName ? '' : 'none' }}
                      >
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_right">
                    {sortedRight.map((row) => {
                      const rc = getRoleClass(String(row.role || ''))
                      const alertClass =
                        row.is_alert == 1 || row.is_alert === true
                          ? ' transaction-alert-row'
                          : ''
                      return (
                        <tr key={`${row.account_db_id}_${row.currency}`} className={'transaction-table-row' + alertClass}>
                          <td
                            className={rc ? `transaction-account-cell ${rc}` : 'transaction-account-cell'}
                            style={{ cursor: 'pointer' }}
                            onClick={() => openPaymentHistory(row)}
                          >
                            {row.account_id}
                          </td>
                          <td
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          >
                            {toUpperDisplay(row.account_name)}
                          </td>
                          <td>{formatTxNumber(row.bf)}</td>
                          <td>{formatTxNumber(row.win_loss)}</td>
                          <td>{formatTxNumber(row.cr_dr)}</td>
                          <td
                            className="transaction-balance-cell"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onBalanceCellClick(row, false)}
                          >
                            {formatTxNumber(row.balance)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td
                        className="transaction-name-column"
                        style={{ display: showName ? '' : 'none' }}
                      />
                      <td>{formatTxNumber(rightTotals.bf)}</td>
                      <td>{formatTxNumber(rightTotals.win_loss)}</td>
                      <td>{formatTxNumber(rightTotals.cr_dr)}</td>
                      <td>{formatTxNumber(rightTotals.balance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {multiCurrencyView && rawSearch && (
          <div id="currency-grouped-tables-container">
            {groupedSections.map((g) => (
              <div key={g.currency}>
                <h3 style={{ margin: '20px 0 10px 0' }}>Currency: {g.currency}</h3>
                <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                  <div className="transaction-table-wrapper">
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>Account</th>
                          <th
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          >
                            Name
                          </th>
                          <th>B/F</th>
                          <th>Win/Loss</th>
                          <th>Cr/Dr</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.left.map((row) => (
                          <tr key={`${row.account_db_id}_${g.currency}`} className="transaction-table-row">
                            <td
                              className="transaction-account-cell"
                              style={{ cursor: 'pointer' }}
                              onClick={() => openPaymentHistory(row)}
                            >
                              {row.account_id}
                            </td>
                            <td
                              className="transaction-name-column"
                              style={{ display: showName ? '' : 'none' }}
                            >
                              {toUpperDisplay(row.account_name)}
                            </td>
                            <td>{formatTxNumber(row.bf)}</td>
                            <td>{formatTxNumber(row.win_loss)}</td>
                            <td>{formatTxNumber(row.cr_dr)}</td>
                            <td
                              className="transaction-balance-cell"
                              style={{ cursor: 'pointer' }}
                              onClick={() => onBalanceCellClick(row, true)}
                            >
                              {formatTxNumber(row.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>Total</td>
                          <td
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          />
                          <td>{formatTxNumber(calculateTxTotals(g.left).bf)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.left).win_loss)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.left).cr_dr)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.left).balance)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="transaction-table-wrapper">
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>Account</th>
                          <th
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          >
                            Name
                          </th>
                          <th>B/F</th>
                          <th>Win/Loss</th>
                          <th>Cr/Dr</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.right.map((row) => (
                          <tr key={`${row.account_db_id}_${g.currency}`} className="transaction-table-row">
                            <td
                              className="transaction-account-cell"
                              style={{ cursor: 'pointer' }}
                              onClick={() => openPaymentHistory(row)}
                            >
                              {row.account_id}
                            </td>
                            <td
                              className="transaction-name-column"
                              style={{ display: showName ? '' : 'none' }}
                            >
                              {toUpperDisplay(row.account_name)}
                            </td>
                            <td>{formatTxNumber(row.bf)}</td>
                            <td>{formatTxNumber(row.win_loss)}</td>
                            <td>{formatTxNumber(row.cr_dr)}</td>
                            <td
                              className="transaction-balance-cell"
                              style={{ cursor: 'pointer' }}
                              onClick={() => onBalanceCellClick(row, false)}
                            >
                              {formatTxNumber(row.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>Total</td>
                          <td
                            className="transaction-name-column"
                            style={{ display: showName ? '' : 'none' }}
                          />
                          <td>{formatTxNumber(calculateTxTotals(g.right).bf)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.right).win_loss)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.right).cr_dr)}</td>
                          <td>{formatTxNumber(calculateTxTotals(g.right).balance)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <table className="transaction-summary-table" style={{ margin: '0 auto 24px', maxWidth: 400 }}>
                  <thead>
                    <tr className="transaction-table-header">
                      <th colSpan={2}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="transaction-table-row">
                      <td className="transaction-summary-label">B/F</td>
                      <td>{formatTxNumber(g.summary.bf)}</td>
                    </tr>
                    <tr className="transaction-table-row">
                      <td className="transaction-summary-label">Win/Loss</td>
                      <td>{formatTxNumber(g.summary.win_loss)}</td>
                    </tr>
                    <tr className="transaction-table-row">
                      <td className="transaction-summary-label">Cr/Dr</td>
                      <td>{formatTxNumber(g.summary.cr_dr)}</td>
                    </tr>
                    <tr className="transaction-table-row">
                      <td className="transaction-summary-label">Balance</td>
                      <td>{formatTxNumber(g.summary.balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {!multiCurrencyView && rawSearch && (
        <div
          className="transaction-summary-section"
          style={{ display: 'flex' }}
        >
          <table className="transaction-summary-table">
            <thead>
              <tr className="transaction-table-header">
                <th colSpan={2}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">B/F</td>
                <td id="sum_total_bf">{formatTxNumber(summaryTotals.bf)}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Win/Loss</td>
                <td id="sum_total_winloss">{formatTxNumber(summaryTotals.win_loss)}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Cr/Dr</td>
                <td id="sum_total_crdr">{formatTxNumber(summaryTotals.cr_dr)}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Balance</td>
                <td id="sum_total_balance">{formatTxNumber(summaryTotals.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {searchError && (
        <p className="tShell__searchErr" role="alert">
          {searchError}
        </p>
      )}
    </div>

    <div
      id="historyModal"
      className="transaction-modal"
      style={{ display: historyOpen ? 'flex' : 'none' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal_title"
    >
      <div className="transaction-modal-content">
        <div className="transaction-modal-header">
          <h3 id="modal_title">{historyTitle}</h3>
          <button
            type="button"
            id="modal_close"
            className="transaction-modal-close"
            onClick={closePaymentHistory}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="transaction-modal-body">
          <div className="transaction-history-table-frame">
            <table className="transaction-table">
              <thead>
                <tr className="transaction-table-header">
                  <th className="transaction-history-col-date">Date</th>
                  <th className="transaction-history-col-product">Id Product</th>
                  <th className="transaction-history-col-currency">Currency</th>
                  <th className="transaction-history-col-rate">Rate</th>
                  <th className="transaction-history-col-winloss">Win/Loss</th>
                  <th className="transaction-history-col-crdr">Cr/Dr</th>
                  <th className="transaction-history-col-balance">Balance</th>
                  {showDescriptionColumn ? (
                    <>
                      <th className="transaction-history-col-description">Description</th>
                      <th className="transaction-history-col-remark">Remark</th>
                    </>
                  ) : (
                    <th className="transaction-history-col-remark">Remark</th>
                  )}
                  <th className="transaction-history-col-created">Created by</th>
                </tr>
              </thead>
              <tbody id="modal_tbody">
                {historyLoading && (
                  <tr className="transaction-table-row">
                    <td
                      colSpan={showDescriptionColumn ? 10 : 9}
                      style={{ padding: '16px', color: '#6b7280' }}
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!historyLoading &&
                  historyData?.history.map((hRow, hi) => {
                    const isBf = hRow.row_type === 'bf'
                    const winLoss =
                      hRow.win_loss === '-' ? '-' : formatTxNumber(hRow.win_loss)
                    const crDr = hRow.cr_dr === '-' ? '-' : formatTxNumber(hRow.cr_dr)
                    const balance =
                      hRow.balance === '-' ? '-' : formatTxNumber(hRow.balance)
                    const remarkValue = getHistoryRemark(hRow)
                    const descriptionDisplay = toUpperDisplay(hRow.description)
                    const idProductDisplay = hRow.is_bank_process_transaction
                      ? hRow.card_owner || '-'
                      : hRow.product || '-'
                    const createdRaw = hRow.created_by
                    const createdByDisplay =
                      createdRaw == null ||
                      String(createdRaw).trim() === '' ||
                      String(createdRaw).toLowerCase() === 'null'
                        ? '-'
                        : String(createdRaw)
                    return (
                      <tr
                        key={`${hRow.row_type}_${hRow.date}_${hi}`}
                        className={
                          isBf
                            ? 'transaction-bf-row transaction-table-row'
                            : 'transaction-table-row'
                        }
                        style={
                          isBf
                            ? { fontWeight: 'bold', backgroundColor: '#f0f0f0' }
                            : undefined
                        }
                      >
                        <td className="transaction-history-col-date">{hRow.date}</td>
                        <td className="transaction-history-col-product">
                          {idProductDisplay}
                        </td>
                        <td className="transaction-history-col-currency">
                          {hRow.currency || '-'}
                        </td>
                        <td className="transaction-history-col-rate">
                          {hRow.rate ?? '-'}
                        </td>
                        <td className="transaction-history-col-winloss">{winLoss}</td>
                        <td className="transaction-history-col-crdr">{crDr}</td>
                        <td className="transaction-history-col-balance">{balance}</td>
                        {showDescriptionColumn ? (
                          <>
                            <td className="transaction-history-col-description text-uppercase">
                              {descriptionDisplay}
                            </td>
                            <td className="transaction-history-col-remark text-uppercase">
                              {remarkValue}
                            </td>
                          </>
                        ) : (
                          <td className="transaction-history-col-remark text-uppercase">
                            {remarkValue}
                          </td>
                        )}
                        <td className="transaction-history-col-created">
                          {createdByDisplay}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
