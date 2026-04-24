import { useDashboardBootstrap } from '../hooks/useDashboardBootstrap'
import { apiUrl } from '../lib/api'
import { ClassicDashboardShell } from '../components/dashboard/ClassicDashboardShell'
import { ProcessListMain } from '../components/processlist/ProcessListMain'
import './DashboardPage.css'

/**
 * Process List：入口 `processlist.php` 302 至本路由；经典全页为 `processlist_classic.php`（顶栏「经典版」）。
 * Bank / Games 专页见 `bank_process_list.php` → `/process/bank`，`games_process_list.php` → `/process/games`。
 */
export function ProcessListPage() {
  const { gate, data, refetch } = useDashboardBootstrap()

  if (gate === 'loading') {
    return (
      <div className="dashboardPage__boot" role="status" aria-live="polite">
        <div className="dashboardPage__bootInner" />
      </div>
    )
  }

  if (gate === 'error' || !data) {
    return (
      <div className="dashboardPage__errWrap">
        <div className="dashboardPage__errCard" role="alert">
          <p className="dashboardPage__errTitle">无法加载 Process List</p>
          <p className="dashboardPage__errText">请检查网络后重试，或回到登录页。</p>
          <div className="dashboardPage__errActions">
            <button type="button" className="dashboardPage__btn" onClick={() => refetch()}>
              重试
            </button>
            <a className="dashboardPage__link" href={apiUrl('/index.php')}>
              回到登录
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ClassicDashboardShell
      data={data}
      classicPage="processlist_classic.php"
      documentTitle="Process List"
    >
      <ProcessListMain bootstrap={data} />
    </ClassicDashboardShell>
  )
}
