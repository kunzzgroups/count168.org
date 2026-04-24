import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const phpPath = path.join(root, 'processlist_classic.php')
const outPath = path.join(root, 'client', 'src', 'components', 'processlist', 'ProcessListMainShell.html')

const s = fs.readFileSync(phpPath, 'utf8')
const a = s.indexOf('<div class="container">')
const b = s.indexOf('<!-- Edit Process Popup Modal -->')
if (a < 0 || b < 0) {
  console.error('markers not found', { a, b })
  process.exit(1)
}
let chunk = s.slice(a, b)
// Remove PHP company filter block: from <!-- Shared Group to closing script of onSharedCompanyFilterChanged
const cStart = chunk.indexOf('<!-- Shared Group & Company Filter')
const cEnd = chunk.indexOf('</script>', chunk.indexOf('window.onSharedCompanyFilterChanged')) + '</script>'.length
if (cStart >= 0 && cEnd > cStart) {
  chunk = chunk.slice(0, cStart) + '<div id="c168-process-company-slot"></div>\n' + chunk.slice(cEnd)
}
// Replace PHP echo in search input
chunk = chunk.replace(
  /<input type="text" id="searchInput" placeholder="Search" class="search-input"\s*value="<\?php echo \$searchTerm; \?>">/,
  '<input type="text" id="searchInput" placeholder="Search" class="search-input" value="">',
)
// Replace PHP checkboxes with placeholder markers for React — actually keep structure; React will pass initial via useEffect... LegacyDom uses defaultValue in React - we're using raw HTML. Use empty and sync from window in init - ProcessListMain sets globals before script. Actually shell is static HTML with value="" - we'll replace entire shell with React JSX for the parts that need initial state.

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, chunk.trim() + '\n')
console.log('wrote', outPath, 'bytes', chunk.length)
