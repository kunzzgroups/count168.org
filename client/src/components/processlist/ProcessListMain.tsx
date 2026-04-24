import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import type { DashboardBootstrapData } from '../../types/dashboard'
import './ProcessListMain.css'

type Props = { bootstrap: DashboardBootstrapData }

/**
 * 与经典 `processlist.php` + `bank_process_list.php` + `js/processlist.js` 行为一致：
 * 在 iframe 中加载 `processlist_classic.php?c168_embed=1`（不重复侧栏），
 * 类别切换时由 legacy 对 `window.top` 导航到 `/process` | `/process/bank` | `/process/games`。
 */
function processListMode(pathname: string): 'default' | 'bank' | 'games' {
  if (pathname.includes('/process/bank')) return 'bank'
  if (pathname.includes('/process/games')) return 'games'
  return 'default'
}

export function ProcessListMain({ bootstrap }: Props) {
  const { pathname } = useLocation()
  const mode = processListMode(pathname)
  const [sessionBump, setSessionBump] = useState(0)

  useLayoutEffect(() => {
    document.body.classList.add('processlist-spa-embed')
    return () => {
      document.body.classList.remove('processlist-spa-embed')
    }
  }, [])

  useEffect(() => {
    const onS = () => setSessionBump((b) => b + 1)
    window.addEventListener('c168:company-session-updated', onS)
    return () => window.removeEventListener('c168:company-session-updated', onS)
  }, [])

  const src = useMemo(() => {
    const p = new URLSearchParams()
    p.set('c168_embed', '1')
    if (mode === 'bank') p.set('as_bank', '1')
    if (mode === 'games') p.set('as_games', '1')
    if (bootstrap.companyId != null) p.set('company_id', String(bootstrap.companyId))
    return apiUrl(`/processlist_classic.php?${p.toString()}`)
  }, [mode, bootstrap.companyId, sessionBump])

  return (
    <div className="processListSpa">
      <iframe
        title="Process List"
        className="processListSpa__iframe"
        key={src}
        src={src}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
      />
    </div>
  )
}
