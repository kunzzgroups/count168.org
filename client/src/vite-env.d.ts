/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 与 PHP 同域时留空，请求为相对路径（如 /api/...） */
  readonly VITE_API_BASE: string
  /** 仅开发：登录成功后要跳转的 PHP 站点根，便于带 session */
  readonly VITE_DEV_POST_LOGIN_BASE?: string
  /** 右下角 Telegram 链接 */
  readonly VITE_SUPPORT_TELEGRAM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** 由经典 `sidebar.php` 注入，与部署子路径一致（React 壳层通常不设） */
  EAZYCOUNT_SPA_DASHBOARD?: string
  EAZYCOUNT_SPA_TRANSACTION?: string
  EAZYCOUNT_SPA_DATACAPTURE?: string
  EAZYCOUNT_SPA_DATACAPTURESUMMARY?: string
  EAZYCOUNT_SPA_ACCOUNTS?: string
  EAZYCOUNT_SPA_PROCESSLIST?: string
  /** 与 `client/src/lib/api.ts` 的 `VITE_API_BASE` 一致，供 `datacapture.js` 的 `buildApiUrl` 使用 */
  __C168_API_BASE__?: string
  /** 与 Vite `base` 一致（无前导尾斜杠），供 legacy 脚本拼 `/datacapture`、`/datacapturesummary` */
  __C168_SPA_LINK_BASE__?: string
  /** SPA 内由 React 负责日期选项与工序列表 API，经典页不设置 */
  __DC_REACT_DATE_PROCESS__?: boolean
  DATACAPTURE_COMPANY_ID?: number | null
  DATACAPTURE_COMPANY_CODE?: string
  runDataCapturePageInit?: () => void | Promise<void>
  refreshDataCapturePageData?: () => void | Promise<void>
  switchDataCaptureCompany?: (companyId: number | string | null | undefined) => void | Promise<void>
  /** 与 `datacapture_classic.php` / `shared_company_filter.js` 约定一致 */
  onSharedCompanyFilterChanged?: (
    companyId: string | number | null | undefined,
    companyCode: string | null | undefined,
  ) => void
  ACCOUNT_LIST_SHOW_INACTIVE?: boolean
  ACCOUNT_LIST_SHOW_ALL?: boolean
  ACCOUNT_LIST_COMPANY_ID?: number | null
  ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD?: number[]
  __ACCOUNT_LIST_SPA_EMBED__?: boolean
  runAccountListPageInit?: () => void
  fetchAccounts?: () => void | Promise<void>
  c168SyncAccountListFromLocation?: () => void
  c168PushAccountListFiltersToUrl?: () => void
  PROCESSLIST_SHOW_INACTIVE?: boolean
  PROCESSLIST_SHOW_ALL?: boolean
  PROCESSLIST_SHOW_OFFICIAL?: boolean
  PROCESSLIST_SHOW_E_INVOICE?: boolean
  PROCESSLIST_SHOW_BLOCK?: boolean
  PROCESSLIST_COMPANY_ID?: number | null
  PROCESSLIST_COMPANY_CODE?: string
  PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD?: number[]
  PROCESSLIST_COMPANY_CODE_BY_ID?: Record<string, string>
  PROCESSLIST_PAGE_FILE?: string
  __PROCESS_LIST_SPA_EMBED__?: boolean
  runProcessListPageInit?: () => void
  loadPermissionButtons?: () => Promise<void>
  fetchProcesses?: () => void | Promise<void>
  c168SyncProcessListFromLocation?: () => void
  DATACAPTURESUMMARY_COMPANY_ID?: number | null
  runDataCaptureSummaryPageInit?: () => void
  /** `get_processes_by_day` 的 JSON 结果写入自定义 Process 下拉 */
  datacaptureApplyProcessesApiResult?: (
    result: {
      success?: boolean
      error?: string
      data?: unknown[]
      day_of_week?: string
    },
    selectedDate: string,
  ) => void
}
