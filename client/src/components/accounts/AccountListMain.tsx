import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  fetchAccounts?: () => void | Promise<void>
}

/**
 * React `/accounts`：壳与 Transaction 一致；主区 DOM + `js/account-list.js` 与 `account-list_classic.php` 对齐。
 */
export function AccountListMain({ bootstrap }: Props) {
  const w = useTransactionWorkspace(bootstrap)
  const wRef = useRef(w)
  wRef.current = w

  const [legacyReady, setLegacyReady] = useState(false)
  const scriptInitRef = useRef(false)

  const urlInit = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    return {
      search: p.get('search') ?? '',
      showInactive: p.has('showInactive'),
      showAll: p.has('showAll'),
    }
  }, [])

  useLayoutEffect(() => {
    document.body.classList.add('account-list-spa-embed', 'account-page')
    ;(window as unknown as { __ACCOUNT_LIST_SPA_EMBED__?: boolean }).__ACCOUNT_LIST_SPA_EMBED__ = true
    const aw = window as AccountListWindow
    aw.ACCOUNT_LIST_SHOW_INACTIVE = urlInit.showInactive
    aw.ACCOUNT_LIST_SHOW_ALL = urlInit.showAll
    return () => {
      document.body.classList.remove('account-list-spa-embed', 'account-page')
      delete (window as unknown as { __ACCOUNT_LIST_SPA_EMBED__?: boolean }).__ACCOUNT_LIST_SPA_EMBED__
    }
  }, [urlInit.showInactive, urlInit.showAll])

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
    }
    return () => {
      delete window.onSharedCompanyFilterChanged
    }
  }, [])

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
                    onClick={() => w.onPickCompany(c.id)}
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
        initialSearch={urlInit.search}
        initialShowInactive={urlInit.showInactive}
        initialShowAll={urlInit.showAll}
        belowToolbar={companyRow}
      />
    </div>
  )
}
