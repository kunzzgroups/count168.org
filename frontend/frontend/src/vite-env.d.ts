/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Same host as PHP app when API is proxied (e.g. http://127.0.0.1:80) for legacy page links */
  readonly VITE_PHP_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
