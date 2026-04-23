import { useDashboardWorkspace } from '../../hooks/useDashboardWorkspace'
import { registerDashboardCharts } from '../../lib/dashboardChartRegister'
import { QUICK_RANGE_LABEL, type QuickRangeId } from '../../lib/quickDateRange'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { formatKpiNumber } from '../../lib/kpiFromDashboardData'
import { Line } from 'react-chartjs-2'
import type { CSSProperties } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

function formatDmY(ymd: string): string {
  const p = ymd.split('-')
  if (p.length < 3) return ymd
  const [y, m, d] = p
  return `${d}/${m}/${y}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function DashboardMain(_props: Props) {
  const id = useId()
  const w = useDashboardWorkspace(_props.bootstrap)
  const [quickOpen, setQuickOpen] = useState(false)
  const quickRef = useRef<HTMLDivElement>(null)

  const ymFrom = useMemo(() => {
    const p = w.dateFrom.split('-').map(Number)
    if (p.length < 2 || Number.isNaN(p[0]!)) return { y: '--', m: '--' as string }
    return { y: String(p[0]), m: MONTHS[(p[1]! || 1) - 1] || '--' }
  }, [w.dateFrom])

  useEffect(() => {
    registerDashboardCharts()
  }, [])

  useEffect(() => {
    if (!quickOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = quickRef.current
      if (el && !el.contains(e.target as Node)) setQuickOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [quickOpen])

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

  const hasEarnings = !!(w.kpi && w.kpi.showEarnings)

  const chartSub = useMemo(() => {
    if (w.loading && w.scopeValid) return 'Loading data...'
    if (!w.scopeValid) return '—'
    const from = w.payload?.date_range?.from || w.dateFrom
    const to = w.payload?.date_range?.to || w.dateTo
    return `${formatDmY(from)} to ${formatDmY(to)}`
  }, [w.loading, w.scopeValid, w.payload, w.dateFrom, w.dateTo])

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
                  <div className="date-range-picker dMain__dateRange" id="date-range-picker">
                    <i className="fas fa-calendar-alt" />
                    <input
                      id={id + 'df'}
                      type="date"
                      value={w.dateFrom}
                      onChange={(e) => w.setDateFrom(e.target.value)}
                      aria-label="From"
                    />
                    <span> — </span>
                    <input
                      id={id + 'dt'}
                      type="date"
                      value={w.dateTo}
                      onChange={(e) => w.setDateTo(e.target.value)}
                      aria-label="To"
                    />
                  </div>
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
                  <div className="enhanced-date-picker month-only" id="month-date-picker">
                    <div className="date-part" data-type="year">
                      <span id="month-year-display">{ymFrom.y}</span>
                    </div>
                    <span className="date-separator">Year</span>
                    <div className="date-part" data-type="month">
                      <span id="month-month-display">{ymFrom.m}</span>
                    </div>
                    <span className="date-separator">Month</span>
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

              {w.currencyList.length > 0 && (
                <div className="transaction-company-filter dShow">
                  <span className="transaction-company-label">Currency:</span>
                  <div className="transaction-company-buttons" role="group" aria-label="Currency">
                    {w.currencyList.map((c) => {
                      const code = String(c.code || '').toUpperCase()
                      return (
                        <button
                          key={code}
                          type="button"
                          className={
                            w.currency === code
                              ? 'transaction-company-btn active'
                              : 'transaction-company-btn'
                          }
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

        {w.chartData && w.scopeValid && (
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
              <Line
                data={w.chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { ticks: { maxTicksLimit: 8 } },
                    x: { ticks: { maxRotation: 45, minRotation: 0 } },
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
