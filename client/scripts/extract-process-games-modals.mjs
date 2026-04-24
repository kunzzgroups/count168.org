import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const phpPath = path.join(root, 'processlist_classic.php')
const outPath = path.join(root, 'client', 'src', 'components', 'processlist', 'ProcessListGamesModals.html')

const s = fs.readFileSync(phpPath, 'utf8')
const a = s.indexOf('<!-- Edit Process Popup Modal -->')
const b = s.indexOf('window.PROCESSLIST_SHOW_INACTIVE')
const bScript = b > 0 ? s.lastIndexOf('<script>', b) : -1
const bCut = bScript >= 0 ? bScript : b
if (a < 0 || bCut < 0) {
  console.error('markers not found', { a, bCut })
  process.exit(1)
}
let chunk = s.slice(a, bCut)
chunk = chunk.replace(/<\?php renderBankProcessModals\(\); \?>\s*/g, '')
chunk = chunk.trim() + '\n'
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, chunk)
console.log('wrote', outPath, 'bytes', chunk.length)
