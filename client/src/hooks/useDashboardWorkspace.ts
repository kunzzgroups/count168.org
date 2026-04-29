import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChartData } from 'chart.js'
import {
  fetchOrderedCompanyCurrencies,
  type CompanyCurrency,
} from '../lib/companyCurrenciesApi'
import {
  buildTrendChartData,
  listYmdInClosedRange,
  shouldAggregateByMonth,
} from '../lib/buildTrendChartDatasets'
import {
  filterCompaniesForDashboardRow,
  isDashboardDataScopeValid,
  resolveInitialGroupSelection,
  uniqueGroupIds,
  writeStoredGroupFilter,
} from '../lib/dashboardSession'
import { fetchDashboardForCompany } from '../lib/dashboardTransactionApi'
import { mergeGroupDashboardData } from '../lib/mergeGroupDashboardData'
import { kpiFromDashboardData } from '../lib/kpiFromDashboardData'
import { refineChartDataWithCardPoints } from '../lib/refineChartDataWithCardPoints'
import {
  type QuickRangeId,
  QUICK_RANGE_LABEL,
  computeQuickDateRange,
} from '../lib/quickDateRange'
import { apiFetch } from '../lib/api'
import {
  fetchOwnerCompaniesList,
  updateSessionCompany,
} from '../lib/ownerCompaniesApi'
import type {
  DashboardApiPayload,
  DashboardBootstrapData,
  OwnerCompany,
} from '../types/dashboard'

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultDateRange(): { from: string; to: string } {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const to = formatYmd(t)
  const from = formatYmd(new Date(t.getFullYear(), t.getMonth(), 1))
  return { from, to }
}

function validateDashboardResponse(data: DashboardApiPayload | null): boolean {
  if (!data || typeof data !== 'object') return false
  if (!data.daily_data || typeof data.daily_data !== 'object') return false
  if (!data.date_range?.from || !data.date_range?.to) return false
  return true
}

/**
 * 与 `js/dashboard.js` 主区行为对齐：公司/Group/All、币别、日期、KPI、图表与按日细调。
 */
