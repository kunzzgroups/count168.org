import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
/** Workspace root: count168.org */
const appDir = join(__dirname, '..', '..', '..', 'app')

if (!existsSync(distDir)) {
  console.error('Missing dist/. Run vite build first.')
  process.exit(1)
}

mkdirSync(appDir, { recursive: true })

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
  copyRecursive(join(distDir, name), join(appDir, name))
}

console.log('Copied frontend dist ->', appDir)
