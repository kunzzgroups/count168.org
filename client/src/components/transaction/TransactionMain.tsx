import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/transaction.css'
import './TransactionMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

/**
 * Transaction List（React）：阶段 1 为壳 + 布局占位；筛选/表格/提交与 `transaction.js`、`search_api.php` 等逐步对齐 `transaction_classic.php`。
 */
export function TransactionMain({ bootstrap }: Props) {
  return (
    <div className="transaction-container tShell__transactionRoot">
      <div className="transaction-header-bar">
        <div className="transaction-header-left">
          <h1 className="transaction-title">Transaction List</h1>
        </div>
      </div>
      <div className="transaction-separator-line" />
      <p className="tShell__sessionMeta" aria-hidden>
        Session company #{bootstrap.companyId ?? '—'}
      </p>
      <div className="tShell__notice" role="status">
        <p>
          React 版交易页已接通登录与侧栏。筛选器、双表汇总、录入与 Contra Inbox 将按经典页{' '}
          <code>transaction_classic.php</code> 逐项迁移；在此之前请使用顶栏「经典版」。
        </p>
      </div>
    </div>
  )
}
