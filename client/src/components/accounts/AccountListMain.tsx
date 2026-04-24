import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/accountCSS.css'
import '../../../../css/account-list.css'
import '../../../../css/global-13inch.css'
import './AccountListMain.css'
import { AccountListLegacyDom } from './AccountListLegacyDom'

let accountListScriptPromise: Promise<void> | null = null

function ensureAccountListScript(): Promise<void> {
  if (!accountListScriptPromise) {
    accountListScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = apiUrl('/js/account-list.js')
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load account-list.js'))
      document.head.appendChild(s)
    })
  }
  return accountListScriptPromise
}

type Props = {
  bootstrap: DashboardBootstrapData
}

/** 供 `account-list.js` 读取的全局字段（与 IDE 的 Window 合并类型对齐） */
type AccountListWindow = Window & {
  ACCOUNT_LIST_SHOW_INACTIVE?: boolean
  ACCOUNT_LIST_SHOW_ALL?: boolean
  ACCOUNT_LIST_COMPANY_ID?: number | null
  ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD?: number[]
  runAccountListPageInit?: () => void
  fetchAccounts?: () => void
  c168SyncAccountListFromLocation?: () => void
}

/**
 * React `/accounts`：壳与 Transaction 一致；主区 DOM + `js/account-list.js` 与 `account-list_classic.php` 对齐。
 * - 查询串与经典 GET 一致：`company_id`、`showInactive`、`showAll`、`search`
 * - 公司切换走 `useTransactionWorkspace` + React Router `setSearchParams`，与 legacy `replaceState` 不打架
 */
