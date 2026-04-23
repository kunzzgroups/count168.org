import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChartData } from 'chart.js'
import {
  fetchOrderedCompanyCurrencies,
  type CompanyCurrency,
} from '../lib/companyCurrenciesApi'
import { buildTrendChartData } from '../lib/buildTrendChartDatasets'
import {
  isDashboardDataScopeValid,
  resolveInitialGroupSelection,
  uniqueGroupIds,
  writeStoredGroupFilter,
} from '../lib/dashboardSession'
import { fetchDashboardForCompany } from '../lib/dashboardTransactionApi'
import { kpiFromDashboardData } from '../lib/kpiFromDashboardData'
import {
  fetchOwnerCompaniesList,
  updateSessionCompany,
} from '../lib/ownerCompaniesApi'
import type { DashboardApiPayload, DashboardBootstrapData, OwnerCompany } from '../types/dashboard'

function defaultDateRange(): { from: string; to: string } {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const to = formatYmd(t)
  const from = formatYmd(new Date(t.getFullYear(), t.getMonth(), 1))
  return { from, to }
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 阶段 2：公司/Group/币别/日期 + Dashboard 数据 + KPI + 图表数据。
 */
export function useDashboardWorkspace(bootstrap: DashboardBootstrapData) {
  const initRange = useMemo(() => defaultDateRange(), [])

  const [companies, setCompanies] = useState<OwnerCompany[]>([])
  const [loadCompaniesError, setLoadCompaniesError] = useState(false)
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(
    bootstrap.companyId,
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(initRange.from)
  const [dateTo, setDateTo] = useState(initRange.to)
  const [currency, setCurrency] = useState('')
  const [payload, setPayload] = useState<DashboardApiPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [companiesReady, setCompaniesReady] = useState(false)
  const [dataReload, setDataReload] = useState(0)
  const [companyLoadKey, setCompanyLoadKey] = useState(0)
  const [currencyList, setCurrencyList] = useState<CompanyCurrency[]>([])

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
  )

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
        const ok = await updateSessionCompany(activeCompanyId)
        if (cancelled) return
        if (!ok) {
          setDataError('公司会话更新失败')
          setPayload(null)
          return
        }
        const curList = await fetchOrderedCompanyCurrencies(activeCompanyId)
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
        if (!useCurrency) {
          setDataError('当前公司下没有可用币别。')
          setPayload(null)
          return
        }
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
    dateFrom,
    dateTo,
    currency,
    scopeValid,
    dataReload,
  ])

  const kpi = useMemo(
    () => (payload ? kpiFromDashboardData(payload, selectedGroup) : null),
    [payload, selectedGroup],
  )

  const chartData: ChartData<'line'> | null = useMemo(() => {
    if (!payload) return null
    try {
      return buildTrendChartData(payload, dateFrom, dateTo) as ChartData<'line'>
    } catch {
      return null
    }
  }, [payload, dateFrom, dateTo])

  const setGroup = (g: string | null) => {
    writeStoredGroupFilter(g)
    setSelectedGroup(g)
  }

  const onPickCompany = (id: number) => {
    setActiveCompanyId(id)
  }

  const quickThisMonth = () => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    setDateTo(formatYmd(t))
    setDateFrom(formatYmd(new Date(t.getFullYear(), t.getMonth(), 1)))
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
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
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
    refreshData,
    retryLoadCompanies,
  }
}
