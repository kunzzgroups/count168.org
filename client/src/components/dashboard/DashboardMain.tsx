import { useDashboardWorkspace } from '../../hooks/useDashboardWorkspace'
import { registerDashboardCharts } from '../../lib/dashboardChartRegister'
import { QUICK_RANGE_LABEL, type QuickRangeId } from '../../lib/quickDateRange'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { formatKpiNumber } from '../../lib/kpiFromDashboardData'
import { Line } from 'react-chartjs-2'
import { useEffect, useId } from 'react'
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

const CHART_TOGGLE: { label: string; index: number }[] = [
  { label: 'Profit', index: 0 },
  { label: 'Expenses', index: 1 },
  { label: 'NET', index: 2 },
  { label: 'Earnings', index: 3 },
]

export function DashboardMain({ bootstrap }: Props) {
  const id = useId()
  const w = useDashboardWorkspace(bootstrap)

  useEffect(() => {
    registerDashboardCharts()
  }, [])

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
    <div className="dMain">
      <div className="dMain__filters">
        {w.groupIds.length > 0 && (
          <div className="dMain__row">
            <span className="dMain__label">Group</span>
            <div className="dMain__pills" role="group" aria-label="Group 筛选">
              {w.groupIds.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={
                    w.selectedGroup === g
                      ? 'dMain__pill dMain__pill--active'
                      : 'dMain__pill'
                  }
                  onClick={() => w.setGroup(w.selectedGroup === g ? null : g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <span className="dMain__hint">若当前公司属于多 Group，需点选其一才能加载数据（与经典版一致）。</span>
          </div>
        )}

        {w.scopeCompanies.length > 0 && (
          <div className="dMain__row">
            <span className="dMain__label">Company</span>
            <div className="dMain__pills" role="group" aria-label="公司">
              {w.showGroupAll && (
                <button
                  type="button"
                  className={
                    w.isGroupAllMode
                      ? 'dMain__pill dMain__pill--active dMain__pill--all'
                      : 'dMain__pill dMain__pill--all'
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
                    className={isActive ? 'dMain__pill dMain__pill--active' : 'dMain__pill'}
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
          <div className="dMain__row">
            <span className="dMain__label">Currency</span>
            <div className="dMain__pills" role="group" aria-label="币别">
              {w.currencyList.map((c) => {
                const code = String(c.code || '').toUpperCase()
                return (
                  <button
                    key={code}
                    type="button"
                    className={
                      w.currency === code
                        ? 'dMain__pill dMain__pill--active'
                        : 'dMain__pill'
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

        <div className="dMain__row dMain__row--quick">
          <span className="dMain__label">Period</span>
          <div className="dMain__quickRow" role="group" aria-label="快捷日期">
            {QUICK_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                className="dMain__qBtn"
                onClick={() => w.selectQuickRange(k)}
              >
                {QUICK_RANGE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="dMain__row dMain__row--date">
          <div>
            <label className="dMain__label" htmlFor={id + 'df'}>
              From
            </label>
            <input
              id={id + 'df'}
              className="dMain__date"
              type="date"
              value={w.dateFrom}
              onChange={(e) => w.setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="dMain__label" htmlFor={id + 'dt'}>
              To
            </label>
            <input
              id={id + 'dt'}
              className="dMain__date"
              type="date"
              value={w.dateTo}
              onChange={(e) => w.setDateTo(e.target.value)}
            />
          </div>
          <button type="button" className="dMain__quick" onClick={w.quickThisMonth}>
            本月
          </button>
          {w.quickSelectLabel && (
            <span className="dMain__rangeHint">{w.quickSelectLabel}</span>
          )}
        </div>
      </div>

      {!w.scopeValid && (
        <p className="dMain__scopeBad" role="status">
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

      {w.loading && w.scopeValid && !w.dataError && (
        <p className="dMain__loadingLine" role="status">
          数据加载中…
        </p>
      )}

      {w.kpi && w.scopeValid && !w.dataError && (
        <div className="dMain__kpi">
          <div className="dMain__kpiCard dMain__kpiCard--blue">
            <span className="dMain__kpiLab">Profit</span>
            <span className="dMain__kpiVal">
              {formatKpiNumber(w.kpi.displayProfit)}
            </span>
          </div>
          <div className="dMain__kpiCard dMain__kpiCard--red">
            <span className="dMain__kpiLab">Expenses</span>
            <span className="dMain__kpiVal">
              {formatKpiNumber(w.kpi.displayExpenses)}
            </span>
          </div>
          <div className="dMain__kpiCard dMain__kpiCard--green">
            <span className="dMain__kpiLab">NET PROFIT</span>
            <span className="dMain__kpiVal">
              {formatKpiNumber(w.kpi.netProfit)}
            </span>
          </div>
          {w.kpi.showEarnings && (
            <div className="dMain__kpiCard dMain__kpiCard--amber">
              <span className="dMain__kpiLab">Earnings</span>
              <span className="dMain__kpiVal">
                {formatKpiNumber(w.kpi.earnings)}
              </span>
            </div>
          )}
        </div>
      )}

      {w.chartData && w.scopeValid && (
        <div className="dMain__chartBlock">
          <div className="dMain__chartToggles" role="group" aria-label="图例开关">
            {CHART_TOGGLE.map(({ label, index }) => {
              const on = w.chartLineVisible[index]!
              return (
                <button
                  key={label}
                  type="button"
                  className={on ? 'dMain__cToggle dMain__cToggle--on' : 'dMain__cToggle'}
                  onClick={() => w.toggleChartLine(index)}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="dMain__chart">
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
  )
}
