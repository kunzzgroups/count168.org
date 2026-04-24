import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchOrderedCompanyCurrencies,
  type CompanyCurrency,
} from '../lib/companyCurrenciesApi'
import {
  filterCompaniesForDashboardRow,
  resolveInitialGroupSelection,
  uniqueGroupIds,
  writeStoredGroupFilter,
} from '../lib/dashboardSession'
import { fetchOwnerCompaniesList, updateSessionCompany } from '../lib/ownerCompaniesApi'
import {
  QUICK_RANGE_LABEL,
  computeQuickDateRange,
  type QuickRangeId,
} from '../lib/quickDateRange'
import type { DashboardBootstrapData, OwnerCompany } from '../types/dashboard'

const TX_CUR_LS_PREFIX = 'transaction_currency_filter_v1_'

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function transactionDefaultRange(): { from: string; to: string } {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const y = formatYmd(t)
  return { from: y, to: y }
}

function readCurrencyFilter(companyId: number | null): {
  showAll: boolean
  currencies: string[]
} | null {
  if (companyId == null) return null
  try {
    const raw = localStorage.getItem(TX_CUR_LS_PREFIX + companyId)
    if (!raw) return null
    const o = JSON.parse(raw) as { showAll?: boolean; currencies?: unknown }
    if (!o || typeof o !== 'object') return null
    const currencies = Array.isArray(o.currencies)
      ? o.currencies.map((c) => String(c || '').trim()).filter(Boolean)
      : []
    return { showAll: !!o.showAll, currencies }
  } catch {
    return null
  }
}

