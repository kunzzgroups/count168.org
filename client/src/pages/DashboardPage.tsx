import { useEffect } from 'react'
import { useDashboardBootstrap } from '../hooks/useDashboardBootstrap'
import { apiUrl } from '../lib/api'
import { DashboardShell } from '../components/dashboard/DashboardShell'
import './DashboardPage.css'
import '../../../css/sidebar.css'

/** React Transaction Dashboard：与 `dashboard_classic.php` + `js/dashboard.js` 主区行为与展示对齐。 */
export function DashboardPage() {
  const { gate, data, refetch } = useDashboardBootstrap()

  useEffect(() => {
    const prev = document.title
    document.title = 'Transaction Dashboard - EazyCount'
    return () => {
      document.title = prev
    }
  }, [])

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
          <p className="dashboardPage__errTitle">无法加载 Dashboard</p>
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
    <DashboardShell data={data} classicPage="dashboard_classic.php" classicSidebarLayout />
  )
}
