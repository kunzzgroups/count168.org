/**
 * 旧版 PHP 页面对应的 React 路由与迁移状态（UI 在 React，接口仍为 PHP /api/…）。
 * reactPath 为 BrowserRouter 下路径（已含 basename /app 之外的逻辑路径）。
 */

export type ModuleStatus = 'ready' | 'pending'

export type LegacyModuleDef = {
  key: string
  legacyFile: string
  /** 相对站点根，如 /modules/transaction */
  reactPath: string
  status: ModuleStatus
}

const ready: LegacyModuleDef[] = [
  { key: 'dashboard', legacyFile: 'dashboard.php', reactPath: '/dashboard', status: 'ready' },
  { key: 'transaction', legacyFile: 'transaction.php', reactPath: '/modules/transaction', status: 'ready' },
  { key: 'accountList', legacyFile: 'account-list.php', reactPath: '/modules/account-list', status: 'ready' },
  { key: 'member', legacyFile: 'member.php', reactPath: '/modules/member', status: 'ready' },
  { key: 'processList', legacyFile: 'processlist.php', reactPath: '/modules/process-list', status: 'ready' },
  { key: 'userList', legacyFile: 'userlist.php', reactPath: '/modules/user-list', status: 'ready' },
  { key: 'announcement', legacyFile: 'announcement.php', reactPath: '/modules/announcement', status: 'ready' },
  { key: 'userAccess', legacyFile: 'useraccess.php', reactPath: '/modules/user-access', status: 'ready' },
]

const pending: LegacyModuleDef[] = [
  { key: 'bankProcessList', legacyFile: 'bank_process_list.php', reactPath: '/modules/bank-process-list', status: 'pending' },
  { key: 'bankprocessMaintenance', legacyFile: 'bankprocess_maintenance.php', reactPath: '/modules/bankprocess-maintenance', status: 'pending' },
  { key: 'captureMaintenance', legacyFile: 'capture_maintenance.php', reactPath: '/modules/capture-maintenance', status: 'pending' },
  { key: 'customerReport', legacyFile: 'customer_report.php', reactPath: '/modules/customer-report', status: 'pending' },
  { key: 'datacapture', legacyFile: 'datacapture.php', reactPath: '/modules/datacapture', status: 'pending' },
  { key: 'datacaptureSummary', legacyFile: 'datacapturesummary.php', reactPath: '/modules/datacapture-summary', status: 'pending' },
  { key: 'domain', legacyFile: 'domain.php', reactPath: '/modules/domain', status: 'pending' },
  { key: 'domainReport', legacyFile: 'domain_report.php', reactPath: '/modules/domain-report', status: 'pending' },
  { key: 'formulaMaintenance', legacyFile: 'formula_maintenance.php', reactPath: '/modules/formula-maintenance', status: 'pending' },
  { key: 'gamesProcessList', legacyFile: 'games_process_list.php', reactPath: '/modules/games-process-list', status: 'pending' },
  { key: 'ownership', legacyFile: 'ownership.php', reactPath: '/modules/ownership', status: 'pending' },
  { key: 'paymentMaintenance', legacyFile: 'payment_maintenance.php', reactPath: '/modules/payment-maintenance', status: 'pending' },
  { key: 'transactionMaintenance', legacyFile: 'transaction_maintenance.php', reactPath: '/modules/transaction-maintenance', status: 'pending' },
  { key: 'autoMonthlyAccounting', legacyFile: 'auto_monthly_accounting.php', reactPath: '/modules/auto-monthly-accounting', status: 'pending' },
  { key: 'ownerSecondaryPassword', legacyFile: 'owner_secondary_password.php', reactPath: '/modules/owner-secondary-password', status: 'pending' },
]

/** 公开页：仅路由键与路径，不写入 legacyModuleRows 时单独处理 */
export const resetPasswordModule: LegacyModuleDef = {
  key: 'resetPassword',
  legacyFile: 'reset-password.php',
  reactPath: '/reset-password',
  status: 'pending',
}

export const legacyModuleRows: LegacyModuleDef[] = [...ready, ...pending, resetPasswordModule].sort(
  (a, b) => a.reactPath.localeCompare(b.reactPath),
)

/** 受保护占位路由（/modules/...） */
export const protectedPlaceholderRoutes: { path: string; i18nKey: string }[] = pending.map((m) => ({
  path: m.reactPath,
  i18nKey: m.key,
}))
