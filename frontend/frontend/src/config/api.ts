/**
 * Base URL for HTTP calls. Defaults to `/api` (same origin).
 * Set `VITE_API_BASE_URL` for an absolute base (e.g. `https://count168.org/api`).
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/$/, '') || '/api'
