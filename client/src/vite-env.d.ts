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
