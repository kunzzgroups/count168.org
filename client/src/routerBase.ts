/**
 * 与 Vite `base` 一致。根路径部署时不设 basename，避免与 Router 默认冲突。
 * @see https://vite.dev/config/shared-options#base
 */
export function getRouterBasename(): string | undefined {
  const base = import.meta.env.BASE_URL
  if (base === '/' || base === '') return undefined
  return base.replace(/\/$/, '') || undefined
}
