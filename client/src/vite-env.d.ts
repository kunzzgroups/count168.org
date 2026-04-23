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
