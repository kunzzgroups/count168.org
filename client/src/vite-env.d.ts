/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 与 PHP 同域时留空，请求为相对路径（如 /api/...） */
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