export function useDashboardWorkspace(bootstrap: DashboardBootstrapData) {
  const initRange = useMemo(() => defaultDateRange(), [])

  const [companies, setCompanies] = useState<OwnerCompany[]>([])
  const [loadCompaniesError, setLoadCompaniesError] = useState(false)
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(
    bootstrap.companyId,
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [isGroupAllMode, setIsGroupAllMode] = useState(false)
  const [dateFrom, setDateFromState] = useState(initRange.from)
  const [dateTo, setDateToState] = useState(initRange.to)
  const [currentRangeType, setCurrentRangeType] = useState<'year' | null>(null)
  const [quickSelectLabel, setQuickSelectLabel] = useState<string | null>(null)
  const [currency, setCurrency] = useState('')
  const [payload, setPayload] = useState<DashboardApiPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [companiesReady, setCompaniesReady] = useState(false)
  const [dataReload, setDataReload] = useState(0)
  const [companyLoadKey, setCompanyLoadKey] = useState(0)
  const [currencyList, setCurrencyList] = useState<CompanyCurrency[]>([])

  const [refinedChart, setRefinedChart] = useState<ChartData<'line'> | null>(
    null,
  )
  const [chartLineVisible, setChartLineVisible] = useState([
    true,
    true,
    true,
    true,
  ])

  const lastSessionCompany = useRef<number | null>(null)

  const setDateFrom = (v: string) => {
    setCurrentRangeType(null)
    setQuickSelectLabel(null)
    setDateFromState(v)
  }

  const setDateTo = (v: string) => {
    setCurrentRangeType(null)
    setQuickSelectLabel(null)
    setDateToState(v)
  }

  const selectQuickRange = (range: QuickRangeId) => {
    const { from, to, currentRangeType: rt } = computeQuickDateRange(range)
    setDateFromState(from)
    setDateToState(to)
    setCurrentRangeType(rt)
    setQuickSelectLabel(QUICK_RANGE_LABEL[range])
  }

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
        const r = resolveInitialGroupSelection(
          list,
          bootstrap.companyId,
        )
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

  const scopeValid = isDashboardDataScopeValid(
    companies,
    activeCompanyId,
    selectedGroup,
    isGroupAllMode,
  )

  const scopeCompanies = useMemo(
    () => filterCompaniesForDashboardRow(companies, selectedGroup),
    [companies, selectedGroup],
  )

  const showGroupAll = !!selectedGroup && scopeCompanies.length > 1

  useEffect(() => {
    if (!showGroupAll && isGroupAllMode) setIsGroupAllMode(false)
  }, [showGroupAll, isGroupAllMode])

  useEffect(() => {
    if (!companiesReady || !companies.length) return
    if (activeCompanyId == null || !scopeValid) {
      setPayload(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setDataError(null)
    ;(async () => {
      try {
        if (!isGroupAllMode) {
          const ok = await updateSessionCompany(activeCompanyId)
          if (cancelled) return
          if (!ok) {
            setDataError('公司会话更新失败')
            setPayload(null)
            return
          }
          if (
            lastSessionCompany.current !== null &&
            lastSessionCompany.current !== activeCompanyId
          ) {
            window.dispatchEvent(new Event('c168:company-session-updated'))
          }
          lastSessionCompany.current = activeCompanyId
        }

        const sessionCompanyId = activeCompanyId
        const curList = await fetchOrderedCompanyCurrencies(sessionCompanyId)
        if (cancelled) return
        setCurrencyList(curList)
        let useCurrency = String(currency || '')
          .trim()
          .toUpperCase()
        if (
          !useCurrency ||
          !curList.some(
            (c) => (c.code || '').toUpperCase() === useCurrency,
          )
        ) {
          useCurrency = (curList[0]?.code || '').toUpperCase() || ''
        }
        if (useCurrency && useCurrency !== currency) {
          setCurrency(useCurrency)
        }
        if (isGroupAllMode && selectedGroup) {
          const groupCompanies = companies.filter(
            (c) =>
              c.group_id &&
              String(c.group_id).toUpperCase() === selectedGroup &&
              c.company_id &&
              String(c.company_id).trim() !== '',
          )
          if (groupCompanies.length === 0) {
            setDataError('该 Group 下没有可用公司。')
            setPayload(null)
            return
          }
          const results = await Promise.all(
            groupCompanies.map((c) =>
              fetchDashboardForCompany(
                {
                  dateFrom,
                  dateTo,
                  companyId: c.id,
                  currency: useCurrency,
                  viewGroup: selectedGroup,
                },
                companies,
              ),
            ),
          )
          if (cancelled) return
          const valid = results.filter(validateDashboardResponse)
          if (valid.length === 0) {
            setDataError('Group 数据无效或为空。')
            setPayload(null)
            return
          }
          setPayload(
            mergeGroupDashboardData(valid, { from: dateFrom, to: dateTo }),
          )
        } else {
          const data = await fetchDashboardForCompany(
            {
              dateFrom,
              dateTo,
              companyId: activeCompanyId,
              currency: useCurrency,
              viewGroup: selectedGroup,
            },
            companies,
          )
          if (cancelled) return
          setPayload(data)
        }
      } catch (e) {
        if (cancelled) return
        setPayload(null)
        setDataError(
          e instanceof Error ? e.message : '数据加载失败',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    companiesReady,
    companies,
    activeCompanyId,
    selectedGroup,
    isGroupAllMode,
    dateFrom,
    dateTo,
    currency,
    scopeValid,
    dataReload,
  ])

  const baseChart: ChartData<'line'> | null = useMemo(() => {
    if (!payload) return null
    try {
      return buildTrendChartData(
        payload,
        dateFrom,
        dateTo,
        currentRangeType,
      ) as ChartData<'line'>
    } catch {
      return null
    }
  }, [payload, dateFrom, dateTo, currentRangeType])

  const chartSortedKeys = useMemo(() => {
    if (!payload) return [] as string[]
    if (shouldAggregateByMonth(dateFrom, dateTo, currentRangeType)) {
      const keys: string[] = []
      const start = new Date(dateFrom + 'T00:00:00')
      const end = new Date(dateTo + 'T00:00:00')
      const cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        const y = cur.getFullYear()
        const m = cur.getMonth() + 1
        keys.push(`${y}-${String(m).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
      }
      return keys
    }
    return listYmdInClosedRange(dateFrom, dateTo)
  }, [payload, dateFrom, dateTo, currentRangeType])

  useEffect(() => {
    if (!payload) {
      setRefinedChart(null)
      return
    }
    if (!companiesReady || !scopeValid) {
      setRefinedChart(null)
      return
    }
    if (isGroupAllMode) {
      setRefinedChart(null)
      return
    }
    if (selectedGroup) {
      setRefinedChart(null)
      return
    }
    if (activeCompanyId == null) {
      setRefinedChart(null)
      return
    }
    if (shouldAggregateByMonth(dateFrom, dateTo, currentRangeType)) {
      setRefinedChart(null)
      return
    }
    const ymd = listYmdInClosedRange(dateFrom, dateTo)
    if (ymd.length === 0) {
      setRefinedChart(null)
      return
    }
    setRefinedChart(null)
    const base = buildTrendChartData(
      payload,
      dateFrom,
      dateTo,
      currentRangeType,
    ) as ChartData<'line'>
    const cur = String(currency || '')
      .trim()
      .toUpperCase()
    let cancelled = false
    void (async () => {
      try {
        const r = await refineChartDataWithCardPoints(
          base,
          payload,
          ymd,
          activeCompanyId,
          cur,
        )
        if (!cancelled) setRefinedChart(r)
      } catch {
        if (!cancelled) setRefinedChart(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    payload,
    dateFrom,
    dateTo,
    currentRangeType,
    selectedGroup,
    isGroupAllMode,
    activeCompanyId,
    currency,
    companiesReady,
    scopeValid,
  ])

  const chartData: ChartData<'line'> | null = useMemo(() => {
    const src = refinedChart ?? baseChart
    if (!src) return null
    return {
      ...src,
      datasets: src.datasets.map((d, i) => ({
        ...d,
        hidden: !chartLineVisible[i]!,
      })),
    }
  }, [refinedChart, baseChart, chartLineVisible])

  const toggleChartLine = (index: number) => {
    setChartLineVisible((v) => {
      const n = [...v]
      n[index] = !n[index]
      return n
    })
  }

  const kpi = useMemo(
    () => (payload ? kpiFromDashboardData(payload, selectedGroup) : null),
    [payload, selectedGroup],
  )

  const setGroup = useCallback(
    (g: string | null) => {
      setIsGroupAllMode(false)
      if (g === null) {
        writeStoredGroupFilter(null)
        setSelectedGroup(null)
        const independent = companies.filter(
          (c) => !c.group_id || String(c.group_id).trim() === '',
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

  const applyMonthYearSelection = useCallback(
    (year: number, month: number | null) => {
      if (month != null && month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0).getDate()
        setDateFromState(
          `${year}-${String(month).padStart(2, '0')}-01`,
        )
        setDateToState(
          `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        )
        setCurrentRangeType(null)
      } else {
        setDateFromState(`${year}-01-01`)
        setDateToState(`${year}-12-31`)
        setCurrentRangeType('year')
      }
      setQuickSelectLabel(null)
    },
    [],
  )

  const reorderCurrencies = useCallback(
    (newOrder: string[]) => {
      const normalized = newOrder
        .map((c) => String(c || '').trim().toUpperCase())
        .filter(Boolean)
      const uniq = normalized.filter((c, i, a) => a.indexOf(c) === i)
      setCurrencyList((prev) => {
        const by = new Map(
          prev.map((x) => [String(x.code || '').toUpperCase(), x]),
        )
        const out: CompanyCurrency[] = []
        for (const code of uniq) {
          const row = by.get(code)
          if (row) out.push(row)
        }
        by.forEach((row, code) => {
          if (!uniq.includes(code)) out.push(row)
        })
        return out
      })
      const first = uniq[0] ?? ''
      if (first) setCurrency(first)
      try {
        const cid = activeCompanyId ?? 0
        const serialized = JSON.stringify(uniq)
        localStorage.setItem('dashboard_currency_order_' + cid, serialized)
        localStorage.setItem('dashboard_currency_order_global', serialized)
        localStorage.setItem('transaction_currency_order_' + cid, serialized)
        localStorage.setItem('transaction_currency_order_global', serialized)
      } catch {
        /* ignore */
      }
      void apiFetch('/api/transactions/user_currency_order_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: uniq }),
      }).catch(() => {})
    },
    [activeCompanyId],
  )

  const onPickCompany = (id: number) => {
    setIsGroupAllMode(false)
    setActiveCompanyId(id)
  }

  const onToggleGroupAll = useCallback(() => {
    if (!selectedGroup) return
    if (scopeCompanies.length < 2) return
    if (isGroupAllMode) {
      setIsGroupAllMode(false)
      setActiveCompanyId(scopeCompanies[0]!.id)
    } else {
      setIsGroupAllMode(true)
    }
  }, [selectedGroup, scopeCompanies, isGroupAllMode])

  const quickThisMonth = () => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    setDateToState(formatYmd(t))
    setDateFromState(formatYmd(new Date(t.getFullYear(), t.getMonth(), 1)))
    setCurrentRangeType(null)
    setQuickSelectLabel(QUICK_RANGE_LABEL.thisMonth)
  }

  const refreshData = useCallback(() => {
    setDataReload((n) => n + 1)
  }, [])

  const retryLoadCompanies = useCallback(() => {
    setCompanyLoadKey((n) => n + 1)
  }, [])

  return {
    companies,
    loadCompaniesError,
    companiesReady,
    activeCompanyId,
    onPickCompany,
    selectedGroup,
    setGroup,
    groupIds: uniqueGroupIds(companies),
    scopeCompanies,
    showGroupAll,
    isGroupAllMode,
    onToggleGroupAll,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    currentRangeType,
    quickSelectLabel,
    selectQuickRange,
    quickThisMonth,
    currency,
    setCurrency,
    currencyList,
    scopeValid,
    loading,
    dataError,
    payload,
    kpi,
    chartData,
    chartSortedKeys,
    chartLineVisible,
    toggleChartLine,
    refreshData,
    retryLoadCompanies,
    applyMonthYearSelection,
    reorderCurrencies,
  }
}
