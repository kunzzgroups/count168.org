/**
 * `login_process.php` 返回相对路径（如 `dashboard.php`）。
 * 同域生产环境：根路径下直接跳转即可。
 * 本地 `npm run dev` 时：若与 PHP 不同端口，可设置 VITE_DEV_POST_LOGIN_BASE
 * 指向本机带 PHP 的站点根（如 http://127.0.0.1 或 https://你的测试域名），以便带上 session。
 */
export function resolvePostLoginRedirect(redirect: string): string {
  if (!redirect) return '/'
  if (redirect.startsWith('http://') || redirect.startsWith('https://')) {
    return redirect
  }
  const path = redirect.startsWith('/') ? redirect : `/${redirect}`

  const base = (import.meta.env.VITE_DEV_POST_LOGIN_BASE ?? '').trim().replace(
    /\/$/,
    '',
  )
  if (import.meta.env.DEV && base) {
    return `${base}${path}`
  }
  return path
}