function writeCurrencyFilter(
  companyId: number,
  showAll: boolean,
  currencies: string[],
) {
  try {
    localStorage.setItem(
      TX_CUR_LS_PREFIX + companyId,
      JSON.stringify({ showAll, currencies }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Company / Group / Capture Date / Currency 筛选，与经典 Transaction 页及 Dashboard 行内控件对齐。
 */
export function useTransactionWorkspace(bootstrap: DashboardBootstrapData) {
  const initRange = useMemo(() => transactionDefaultRange(), [])

  const [companies, setCompanies] = useState<OwnerCompany[]>([])
  const [loadCompaniesError, setLoadCompaniesError] = useState(false)
  const [companiesReady, setCompaniesReady] = useState(false)
  const [companyLoadKey, setCompanyLoadKey] = useState(0)

  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(
    bootstrap.companyId,
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const [dateFrom, setDateFromState] = useState(initRange.from)
  const [dateTo, setDateToState] = useState(initRange.to)
  const [quickSelectLabel, setQuickSelectLabel] = useState<string | null>(null)

  const [currencyList, setCurrencyList] = useState<CompanyCurrency[]>([])
  const [showAllCurrencies, setShowAllCurrencies] = useState(true)
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([])

  const lastSessionCompany = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await fetchOwnerCompaniesList()
        if (!alive) return
        if (list.length === 0) {
          setLoadCompaniesError(true)
          setCompaniesReady(true)
          return
        }
        setCompanies(list)
        const r = resolveInitialGroupSelection(list, bootstrap.companyId)
        if (!alive) return
        setActiveCompanyId(r.activeCompanyId)
        setSelectedGroup(r.selectedGroup)
        setLoadCompaniesError(false)
      } catch {
        if (!alive) return
        setLoadCompaniesError(true)
      } finally {
        if (alive) setCompaniesReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [bootstrap.companyId, companyLoadKey])

  const scopeCompanies = useMemo(
    () => filterCompaniesForDashboardRow(companies, selectedGroup),
    [companies, selectedGroup],
  )

  const setGroup = useCallback(
    (g: string | null) => {
      if (g === null) {
        writeStoredGroupFilter(null)
        setSelectedGroup(null)
        // 与 `includes/company_filter.php` 无 Group 时一致：仅显示无 group_id 且有公司代码的行
        const independent = companies.filter(
          (c) =>
            c.company_id &&
            String(c.company_id).trim() !== '' &&
            (!c.group_id || String(c.group_id).trim() === ''),
        )
        if (independent.length > 0) {
          setActiveCompanyId(independent[0]!.id)
        }
        return
      }
      writeStoredGroupFilter(g)
      setSelectedGroup(g)
      const u = g.toUpperCase()
      const groupCompanies = companies.filter(
        (c) =>
          c.group_id &&
          String(c.group_id).toUpperCase() === u &&
          c.company_id &&
          String(c.company_id).trim() !== '',
      )
      if (groupCompanies.length > 0) {
        setActiveCompanyId(groupCompanies[0]!.id)
      }
    },
    [companies],
  )

  const onPickCompany = (id: number) => {
    setActiveCompanyId(id)
  }

  const setDateFrom = (v: string) => {
    setQuickSelectLabel(null)
    setDateFromState(v)
  }

  const setDateTo = (v: string) => {
    setQuickSelectLabel(null)
    setDateToState(v)
  }

  const selectQuickRange = (range: QuickRangeId) => {
    const { from, to } = computeQuickDateRange(range)
    setDateFromState(from)
    setDateToState(to)
    setQuickSelectLabel(QUICK_RANGE_LABEL[range])
  }

  useEffect(() => {
    if (!companiesReady || activeCompanyId == null) {
      setCurrencyList([])
      return
    }

    let cancelled = false
    ;(async () => {
      const ok = await updateSessionCompany(activeCompanyId)
      if (cancelled) return
      if (!ok) {
        setCurrencyList([])
        return
      }
      if (
        lastSessionCompany.current !== null &&
        lastSessionCompany.current !== activeCompanyId
      ) {
        window.dispatchEvent(new Event('c168:company-session-updated'))
      }
      lastSessionCompany.current = activeCompanyId

      const curList = await fetchOrderedCompanyCurrencies(activeCompanyId)
      if (cancelled) return
      setCurrencyList(curList)

      const saved = readCurrencyFilter(activeCompanyId)
      const codes = curList
        .map((c) => String(c.code || '').trim().toUpperCase())
        .filter(Boolean)
      if (saved) {
        setShowAllCurrencies(saved.showAll)
        if (saved.showAll) {
          setSelectedCurrencies([])
        } else {
          const sel = saved.currencies
            .map((c) => c.toUpperCase())
            .filter((c) => codes.includes(c))
          setSelectedCurrencies(sel.length > 0 ? sel : codes.length ? [codes[0]!] : [])
        }
      } else {
        setShowAllCurrencies(false)
        setSelectedCurrencies(codes.length ? [codes[0]!] : [])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [companiesReady, activeCompanyId])

  const persistCurrencySelection = useCallback(
    (all: boolean, sel: string[]) => {
      if (activeCompanyId == null) return
      writeCurrencyFilter(activeCompanyId, all, sel)
    },
    [activeCompanyId],
  )

  const toggleShowAllCurrencies = useCallback(() => {
    setShowAllCurrencies((prev) => {
      const next = !prev
      if (next) {
        setSelectedCurrencies([])
        if (activeCompanyId != null) persistCurrencySelection(true, [])
      } else {
        const codes = currencyList
          .map((c) => String(c.code || '').trim().toUpperCase())
          .filter(Boolean)
        const one = codes.length ? [codes[0]!] : []
        setSelectedCurrencies(one)
        if (activeCompanyId != null) persistCurrencySelection(false, one)
      }
      return next
    })
  }, [activeCompanyId, currencyList, persistCurrencySelection])

  const toggleCurrencyCode = useCallback(
    (code: string) => {
      const u = code.toUpperCase()
      setShowAllCurrencies(false)
      setSelectedCurrencies((prev) => {
        const has = prev.map((x) => x.toUpperCase()).includes(u)
        const next = has
          ? prev.filter((x) => x.toUpperCase() !== u)
          : [...prev, u]
        if (activeCompanyId != null) persistCurrencySelection(false, next)
        return next
      })
    },
    [activeCompanyId, persistCurrencySelection],
  )

  const retryLoadCompanies = useCallback(() => {
    setCompanyLoadKey((n) => n + 1)
  }, [])

  return {
    companies,
    companiesReady,
    loadCompaniesError,
    retryLoadCompanies,
    activeCompanyId,
    onPickCompany,
    selectedGroup,
    setGroup,
    groupIds: uniqueGroupIds(companies),
    scopeCompanies,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    quickSelectLabel,
    selectQuickRange,
    currencyList,
    showAllCurrencies,
    selectedCurrencies,
    toggleShowAllCurrencies,
    toggleCurrencyCode,
  }
}
