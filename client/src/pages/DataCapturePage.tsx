import { useDashboardBootstrap } from '../hooks/useDashboardBootstrap'
import { apiUrl } from '../lib/api'
import { ClassicDashboardShell } from '../components/dashboard/ClassicDashboardShell'
import { DataCaptureMain } from '../components/datacapture/DataCaptureMain'
import './DashboardPage.css'

/** React Data Capture：入口 `datacapture.php` 302 到本路由；经典全页为 `datacapture_classic.php`（顶栏「经典版」）。 */
export function DataCapturePage() {
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
          <p className="dashboardPage__errTitle">无法加载 Data Capture</p>
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
      classicPage="datacapture_classic.php"
      documentTitle="Data Capture - EazyCount"
    >
      <DataCaptureMain bootstrap={data} />
    </ClassicDashboardShell>
  )
}
