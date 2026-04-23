import { useDashboardWorkspace } from '../../hooks/useDashboardWorkspace'
import { registerDashboardCharts } from '../../lib/dashboardChartRegister'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { formatKpiNumber } from '../../lib/kpiFromDashboardData'
import { Line } from 'react-chartjs-2'
import { useEffect, useId } from 'react'
import './DashboardMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

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

        {w.companies.length > 1 && (
          <div className="dMain__row">
            <label className="dMain__label" htmlFor={id + 'co'}>
              Company
            </label>
            <select
              id={id + 'co'}
              className="dMain__select"
              value={w.activeCompanyId ?? ''}
              onChange={(e) => w.onPickCompany(Number(e.target.value))}
            >
              {w.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.company_id || '')} (id: {c.id})
                </option>
              ))}
            </select>
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
        <div className="dMain__chart">
          <Line
            data={w.chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom' } },
              scales: {
                y: { ticks: { maxTicksLimit: 8 } },
                x: { ticks: { maxRotation: 45, minRotation: 0 } },
              },
            }}
          />
        </div>
      )}

      <p className="dMain__footNote">
        图表与 `dashboard.js` 主路径对齐；与经典版的细微差异以经典页为准。侧栏/快捷筛选后续阶段再迁。
      </p>
    </div>
  )
}
