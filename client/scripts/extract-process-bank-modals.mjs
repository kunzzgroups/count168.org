import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const phpPath = path.join(root, 'bank_process_list.php')
const outPath = path.join(root, 'client', 'src', 'components', 'processlist', 'ProcessListBankModals.html')

const s = fs.readFileSync(phpPath, 'utf8')
const a = s.indexOf('<div id="processAccountingDueModal"')
const b = s.indexOf('        <?php', s.indexOf('confirmBankResendFromModal()'))
if (a < 0 || b < 0) {
  console.error('markers not found', { a, b })
  process.exit(1)
}
let chunk = s.slice(a, b)
const days = Array.from({ length: 31 }, (_, i) => {
  const n = i + 1
  return `<option value="${n}">${n} Days</option>`
}).join('')
const phpDaysBlock =
  /<\?php for \(\$i = 1; \$i <= 31; \$i\+\+\): \?>\s*<option value=\"<\?php echo \$i; \?>\"><\?php echo \$i; \?> Days<\/option>\s*<\?php endfor; \?>/g
chunk = chunk.replace(phpDaysBlock, days)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, chunk.trim() + '\n')
console.log('wrote', outPath, 'bytes', chunk.length)
