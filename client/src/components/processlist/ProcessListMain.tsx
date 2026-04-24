import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import './ProcessListMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

/**
 * React `/processlist`：主区用 iframe 加载 `processlist_classic.php?c168_spa_frame=1`（无经典侧栏），
 * 与 `js/processlist.js` 中 `c168NotifyProcessListParentUrl` 同步查询串到 React Router。
 */
export function ProcessListMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const spKey = searchParams.toString()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const ignoreParentIframeSyncRef = useRef(false)

  const w = useTransactionWorkspace(bootstrap)
  const wRef = useRef(w)
  wRef.current = w

  useLayoutEffect(() => {
    document.body.classList.add('process-list-spa-embed')
    return () => {
      document.body.classList.remove('process-list-spa-embed')
    }
  }, [])

  const replaceCompanyInUrl = useCallback(
    (companyId: number) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('company_id', String(companyId))
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    window.__C168_API_BASE__ = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
    window.__C168_SPA_LINK_BASE__ = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    return () => {
      delete window.__C168_API_BASE__
      delete window.__C168_SPA_LINK_BASE__
    }
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'c168-processlist-sync' || typeof e.data.search !== 'string') return
      ignoreParentIframeSyncRef.current = true
      try {
        setSearchParams(new URLSearchParams(e.data.search), { replace: true })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [setSearchParams])

  /** 地址栏 company_id → workspace（与经典页 URL 行为一致） */
  useEffect(() => {
    if (!w.companiesReady) return
    const raw = searchParams.get('company_id')
    if (raw == null || raw === '') return
    const want = parseInt(raw, 10)
    if (!Number.isFinite(want)) return
    const active = wRef.current.activeCompanyId
    if (active != null && Number(active) === want) return
    const row = wRef.current.companies.find((c) => Number(c.id) === want)
    if (!row) return
    const g =
      row.group_id && String(row.group_id).trim() !== ''
        ? String(row.group_id).toUpperCase()
        : null
    if (g) wRef.current.setGroup(g)
    window.setTimeout(() => {
      wRef.current.onPickCompany(want)
    }, 0)
  }, [w.companiesReady, spKey])

  /** 无 company_id 时写入当前会话公司，便于分享/刷新 */
  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    if (searchParams.get('company_id')) return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

  useEffect(() => {
    if (ignoreParentIframeSyncRef.current) {
      ignoreParentIframeSyncRef.current = false
      return
    }
    const el = iframeRef.current
    if (!el) return
    const p = new URLSearchParams(spKey)
    p.set('c168_spa_frame', '1')
    const next = `${apiUrl('/processlist_classic.php')}?${p.toString()}`
    if (el.src === next) return
    el.src = next
  }, [spKey])

  if (w.loadCompaniesError) {
    return (
      <div className="plShell plShell--err">
        <p>无法加载公司列表</p>
        <button type="button" onClick={() => w.retryLoadCompanies()}>
          重试
        </button>
      </div>
    )
  }

  if (!w.companiesReady || w.activeCompanyId == null) {
    return (
      <div className="plShell plShell--loading">
        <p>加载中…</p>
      </div>
    )
  }

  return (
    <div className="plShell">
      <iframe
        ref={iframeRef}
        className="plShell__frame"
        title="Process List"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      />
    </div>
  )
}
