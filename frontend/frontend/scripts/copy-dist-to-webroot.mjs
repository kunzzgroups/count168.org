import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
/** count168.org project root (PHP + api + css + …) */
const webroot = join(__dirname, '..', '..', '..')

if (!existsSync(distDir)) {
  console.error('Missing dist/. Run vite build first.')
  process.exit(1)
}

function copyRecursive(src, dest) {
  const st = statSync(src)
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const name of readdirSync(src)) {
      copyRecursive(join(src, name), join(dest, name))
    }
  } else {
    cpSync(src, dest)
  }
}

for (const name of readdirSync(distDir)) {
  const src = join(distDir, name)
  const dest = join(webroot, name)
  if (name === 'assets') {
    rmSync(dest, { recursive: true, force: true })
  }
  copyRecursive(src, dest)
}

console.log('Copied frontend dist ->', webroot)
