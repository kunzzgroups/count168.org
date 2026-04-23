import { publicAsset } from '../../lib/publicAsset'
import { resolvePostLoginRedirect } from '../../lib/resolvePostLoginRedirect'
import type { DashboardBootstrapData } from '../../types/dashboard'
import './DashboardShell.css'

type Props = {
  data: DashboardBootstrapData
}

/**
 * 阶段 1：无侧栏/图表，仅占位与顶栏；经典完整页可临时跳转。
 */
export function DashboardShell({ data }: Props) {
  const { userData, canViewAnalytics, companyId } = data
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
      </header>

      <main className="dShell__main">
        <h1 className="dShell__title">Transaction Dashboard</h1>
        <p className="dShell__lede">
          新版正在分阶段上线：后续将在此接入日期筛选、图表与侧栏。当前为{' '}
          <strong>布局与数据层（阶段 1）</strong>。
        </p>
        <ul className="dShell__meta">
          <li>
            <span className="dShell__label">Analytics</span>
            {canViewAnalytics ? '可查看（与经典版 admin 规则一致）' : '本角色不可见（与经典版一致）'}
          </li>
          <li>
            <span className="dShell__label">Permissions</span>
            {userData.permissions.length
              ? userData.permissions.join(', ')
              : '（空 = 与经典无勾选时的默认一致）'}
          </li>
        </ul>
        <div className="dShell__actions">
          <a className="dShell__btn dShell__btn--primary" href={classicUrl}>
            打开经典版（完整功能）
          </a>
        </div>
      </main>
    </div>
  )
}
