/** `public/` 下文件，在带 Vite `base` 子路径部署时也能正确解析 */
export function publicAsset(path: string): string {
  const p = path.replace(/^\//, '')
  const b = import.meta.env.BASE_URL || '/'
  if (b === '/' || b === './') {
    return `/${p}`
  }
  return `${b.replace(/\/$/, '')}/${p}`
}
