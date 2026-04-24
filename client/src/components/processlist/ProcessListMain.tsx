import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import type { GamePermission } from '../../lib/processListTypes'
import { ProcessListAccountingDue } from './ProcessListAccountingDue'
import { ProcessListBankPanel } from './ProcessListBankPanel'
import { ProcessListGamesPanel } from './ProcessListGamesPanel'
import '../../../../css/processCSS.css'
import '../../../../css/processlist.css'
import '../../../../css/global-13inch.css'
import './ProcessListMain.css'

type Props = { bootstrap: DashboardBootstrapData }

export function ProcessListMain({ bootstrap }: Props) {
  const w = useTransactionWorkspace(bootstrap)
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const wRef = useRef(w)
  wRef.current = w
  const pendingCompanyPickRef = useRef<number | null>(null)

  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  const onNotice = useCallback((text: string, kind: 'ok' | 'err') => {
    setNotice({ text, kind })
    if (text) {
      window.setTimeout(() => setNotice(null), 5000)
    }
  }, [])

  const activeCategory = useMemo((): GamePermission => {
    return pathname.includes('/process/bank') ? 'Bank' : 'Games'
  }, [pathname])

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

  const replaceCompanyInUrl = useCallback(
    (companyId: number) => {
      const cur = searchParams.get('company_id')
      if (cur === String(companyId)) return
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('company_id', String(companyId))
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams, searchParams],
  )

  const applyCompanyFromUrl = useCallback(
    (id: number) => {
      if (!Number.isFinite(id)) return
      const row = w.companies.find((c) => Number(c.id) === Number(id))
      if (!row) return
      const g =
        row.group_id && String(row.group_id).trim() !== ''
          ? String(row.group_id).toUpperCase()
          : null
      if (g && String(w.selectedGroup || '').toUpperCase() !== g) {
        w.setGroup(g, { preferredCompanyId: id })
      } else {
        w.onPickCompany(id)
      }
    },
    [w],
  )

  /** 公司 pill 点击：只更新 URL，workspace 统一由 URL effect 驱动，避免双向回写抖动 */
  const handlePickCompany = useCallback(
    (id: number) => {
      if (!Number.isFinite(id)) return
      pendingCompanyPickRef.current = Number(id)
      replaceCompanyInUrl(Number(id))
    },
    [replaceCompanyInUrl],
  )

  useEffect(() => {
    window.onSharedCompanyFilterChanged = (companyId) => {
      if (companyId == null || companyId === '') {
        wRef.current.setGroup(null)
        return
      }
      const id = typeof companyId === 'number' ? companyId : parseInt(String(companyId), 10)
      if (!Number.isFinite(id)) return
      pendingCompanyPickRef.current = id
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
    applyCompanyFromUrl(want)
  }, [
    w.companiesReady,
    spKey,
    w.activeCompanyId,
    applyCompanyFromUrl,
  ])

  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    const pending = pendingCompanyPickRef.current
    if (pending != null && Number(w.activeCompanyId) === Number(pending)) {
      pendingCompanyPickRef.current = null
    }
    // 仅在 URL 缺失 company_id 时补一次；其余时刻 URL 是唯一真源，避免来回跳
    const cur = searchParams.get('company_id')
    if (cur != null && cur !== '') return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

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
    <div className="container">
      <div className="content">
        {notice ? (
          <div className={notice.kind === 'ok' ? 'plFlash plFlash--ok' : 'plFlash plFlash--err'}>
            {notice.text}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            marginBottom: 0,
            marginTop: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {activeCategory === 'Bank' ? 'Bank Process List' : 'Process List'}
            </h1>
            {activeCategory === 'Bank' && w.activeCompanyId != null ? (
              <ProcessListAccountingDue companyId={w.activeCompanyId} onNotice={onNotice} />
            ) : null}
          </div>
        </div>

        <div className="separator-line" />

        {activeCategory === 'Bank' ? (
          <ProcessListBankPanel
            key={String(w.activeCompanyId)}
            companyId={w.activeCompanyId}
            onNotice={onNotice}
            workspace={{
              groupIds: w.groupIds,
              selectedGroup: w.selectedGroup,
              setGroup: w.setGroup,
              scopeCompanies: w.scopeCompanies,
              activeCompanyId: w.activeCompanyId,
              onPickCompany: handlePickCompany,
            }}
          />
        ) : null}
        {activeCategory !== 'Bank' ? (
          <ProcessListGamesPanel
            key={w.activeCompanyId + activeCategory}
            companyId={w.activeCompanyId}
            permission={activeCategory}
            onNotice={onNotice}
            workspace={{
              groupIds: w.groupIds,
              selectedGroup: w.selectedGroup,
              setGroup: w.setGroup,
              scopeCompanies: w.scopeCompanies,
              activeCompanyId: w.activeCompanyId,
              onPickCompany: handlePickCompany,
            }}
          />
        ) : null}

      </div>
    </div>
  )
}
