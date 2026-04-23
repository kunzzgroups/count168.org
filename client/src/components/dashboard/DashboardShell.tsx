import { publicAsset } from '../../lib/publicAsset'
import { resolvePostLoginRedirect } from '../../lib/resolvePostLoginRedirect'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { DashboardMain } from './DashboardMain'
import './DashboardShell.css'

type Props = {
  data: DashboardBootstrapData
}

/**
 * 顶栏 + 阶段 2 主区（筛选 / KPI / 趋势图）；经典版作补充入口。
 */
export function DashboardShell({ data }: Props) {
  const { userData, companyId } = data
  const classicUrl = resolvePostLoginRedirect('dashboard_classic.php')

  return (
    <div className="dShell">
      <header className="dShell__header">
        <div className="dShell__brand">
          <img
            className="dShell__logo"
            src={publicAsset('images/count_logo.png')}
            alt=""
            width={36}
            height={36}
            decoding="async"
          />
          <div className="dShell__brandText">
            <span className="dShell__product">EazyCount</span>
            <span className="dShell__sub">Transaction Dashboard</span>
          </div>
        </div>
        <div className="dShell__headerRight">
          <a className="dShell__classic" href={classicUrl}>
            经典版
          </a>
          <div className="dShell__user">
            <div className="dShell__avatar" aria-hidden>
              {userData.avatar_letter}
            </div>
            <div className="dShell__userMeta">
              <span className="dShell__name">{userData.name || userData.login_id}</span>
              <span className="dShell__role">
                {userData.role}
                {companyId != null && (
                  <span className="dShell__cid"> · company #{companyId}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="dShell__main">
        <DashboardMain bootstrap={data} />
      </main>
    </div>
  )
}
