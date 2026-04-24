import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import { fetchDomainCompanyPermissions } from '../../lib/processListApi'
import type { GamePermission } from '../../lib/processListTypes'
import { ProcessListBankPanel } from './ProcessListBankPanel'
import { ProcessListGamesPanel } from './ProcessListGamesPanel'
import {
  resolveActiveCategory,
  routeForCategory,
  writeStoredCategory,
} from './processListMainHelpers'
import { apiUrl } from '../../lib/api'
import '../../../../css/processCSS.css'
import '../../../../css/global-13inch.css'
import './ProcessListMain.css'

type Props = { bootstrap: DashboardBootstrapData }

const CAT_ORDER: string[] = ['Games', 'Bank', 'Loan', 'Rate', 'Money']

function sortPerms(p: string[]): string[] {
  return [...p].sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a)
    const bi = CAT_ORDER.indexOf(b)
    const as = ai === -1 ? 99 : ai
    const bs = bi === -1 ? 99 : bi
    if (as !== bs) return as - bs
    return a.localeCompare(b)
  })
}

export function ProcessListMain({ bootstrap }: Props) {
  const w = useTransactionWorkspace(bootstrap)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const wRef = useRef(w)
  wRef.current = w

  const [domainPerms, setDomainPerms] = useState<GamePermission[]>([
    'Games',
    'Bank',
    'Loan',
    'Rate',
    'Money',
  ])
  const [permLoaded, setPermLoaded] = useState(false)
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const onNotice = useCallback((text: string, kind: 'ok' | 'err') => {
    setNotice({ text, kind })
    if (text) {
      window.setTimeout(() => setNotice(null), 5000)
    }
  }, [])

  const companyCode = useMemo(() => {
    const id = w.activeCompanyId
    if (id == null) return null
    const row = w.companies.find((c) => Number(c.id) === Number(id))
    return row && row.company_id ? String(row.company_id) : null
  }, [w.activeCompanyId, w.companies])

  const activeCategory = useMemo((): GamePermission => {
    const dom = permLoaded ? domainPerms : ['Games', 'Bank', 'Loan', 'Rate', 'Money']
    return resolveActiveCategory(pathname, companyCode, dom as GamePermission[])
  }, [pathname, companyCode, domainPerms, permLoaded])

  useLayoutEffect(() => {
    document.body.classList.add('process-page', 'processlist-spa-embed', 'processlist-spa-native')
    return () => {
      document.body.classList.remove(
        'process-page',
        'processlist-spa-embed',
        'processlist-spa-native',
        'process-page--bank',
      )
    }
  }, [])

  useEffect(() => {
    if (activeCategory === 'Bank') {
      document.body.classList.add('process-page--bank')
    } else {
      document.body.classList.remove('process-page--bank')
    }
  }, [activeCategory])

  useEffect(() => {
    window.__C168_API_BASE__ = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
    const pre = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    window.__C168_SPA_LINK_BASE__ = pre
    window.EAZYCOUNT_SPA_PROCESSLIST = pre ? `${pre}/process` : '/process'
    return () => {
      delete window.__C168_API_BASE__
      delete window.__C168_SPA_LINK_BASE__
      delete window.EAZYCOUNT_SPA_PROCESSLIST
    }
  }, [])

  useEffect(() => {
    if (companyCode == null) {
      setPermLoaded(true)
      return
    }
    let on = true
    void (async () => {
      const r = await fetchDomainCompanyPermissions(companyCode)
      if (!on) return
      if (r.success && r.data.length > 0) {
        setDomainPerms(sortPerms(r.data as string[]) as GamePermission[])
      }
      setPermLoaded(true)
    })()
    return () => {
      on = false
    }
  }, [companyCode])

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
    window.onSharedCompanyFilterChanged = (companyId) => {
      if (companyId == null || companyId === '') {
        wRef.current.setGroup(null)
        return
      }
      const id = typeof companyId === 'number' ? companyId : parseInt(String(companyId), 10)
      if (!Number.isFinite(id)) return
      wRef.current.onPickCompany(id)
      replaceCompanyInUrl(id)
    }
    return () => {
      delete window.onSharedCompanyFilterChanged
    }
  }, [replaceCompanyInUrl])

  const spKey = searchParams.toString()
  useEffect(() => {
    if (!w.companiesReady) return
    const raw = searchParams.get('company_id')
    if (raw == null || raw === '') return
    const want = parseInt(raw, 10)
    if (!Number.isFinite(want)) return
    if (w.activeCompanyId != null && Number(w.activeCompanyId) === want) return
    const row = w.companies.find((c) => Number(c.id) === want)
    if (!row) return
    const g =
      row.group_id && String(row.group_id).trim() !== ''
        ? String(row.group_id).toUpperCase()
        : null
    if (g) w.setGroup(g)
    window.setTimeout(() => w.onPickCompany(want), 0)
  }, [w.companiesReady, spKey, w.companies, w.activeCompanyId, w.setGroup, w.onPickCompany, searchParams])

  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    if (searchParams.get('company_id')) return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

  const goCategory = (cat: string) => {
    if (companyCode) writeStoredCategory(companyCode, cat)
    const path = routeForCategory(cat)
    navigate({ pathname: path, search: searchParams.toString() ? `?${searchParams.toString()}` : '' })
  }

  if (!w.companiesReady) {
    return (
      <div className="plMain plMain--loading">
        <p>Loading companies…</p>
      </div>
    )
  }
  if (w.loadCompaniesError) {
    return (
      <div className="plMain plMain--err">
        <p>无法加载公司列表，请刷新页面。</p>
        <button type="button" className="plBtn" onClick={() => w.retryLoadCompanies()}>
          Retry
        </button>
      </div>
    )
  }
  if (w.activeCompanyId == null) {
    return <div className="plMain">请选择一个公司。</div>
  }

  return (
    <div className="plMain container process-page__inner">
      {notice ? (
        <div className={notice.kind === 'ok' ? 'plFlash plFlash--ok' : 'plFlash plFlash--err'}>
          {notice.text}
        </div>
      ) : null}

      <div className="action-buttons-container" style={{ marginTop: 8 }}>
        <div className="action-buttons" style={{ flexWrap: 'wrap' }}>
          <div className="plCatRow">
            {domainPerms.map((p) => (
              <button
                key={p}
                type="button"
                className={'plCatBtn' + (activeCategory === p ? ' plCatBtn--on' : '')}
                onClick={() => goCategory(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="search-container" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ minWidth: 200 }}
            aria-label="Search"
          />
        </div>
        {activeCategory !== 'Bank' ? (
          <>
            <label className="plCheck">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Inactive
            </label>
            <label className="plCheck">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show all
            </label>
          </>
        ) : null}
        <a className="plClassicLink" href={apiUrl('/processlist_classic.php')}>
          经典版
        </a>
      </div>

      {activeCategory === 'Bank' ? (
        <ProcessListBankPanel
          key={w.activeCompanyId + String(search)}
          companyId={w.activeCompanyId}
          search={search}
          onNotice={onNotice}
        />
      ) : (
        <ProcessListGamesPanel
          key={w.activeCompanyId + activeCategory + String(search)}
          companyId={w.activeCompanyId}
          permission={activeCategory}
          search={search}
          showInactive={showInactive}
          showAll={showAll}
          onNotice={onNotice}
        />
      )}
    </div>
  )
}
