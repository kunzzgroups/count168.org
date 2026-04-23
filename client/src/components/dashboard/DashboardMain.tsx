import { useDashboardWorkspace } from '../../hooks/useDashboardWorkspace'
import { registerDashboardCharts } from '../../lib/dashboardChartRegister'
import {
  shouldAggregateByMonth,
} from '../../lib/buildTrendChartDatasets'
import { QUICK_RANGE_LABEL, type QuickRangeId } from '../../lib/quickDateRange'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { formatKpiNumber } from '../../lib/kpiFromDashboardData'
import { Line } from 'react-chartjs-2'
import type { ChartOptions, ScriptableContext } from 'chart.js'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DashboardCalendarPopup } from './DashboardCalendarPopup'
import '../../../../css/dashboard.css'
import './DashboardMain.css'

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

const CHART_DATASET: { label: string; index: number; color: string }[] = [
  { label: 'Profit', index: 0, color: '#3b82f6' },
  { label: 'Expenses', index: 1, color: '#ef4444' },
  { label: 'Net Profit', index: 2, color: '#10b981' },
  { label: 'Earnings', index: 3, color: '#f59e0b' },
]

const GRADIENT_STOPS: [number, string][][] = [
  [
    [0, 'rgba(59, 130, 246, 0.4)'],
    [0.3, 'rgba(59, 130, 246, 0.2)'],
    [0.7, 'rgba(59, 130, 246, 0.1)'],
    [1, 'rgba(59, 130, 246, 0.02)'],
  ],
  [
    [0, 'rgba(239, 68, 68, 0.4)'],
    [0.3, 'rgba(239, 68, 68, 0.2)'],
    [0.7, 'rgba(239, 68, 68, 0.1)'],
    [1, 'rgba(239, 68, 68, 0.02)'],
  ],
  [
    [0, 'rgba(16, 185, 129, 0.4)'],
    [0.3, 'rgba(16, 185, 129, 0.2)'],
    [0.7, 'rgba(16, 185, 129, 0.1)'],
    [1, 'rgba(16, 185, 129, 0.02)'],
  ],
  [
    [0, 'rgba(245, 158, 11, 0.4)'],
    [0.3, 'rgba(245, 158, 11, 0.2)'],
    [0.7, 'rgba(245, 158, 11, 0.1)'],
    [1, 'rgba(245, 158, 11, 0.02)'],
  ],
]

function formatDmY(ymd: string): string {
  const p = ymd.split('-')
  if (p.length < 3) return ymd
  const [y, m, d] = p
  return `${d}/${m}/${y}`
}

