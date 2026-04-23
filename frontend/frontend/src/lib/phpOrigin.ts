/** Base URL for classic PHP pages (no trailing slash). Empty = same-origin relative paths. */
export function getPhpOrigin(): string {
  return (
    (import.meta.env.VITE_PHP_ORIGIN as string | undefined)?.replace(/\/$/, '') ||
    ''
  )
}

export function phpPagePath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const o = getPhpOrigin()
  return o ? `${o}${p}` : p
}
