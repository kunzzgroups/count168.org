import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/api'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/processCSS.css'
import '../../../../css/accountCSS.css'
import '../../../../css/processlist.css'
import '../../../../css/date-range-picker.css'
import '../../../../css/global-13inch.css'
import './ProcessListMain.css'
import { ProcessListLegacyDom } from './ProcessListLegacyDom'

let processListScriptsPromise: Promise<void> | null = null

function ensureProcessListScripts(): Promise<void> {
  if (!processListScriptsPromise) {
    processListScriptsPromise = new Promise((resolve, reject) => {
      const s1 = document.createElement('script')
      s1.src = apiUrl('/js/processlist.js')
      s1.async = true
      s1.onload = () => {
        const s2 = document.createElement('script')
        s2.src = apiUrl('/js/bank_process_list.js')
        s2.async = true
        s2.onload = () => resolve()
        s2.onerror = () => reject(new Error('Failed to load bank_process_list.js'))
        document.head.appendChild(s2)
      }
      s1.onerror = () => reject(new Error('Failed to load processlist.js'))
      document.head.appendChild(s1)
    })
  }
  return processListScriptsPromise
}

type ProcessListWindow = Window & {
  PROCESSLIST_SHOW_INACTIVE?: boolean
  PROCESSLIST_SHOW_ALL?: boolean
  PROCESSLIST_SHOW_OFFICIAL?: boolean
  PROCESSLIST_SHOW_E_INVOICE?: boolean
  PROCESSLIST_SHOW_BLOCK?: boolean
  PROCESSLIST_COMPANY_ID?: number | null
  PROCESSLIST_COMPANY_CODE?: string
  PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD?: number[]
  PROCESSLIST_COMPANY_CODE_BY_ID?: Record<string, string>
  PROCESSLIST_PAGE_FILE?: string
  __PROCESS_LIST_SPA_EMBED__?: boolean
  runProcessListPageInit?: () => void
  fetchProcesses?: () => void | Promise<void>
  c168SyncProcessListFromLocation?: () => void
}

type Props = {
  bootstrap: DashboardBootstrapData
}

export function ProcessListMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const spKey = searchParams.toString()

  const w = useTransactionWorkspace(bootstrap)
  const wRef = useRef(w)
  wRef.current = w

  const [legacyReady, setLegacyReady] = useState(false)
  const scriptInitRef = useRef(false)
  const skipLocationSyncRef = useRef(true)

  const catIsBank = searchParams.get('category')?.toLowerCase() === 'bank'
  /** 与 `updateProcessListPageTitle` / 经典 bank_process_list 一致，避免重渲染把标题写回 Games */
  const pageTitle = catIsBank ? 'Bank Process List' : 'Process List'

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  useLayoutEffect(() => {
    document.body.classList.add('process-list-spa-embed', 'process-page')
    if (catIsBank) document.body.classList.add('process-page--bank')
    else document.body.classList.remove('process-page--bank')
    ;(window as unknown as { __PROCESS_LIST_SPA_EMBED__?: boolean }).__PROCESS_LIST_SPA_EMBED__ = true
    return () => {
      document.body.classList.remove(
        'process-list-spa-embed',
        'process-page',
        'process-page--bank',
        'process-page--bank-show-all',
        'process-page--show-all',
      )
      delete (window as unknown as { __PROCESS_LIST_SPA_EMBED__?: boolean }).__PROCESS_LIST_SPA_EMBED__
    }
  }, [catIsBank])

  useLayoutEffect(() => {
    const pw = window as ProcessListWindow
    pw.PROCESSLIST_SHOW_INACTIVE = searchParams.has('showInactive')
    pw.PROCESSLIST_SHOW_ALL = searchParams.has('showAll')
    pw.PROCESSLIST_SHOW_OFFICIAL = searchParams.has('showOfficial')
    pw.PROCESSLIST_SHOW_E_INVOICE = searchParams.has('showEInvoice')
    pw.PROCESSLIST_SHOW_BLOCK = searchParams.has('showBlock')
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

  const ensureCategoryInUrl = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (!p.get('category')) p.set('category', 'Games')
        return p
      },
      { replace: true },
    )
  }, [setSearchParams])

  useEffect(() => {
    ensureCategoryInUrl()
  }, [ensureCategoryInUrl])

  useEffect(() => {
    const id = 'c168-font-awesome-process'
    if (!document.getElementById(id)) {
      const l = document.createElement('link')
      l.id = id
      l.rel = 'stylesheet'
      l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
      document.head.appendChild(l)
    }
  }, [])

  useEffect(() => {
    const id = 'c168-font-amaranth-pl'
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
    const onReplaced = () => {
      try {
        setSearchParams(new URLSearchParams(window.location.search), { replace: true })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('c168:process-list-url-replaced', onReplaced)
    return () => window.removeEventListener('c168:process-list-url-replaced', onReplaced)
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

  useEffect(() => {
    if (!w.companiesReady || w.activeCompanyId == null) return
    if (searchParams.get('company_id')) return
    replaceCompanyInUrl(w.activeCompanyId)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl])

  useEffect(() => {
    if (!w.companiesReady || w.loadCompaniesError || w.activeCompanyId == null) return

    const pw = window as ProcessListWindow
    pw.PROCESSLIST_COMPANY_ID = w.activeCompanyId
    pw.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD = w.activeCompanyId ? [w.activeCompanyId] : []
    const activeRow = w.companies.find((c) => Number(c.id) === Number(w.activeCompanyId))
    pw.PROCESSLIST_COMPANY_CODE = activeRow ? String(activeRow.company_id || '').trim() : ''
    const map: Record<string, string> = {}
    for (const c of w.companies) {
      map[String(c.id)] = String(c.company_id || '').trim()
    }
    pw.PROCESSLIST_COMPANY_CODE_BY_ID = map
    pw.PROCESSLIST_PAGE_FILE = 'processlist_classic.php'

    if (!scriptInitRef.current) {
      let alive = true
      void ensureProcessListScripts()
        .then(() => {
          if (!alive) return
          scriptInitRef.current = true
          pw.runProcessListPageInit?.()
          setLegacyReady(true)
        })
        .catch((err) => {
          console.error(err)
        })
      return () => {
        alive = false
      }
    }

    // 与 switchProcessListCompany 一致：换公司后须 loadPermissionButtons（内会 switchPermission 或 fetchProcesses）
    const reloadPerms = window.loadPermissionButtons
    if (typeof reloadPerms === 'function') {
      void reloadPerms()
    } else {
      void pw.fetchProcesses?.()
    }
    return undefined
  }, [w.companiesReady, w.loadCompaniesError, w.activeCompanyId, w.companies])

  useEffect(() => {
    if (!legacyReady) return
    if (skipLocationSyncRef.current) {
      skipLocationSyncRef.current = false
      return
    }
    window.c168SyncProcessListFromLocation?.()
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
    <div className="plShell" data-process-list-spa={legacyReady ? '1' : '0'}>
      <ProcessListLegacyDom
        pageTitle={pageTitle}
        initialSearch={searchParams.get('search') ?? ''}
        initialShowInactive={searchParams.has('showInactive')}
        initialShowAll={searchParams.has('showAll')}
        initialShowOfficial={searchParams.has('showOfficial')}
        initialShowEInvoice={searchParams.has('showEInvoice')}
        initialShowBlock={searchParams.has('showBlock')}
        belowToolbar={companyRow}
      />
    </div>
  )
}