function formatChartTick(n: number): string {
  return parseFloat(String(n || 0)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function DashboardMain(_props: Props) {
  const w = useDashboardWorkspace(_props.bootstrap)
  const { currencyList, reorderCurrencies } = w
  const [quickOpen, setQuickOpen] = useState(false)
  const quickRef = useRef<HTMLDivElement>(null)
  const dateRangeRef = useRef<HTMLDivElement>(null)
  const monthPickerRef = useRef<HTMLDivElement>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [monthDdOpen, setMonthDdOpen] = useState<'year' | 'month' | null>(null)

  const monthYearDisplay = useMemo(() => {
    if (w.currentRangeType === 'year') {
      const y = parseInt(w.dateFrom.slice(0, 4), 10)
      return { y: Number.isFinite(y) ? String(y) : '--', m: '--' }
    }
    const p = w.dateFrom.split('-').map(Number)
    const q = w.dateTo.split('-').map(Number)
    if (p.length >= 3 && q.length >= 3) {
      const [fy, fm, fd] = p
      const [ty, tm, td] = q
      const lastOf = new Date(fy!, fm!, 0).getDate()
      if (fy === ty && fm === tm && fd === 1 && td === lastOf) {
        return { y: String(fy), m: String(fm).padStart(2, '0') }
      }
    }
    if (p.length >= 2 && !Number.isNaN(p[0])) {
      return { y: String(p[0]), m: p[1] ? String(p[1]).padStart(2, '0') : '--' }
    }
    return { y: '--', m: '--' }
  }, [w.dateFrom, w.dateTo, w.currentRangeType])

  useEffect(() => {
    registerDashboardCharts()
  }, [])

  useEffect(() => {
    if (!quickOpen && !monthDdOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (quickOpen && quickRef.current && !quickRef.current.contains(t)) {
        setQuickOpen(false)
      }
      if (
        monthDdOpen &&
        monthPickerRef.current &&
        !monthPickerRef.current.contains(t)
      ) {
        setMonthDdOpen(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [quickOpen, monthDdOpen])

  const chartSub = useMemo(() => {
    if (w.loading && w.scopeValid) return 'Loading data...'
    if (!w.scopeValid) return '—'
    const from = w.payload?.date_range?.from || w.dateFrom
    const to = w.payload?.date_range?.to || w.dateTo
    return `${formatDmY(from)} to ${formatDmY(to)}`
  }, [w.loading, w.scopeValid, w.payload, w.dateFrom, w.dateTo])

  const hasEarnings = !!(w.kpi && w.kpi.showEarnings)

  const axisFontSize = useMemo(
    () =>
      Math.round(
        Math.min(15, Math.max(9, (0.82 / 100) * window.innerWidth)),
      ),
    [],
  )

  const lineChartData = useMemo(() => {
    if (!w.chartData) return null
    const grad = (
      c: ScriptableContext<'line'>,
      stops: [number, string][],
    ) => {
      const chart = c.chart
      const { ctx, chartArea } = chart
      if (!chartArea) return stops[stops.length - 1]![1]
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
      for (const [p, col] of stops) g.addColorStop(p, col)
      return g
    }
    return {
      ...w.chartData,
      datasets: w.chartData.datasets.map((ds, i) => ({
        ...ds,
        pointHoverRadius: 8,
        backgroundColor: (context: ScriptableContext<'line'>) =>
          grad(context, GRADIENT_STOPS[i]!),
      })),
    }
  }, [w.chartData])

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    const agg = shouldAggregateByMonth(
      w.dateFrom,
      w.dateTo,
      w.currentRangeType,
    )
    const keys = w.chartSortedKeys
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title(items) {
              if (!items.length) return ''
              const i = items[0]!.dataIndex
              const date = keys[i]
              if (!date) return ''
              if (agg && /^\d{4}-\d{2}$/.test(date)) {
                const [y, m] = date.split('-')
                return `${MONTH_NAMES_LONG[parseInt(m!, 10) - 1] || ''} ${y}`
              }
              const dateObj = new Date(date + 'T00:00:00')
              if (!Number.isNaN(dateObj.getTime())) {
                return `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`
              }
              return date
            },
            label(ctx) {
              const label = ctx.dataset.label || ''
              const value = ctx.parsed.y
              return `${label}: RM ${formatChartTick(value as number)}`
            },
            afterBody(items) {
              if (!items.length || !lineChartData) return []
              const i = items[0]!.dataIndex
              const ds = lineChartData.datasets
              const p = (ds[0]!.data as number[])[i] ?? 0
              const e = (ds[1]!.data as number[])[i] ?? 0
              const np = (ds[2]!.data as number[])[i] ?? 0
              const er = (ds[3]!.data as number[])[i] ?? 0
              return [
                '',
                '--- Summary ---',
                `Profit: RM ${formatChartTick(p)}`,
                `Expenses: RM ${formatChartTick(e)}`,
                `NET PROFIT: RM ${formatChartTick(np)}`,
                `Earnings: RM ${formatChartTick(er)}`,
              ]
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            maxTicksLimit: 8,
            callback: (value) => formatChartTick(value as number),
            font: { size: axisFontSize },
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: axisFontSize },
            maxRotation: 0,
            minRotation: 0,
            autoSkip: false,
            callback: (_value, index) => {
              const raw = keys[index]
              if (!raw) return ''
              if (agg && /^\d{4}-\d{2}$/.test(raw)) {
                const [yearStr, monthStr] = raw.split('-')
                const y = parseInt(yearStr!, 10)
                const m = parseInt(monthStr!, 10)
                if (!y || !m) return ''
                return `${MONTH_NAMES[m - 1] || ''} ${y}`
              }
              if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                const parts = raw.split('-')
                return String(parseInt(parts[2]!, 10) || '')
              }
              return ''
            },
          },
        },
      },
    }
  }, [
    w.chartSortedKeys,
    w.dateFrom,
    w.dateTo,
    w.currentRangeType,
    axisFontSize,
    lineChartData,
  ])

  const yearChoices = useMemo(() => {
    const y = new Date().getFullYear()
    const out: number[] = []
    for (let i = 2022; i <= y + 1; i++) out.push(i)
    return out
  }, [])

  const onCurrencyDragStart = useCallback(
    (e: React.DragEvent, code: string) => {
      e.dataTransfer.setData('text/plain', code)
      e.dataTransfer.effectAllowed = 'move'
      ;(e.target as HTMLElement).classList.add('transaction-currency-dragging')
    },
    [],
  )

  const onCurrencyDragEnd = useCallback((e: React.DragEvent) => {
    ;(e.target as HTMLElement).classList.remove('transaction-currency-dragging')
    document
      .querySelectorAll('.transaction-currency-drag-over')
      .forEach((el) => el.classList.remove('transaction-currency-drag-over'))
  }, [])

  const onCurrencyDrop = useCallback(
    (e: React.DragEvent, targetCode: string) => {
      e.preventDefault()
      const from = String(e.dataTransfer.getData('text/plain') || '')
        .trim()
        .toUpperCase()
      const to = targetCode.trim().toUpperCase()
      document
        .querySelectorAll('.transaction-currency-drag-over')
        .forEach((el) => el.classList.remove('transaction-currency-drag-over'))
      if (!from || from === to) return
      const order = currencyList.map((c) =>
        String(c.code || '').toUpperCase(),
      )
      const fi = order.indexOf(from)
      const ti = order.indexOf(to)
      if (fi === -1 || ti === -1) return
      const next = [...order]
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      reorderCurrencies(next)
    },
    [currencyList, reorderCurrencies],
  )

  if (w.loadCompaniesError || !w.companiesReady) {
    if (w.loadCompaniesError) {
      return (
        <div className="dMain__warn" role="alert">
          无法加载公司列表。请检查网络或权限后{' '}
          <button type="button" className="dMain__linkBtn" onClick={w.retryLoadCompanies}>
            重试
          </button>
        </div>
      )
    }
    return (
      <div className="dMain__load" role="status">
        <span className="dMain__spinner" />
        加载中…
      </div>
    )
  }

  if (w.companies.length === 0) {
    return (
      <p className="dMain__warn" role="status">
        没有可用公司。请联系管理员。
      </p>
    )
  }

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Transaction Dashboard</h1>

      <div id="app" className="dashboard-content">
        <div
          className={hasEarnings ? 'dashboard-top-row has-earnings' : 'dashboard-top-row'}
        >
          <div className="dashboard-card dashboard-card--filters">
            <div className="dashboard-card-body">
              <div className="dashboard-date-controls">
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                >
                  <label className="form-label" style={{ margin: 0 }}>
                    Date Range
                  </label>
                  <div
                    ref={dateRangeRef}
                    className="date-range-picker"
                    id="date-range-picker"
                    role="button"
                    tabIndex={0}
                    onClick={() => setCalendarOpen((o) => !o)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setCalendarOpen((o) => !o)
                      }
                    }}
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id="date-range-display">
                      {formatDmY(w.dateFrom)} - {formatDmY(w.dateTo)}
                    </span>
                  </div>
                  <DashboardCalendarPopup
                    key={calendarOpen ? `${w.dateFrom}|${w.dateTo}` : 'closed'}
                    open={calendarOpen}
                    anchorRef={dateRangeRef}
                    dateFrom={w.dateFrom}
                    dateTo={w.dateTo}
                    onClose={() => setCalendarOpen(false)}
                    onCommit={(from, to) => {
                      w.setDateFrom(from)
                      w.setDateTo(to)
                    }}
                  />
                </div>

                <div className="divider" />

                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                >
                  <label
                    className="form-label"
                    style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <i className="fas fa-calendar" style={{ color: '#3b82f6' }} />
                    Select Year & Month
                  </label>
                  <div
                    ref={monthPickerRef}
                    className="enhanced-date-picker month-only"
                    id="month-date-picker"
                  >
                    <div
                      className={
                        monthDdOpen === 'year' ? 'date-part active' : 'date-part'
                      }
                      data-type="year"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setMonthDdOpen((d) => (d === 'year' ? null : 'year'))
                      }
                    >
                      <span id="month-year-display">{monthYearDisplay.y}</span>
                    </div>
                    <span className="date-separator">Year</span>
                    <div
                      className={
                        monthDdOpen === 'month' ? 'date-part active' : 'date-part'
                      }
                      data-type="month"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setMonthDdOpen((d) => (d === 'month' ? null : 'month'))
                      }
                    >
                      <span id="month-month-display">{monthYearDisplay.m}</span>
                    </div>
                    <span className="date-separator">Month</span>

                    <div
                      className={
                        monthDdOpen ? 'date-dropdown show' : 'date-dropdown'
                      }
                      id="month-dropdown"
                    >
                      {monthDdOpen === 'year' && (
                        <div className="year-grid">
                          {yearChoices.map((y) => (
                            <div
                              key={y}
                              className="date-option"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                const curM =
                                  monthYearDisplay.m !== '--'
                                    ? parseInt(monthYearDisplay.m, 10)
                                    : null
                                const m =
                                  curM && !Number.isNaN(curM) ? curM : null
                                w.applyMonthYearSelection(y, m)
                                setMonthDdOpen(null)
                              }}
                            >
                              {y}
                            </div>
                          ))}
                        </div>
                      )}
                      {monthDdOpen === 'month' && (
                        <div className="month-grid">
                          <div
                            className="date-option"
                            style={{ gridColumn: '1 / -1' }}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const y = parseInt(monthYearDisplay.y, 10)
                              if (Number.isFinite(y)) {
                                w.applyMonthYearSelection(y, null)
                              }
                              setMonthDdOpen(null)
                            }}
                          >
                            None
                          </div>
                          {MONTH_NAMES.map((name, idx) => {
                            const mv = idx + 1
                            return (
                              <div
                                key={name}
                                className="date-option"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  const y = parseInt(monthYearDisplay.y, 10)
                                  if (Number.isFinite(y)) {
                                    w.applyMonthYearSelection(y, mv)
                                  }
                                  setMonthDdOpen(null)
                                }}
                              >
                                {name}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'clamp(0px, 0.21vw, 4px)',
                  }}
                >
                  <label
                    className="form-label"
                    style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <i className="fas fa-clock" style={{ color: '#3b82f6' }} />
                    Quick Select
                  </label>
                  <div className="dropdown" ref={quickRef}>
                    <button
                      type="button"
                      className="btn btn-secondary dropdown-toggle"
                      onClick={() => setQuickOpen((o) => !o)}
                    >
                      <i className="fas fa-calendar-alt" />
                      <span id="quick-select-text">
                        {w.quickSelectLabel || 'Period'}
                      </span>
                      <i className="fas fa-chevron-down" />
                    </button>
                    <div
                      className={quickOpen ? 'dropdown-menu show' : 'dropdown-menu'}
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
              </div>

              {w.groupIds.length > 0 && (
                <div className="transaction-company-filter dShow">
                  <span className="transaction-company-label">GroupID:</span>
                  <div className="transaction-company-buttons" role="group" aria-label="Group">
                    {w.groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={
                          w.selectedGroup === g
                            ? 'transaction-company-btn active'
                            : 'transaction-company-btn'
                        }
                        onClick={() => w.setGroup(w.selectedGroup === g ? null : g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {w.scopeCompanies.length > 0 && (
                <div className="transaction-company-filter dShow">
                  <span className="transaction-company-label">Company:</span>
                  <div className="transaction-company-buttons" role="group" aria-label="Company">
                    {w.showGroupAll && (
                      <button
                        type="button"
                        className={
                          w.isGroupAllMode
                            ? 'transaction-company-btn active dashboard-all-btn'
                            : 'transaction-company-btn dashboard-all-btn'
                        }
                        onClick={w.onToggleGroupAll}
                      >
                        All
                      </button>
                    )}
                    {w.scopeCompanies.map((c) => {
                      const isActive =
                        !w.isGroupAllMode && Number(c.id) === Number(w.activeCompanyId)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={
                            isActive ? 'transaction-company-btn active' : 'transaction-company-btn'
                          }
                          onClick={() => w.onPickCompany(c.id)}
                        >
                          {String(c.company_id || '')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {currencyList.length > 0 && (
                <div className="transaction-company-filter dShow">
                  <span className="transaction-company-label">Currency:</span>
                  <div
                    className="transaction-company-buttons"
                    role="group"
                    aria-label="Currency"
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('text/plain')) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }
                    }}
                  >
                    {currencyList.map((c) => {
                      const code = String(c.code || '').toUpperCase()
                      return (
                        <button
                          key={code}
                          type="button"
                          draggable
                          data-currency={code}
                          className={
                            w.currency === code
                              ? 'transaction-company-btn active'
                              : 'transaction-company-btn'
                          }
                          onDragStart={(e) => onCurrencyDragStart(e, code)}
                          onDragEnd={onCurrencyDragEnd}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            ;(e.currentTarget as HTMLElement).classList.add(
                              'transaction-currency-drag-over',
                            )
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                              ;(e.currentTarget as HTMLElement).classList.remove(
                                'transaction-currency-drag-over',
                              )
                            }
                          }}
                          onDrop={(e) => onCurrencyDrop(e, code)}
                          onClick={() => w.setCurrency(code)}
                        >
                          {code}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {w.kpi && w.kpi.showEarnings && (
            <div
              className="dashboard-kpi-card dashboard-kpi-card--blue"
              id="earnings-card-wrapper"
            >
              <div className="kpi-icon">
                <i className="fas fa-hand-holding-usd" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Earnings</div>
                <div className="kpi-value">
                  {formatKpiNumber(w.kpi.earnings)}
                </div>
              </div>
            </div>
          )}
        </div>

        {!w.scopeValid && (
          <p className="dMain__scopeInline" role="status">
            请先在 Group 中选择一个与当前公司匹配的筛选，或取消 Group 以查看独立公司。
          </p>
        )}

        {w.dataError && w.scopeValid && (
          <p className="dMain__err" role="alert">
            {w.dataError}{' '}
            <button type="button" className="dMain__linkBtn" onClick={w.refreshData}>
              重试
            </button>
          </p>
        )}

        {w.kpi && w.scopeValid && !w.dataError && (
          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi-card dashboard-kpi-card--blue">
              <div className="kpi-icon">
                <i className="fas fa-wallet" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Profit</div>
                <div className="kpi-value">
                  {formatKpiNumber(w.kpi.displayProfit)}
                </div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--red">
              <div className="kpi-icon">
                <i className="fas fa-arrow-down" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Expenses</div>
                <div className="kpi-value">
                  {formatKpiNumber(w.kpi.displayExpenses)}
                </div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--green">
              <div className="kpi-icon">
                <i className="fas fa-chart-line" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">NET PROFIT</div>
                <div className="kpi-value">
                  {formatKpiNumber(w.kpi.netProfit)}
                </div>
              </div>
            </div>
          </div>
        )}

        {lineChartData && w.scopeValid && (
          <div className="dashboard-chart-section">
            <div className="dashboard-chart-header">
              <div>
                <div className="dashboard-chart-title">Trend Chart</div>
                <div
                  className="dashboard-date-info"
                  id="chart-date-range"
                  style={{
                    marginTop: '4px',
                    marginBottom: 0,
                    border: 'none',
                    padding: 0,
                    background: 'transparent',
                    color: w.loading ? '#6b7280' : undefined,
                  }}
                >
                  {chartSub}
                </div>
              </div>
              <div className="dashboard-chart-buttons">
                {CHART_DATASET.map(({ label, index, color }) => {
                  const on = w.chartLineVisible[index]!
                  return (
                    <button
                      key={label}
                      type="button"
                      className={on ? 'chart-toggle-btn active' : 'chart-toggle-btn'}
                      style={{ '--btn-color': color } as CSSProperties}
                      data-dataset={String(index)}
                      onClick={() => w.toggleChartLine(index)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="dashboard-chart-container">
              <Line data={lineChartData} options={chartOptions} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
