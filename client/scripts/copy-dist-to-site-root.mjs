/**
 * 将 `client/dist` 同步到**仓库根**（与 index.php、api/ 同级），
 * 使本机目录结构与线上 public_html 一致，便于整包上传或 git 部署。
 * 不删除根目录的 PHP/其它文件，只覆盖/合并 index.html、assets/、images/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(__dirname, '..')
const siteRoot = path.join(clientDir, '..')
const dist = path.join(clientDir, 'dist')

const index = path.join(dist, 'index.html')
if (!fs.existsSync(index)) {
  console.error('找不到 client/dist/index.html。请先执行: npm run build')
  process.exit(1)
}

const destHtml = path.join(siteRoot, 'index.html')
fs.copyFileSync(index, destHtml)
console.log('OK →', path.relative(siteRoot, destHtml))

const srcAssets = path.join(dist, 'assets')
if (fs.existsSync(srcAssets)) {
  const destAssets = path.join(siteRoot, 'assets')
  fs.mkdirSync(destAssets, { recursive: true })
  fs.cpSync(srcAssets, destAssets, { recursive: true })
  console.log('OK → assets/ （已合并）')
}

const srcImages = path.join(dist, 'images')
if (fs.existsSync(srcImages)) {
  const destImages = path.join(siteRoot, 'images')
  fs.mkdirSync(destImages, { recursive: true })
  fs.cpSync(srcImages, destImages, { recursive: true })
  console.log('OK → images/ （已合并）')
}

// Vite 可能把 /favicon.svg 等放在 dist 根
for (const f of ['favicon.svg', 'icons.svg', 'favicon.ico']) {
  const p = path.join(dist, f)
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(siteRoot, f))
    console.log('OK →', f)
  }
}

console.log('\n已写入网站根:', siteRoot)
console.log('接下来请把**整个网站根**上传到主机（或 git push 后在服务器 pull）。')
console.log('根目录的 .htaccess 必须已含 DirectoryIndex 与 mod_rewrite 段。')
