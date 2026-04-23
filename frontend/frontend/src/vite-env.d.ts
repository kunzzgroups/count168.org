/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Same host as PHP app when API is proxied (e.g. http://127.0.0.1:80) for legacy page links */
  readonly VITE_PHP_ORIGIN?: string
  /**
   * Vite `base` for built assets (e.g. `/app/` when SPA is deployed in a subfolder).
   * Omit or empty = site root. Dev server always uses `/` unless you set this in `.env.development`.
   */
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
