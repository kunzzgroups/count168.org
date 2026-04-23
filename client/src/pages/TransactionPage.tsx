import { useEffect, useMemo } from 'react'
import { useDashboardBootstrap } from '../hooks/useDashboardBootstrap'
import { apiUrl } from '../lib/api'
import './DashboardPage.css'
import './TransactionPage.css'

export function TransactionPage() {
  const { gate, data, refetch } = useDashboardBootstrap()

  const classicSrc = useMemo(() => apiUrl('/transaction_classic.php'), [])

  useEffect(() => {
    const prev = document.title
    document.title = 'Transaction Payment'
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
          <p className="dashboardPage__errTitle">无法加载 Transaction 页</p>
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
    <div className="transactionClassicFrame">
      <iframe
        className="transactionClassicFrame__iframe"
        title="Transaction Payment"
        src={classicSrc}
        referrerPolicy="same-origin"
      />
    </div>
  )
}