export function AccountListMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const spKey = searchParams.toString()

  const w = useTransactionWorkspace(bootstrap)
  const wRef = useRef(w)
  wRef.current = w

  const [legacyReady, setLegacyReady] = useState(false)
  const scriptInitRef = useRef(false)
  const skipLocationSyncRef = useRef(true)

  useLayoutEffect(() => {
    document.body.classList.add('account-list-spa-embed', 'account-page')
    ;(window as unknown as { __ACCOUNT_LIST_SPA_EMBED__?: boolean }).__ACCOUNT_LIST_SPA_EMBED__ = true
    return () => {
      document.body.classList.remove('account-list-spa-embed', 'account-page')
      document.body.classList.remove('account-page--show-all')
      delete (window as unknown as { __ACCOUNT_LIST_SPA_EMBED__?: boolean }).__ACCOUNT_LIST_SPA_EMBED__
    }
  }, [])

  useLayoutEffect(() => {
    const aw = window as AccountListWindow
    aw.ACCOUNT_LIST_SHOW_INACTIVE = searchParams.has('showInactive')
    aw.ACCOUNT_LIST_SHOW_ALL = searchParams.has('showAll')
  }, [searchParams])

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
    const id = 'c168-font-amaranth'
    if (!document.getElementById(id)) {
      const l = document.createElement('link')
      l.id = id
      l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap'
      document.head.appendChild(l)
    }
  }, [])

  useEffect(() => {
    window.__C168_API_BASE__ = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
    window.__C168_SPA_LINK_BASE__ = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    return () => {
      delete window.__C168_API_BASE__
      delete window.__C168_SPA_LINK_BASE__
    }
  }, [])

  /** legacy `switchAccountListCompany` 使用 `replaceState` 时与 React Router 同步 */
  useEffect(() => {
    const onReplaced = () => {
      try {
        setSearchParams(new URLSearchParams(window.location.search), { replace: true })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('c168:account-list-url-replaced', onReplaced)
    return () => window.removeEventListener('c168:account-list-url-replaced', onReplaced)
  }, [setSearchParams])

  useEffect(() => {
    window.onSharedCompanyFilterChanged = (companyId, _companyCode) => {
      const wr = wRef.current
      if (companyId == null || companyId === '') {
        wr.setGroup(null)
        return
      }
      const id = typeof companyId === 'number' ? companyId : parseInt(String(companyId), 10)
      if (!Number.isFinite(id)) return
      wr.onPickCompany(id)
      replaceCompanyInUrl(id)
    }
    return () => {
      delete window.onSharedCompanyFilterChanged
    }
  }, [replaceCompanyInUrl])

  /** 地址栏 `company_id` → workspace（与 `account-list_classic.php` 校验 URL 行为一致） */
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

  /** 无 `company_id` 时写入当前会话公司，便于分享/刷新（经典页依赖 session，此处增强为可书签） */
  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    if (searchParams.get('company_id')) return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

  useEffect(() => {
    if (!w.companiesReady || w.loadCompaniesError || w.activeCompanyId == null) return

    const aw = window as AccountListWindow
    aw.ACCOUNT_LIST_COMPANY_ID = w.activeCompanyId
    aw.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD = w.activeCompanyId ? [w.activeCompanyId] : []

    if (!scriptInitRef.current) {
      let alive = true
      void ensureAccountListScript()
        .then(() => {
          if (!alive) return
          scriptInitRef.current = true
          aw.runAccountListPageInit?.()
          setLegacyReady(true)
        })
        .catch((err) => {
          console.error(err)
        })
      return () => {
        alive = false
      }
    }

    void aw.fetchAccounts?.()
    return undefined
  }, [w.companiesReady, w.loadCompaniesError, w.activeCompanyId])

  /** 前进/后退或 React 内更新 query：刷新 legacy 勾选与列表（跳过首次，避免与 init 双请求） */
  useEffect(() => {
    if (!legacyReady) return
    if (skipLocationSyncRef.current) {
      skipLocationSyncRef.current = false
      return
    }
    window.c168SyncAccountListFromLocation?.()
  }, [legacyReady, spKey])

  const companyRow =
    w.groupIds.length > 0 || w.companies.length > 0 ? (
      <>
        {w.groupIds.length > 0 && (
          <div id="group-buttons-wrapper" className="account-company-filter shared-group-wrapper">
            <span className="account-company-label">GroupID:</span>
            <div id="group-buttons-container" className="account-company-buttons">
              {w.groupIds.map((g) => {
                const active =
                  w.selectedGroup != null && String(w.selectedGroup).toUpperCase() === g
                return (
                  <button
                    key={g}
                    type="button"
                    className={
                      active
                        ? 'account-company-btn shared-group-btn active'
                        : 'account-company-btn shared-group-btn'
                    }
                    data-group-id={g}
                    onClick={() => w.setGroup(w.selectedGroup === g ? null : g)}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {w.companies.length > 0 && (
          <div id="company-buttons-wrapper" className="account-company-filter shared-company-wrapper">
            <span className="account-company-label">Company:</span>
            <div id="company-buttons-container" className="account-company-buttons" role="group" aria-label="Company">
              {w.companies.map((c) => {
                const code = String(c.company_id || '').trim()
                if (!code) return null
                const cGid = String(c.group_id || '').trim().toUpperCase()
                const selG = w.selectedGroup != null ? String(w.selectedGroup).toUpperCase() : null
                const visible = selG ? cGid === selG : !cGid
                const isActive = Number(c.id) === Number(w.activeCompanyId)
                return (
                  <button
                    key={c.id}
                    type="button"
                    style={{ display: visible ? undefined : 'none' }}
                    className={
                      isActive
                        ? 'account-company-btn shared-company-btn active'
                        : 'account-company-btn shared-company-btn'
                    }
                    data-company-id={c.id}
                    data-group-id={cGid}
                    data-company-code={code}
                    onClick={() => {
                      w.onPickCompany(c.id)
                      replaceCompanyInUrl(c.id)
                    }}
                  >
                    {code}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </>
    ) : null

  if (w.loadCompaniesError) {
    return (
      <div className="container">
        <div className="content">
          <p className="account-page-title">无法加载公司列表</p>
          <button type="button" className="account-btn account-btn-add" onClick={() => w.retryLoadCompanies()}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!w.companiesReady || w.activeCompanyId == null) {
    return (
      <div className="container">
        <div className="content">
          <p className="account-page-title">加载中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="alShell" data-account-list-spa={legacyReady ? '1' : '0'}>
      <AccountListLegacyDom
        initialSearch={searchParams.get('search') ?? ''}
        initialShowInactive={searchParams.has('showInactive')}
        initialShowAll={searchParams.has('showAll')}
        belowToolbar={companyRow}
      />
    </div>
  )
}
