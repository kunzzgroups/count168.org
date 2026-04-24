import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveProcessListCategoryForCompanyCode } from '../../lib/processListCategoryApi'
import { useTransactionWorkspace } from '../../hooks/useTransactionWorkspace'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/processCSS.css'
import '../../../../css/accountCSS.css'
import '../../../../css/processlist.css'
import '../../../../css/global-13inch.css'
import './ProcessListMain.css'
import { ProcessListNative } from './ProcessListNative'

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

  const catIsBank = searchParams.get('category')?.toLowerCase() === 'bank'

  useLayoutEffect(() => {
    document.body.classList.add('process-list-spa-embed', 'process-page')
    if (catIsBank) document.body.classList.add('process-page--bank')
    else document.body.classList.remove('process-page--bank')
    return () => {
      document.body.classList.remove(
        'process-list-spa-embed',
        'process-page',
        'process-page--bank',
        'process-page--bank-show-all',
        'process-page--show-all',
      )
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

  /** 离开页面时清理 legacy 全局变量，避免侧栏与其它 SPA 误用 PROCESSLIST_COMPANY_CODE */
  useEffect(() => {
    return () => {
      const pw = window as ProcessListWindow
      delete pw.PROCESSLIST_COMPANY_ID
      delete pw.PROCESSLIST_COMPANY_CODE
      delete pw.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD
      delete pw.PROCESSLIST_COMPANY_CODE_BY_ID
      delete pw.PROCESSLIST_PAGE_FILE
      delete pw.PROCESSLIST_SHOW_INACTIVE
      delete pw.PROCESSLIST_SHOW_ALL
      delete pw.PROCESSLIST_SHOW_OFFICIAL
      delete pw.PROCESSLIST_SHOW_E_INVOICE
      delete pw.PROCESSLIST_SHOW_BLOCK
      delete pw.__PROCESS_LIST_SPA_EMBED__
    }
  }, [])

  const replaceCompanyInUrl = useCallback(
    (companyId: number, companyCode: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('company_id', String(companyId))
          p.delete('category')
          return p
        },
        { replace: true },
      )
      void resolveProcessListCategoryForCompanyCode(companyCode).then((category) => {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev)
            if (p.get('company_id') !== String(companyId)) return prev
            p.set('category', category)
            return p
          },
          { replace: true },
        )
      })
    },
    [setSearchParams],
  )

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
    window.onSharedCompanyFilterChanged = (companyId, _companyCode) => {
      const wr = wRef.current
      if (companyId == null || companyId === '') {
        wr.setGroup(null)
        return
      }
      const id = typeof companyId === 'number' ? companyId : parseInt(String(companyId), 10)
      if (!Number.isFinite(id)) return
      wr.onPickCompany(id)
      const row = wr.companies.find((c) => Number(c.id) === id)
      const code = row
        ? String(row.company_id || '').trim()
        : String(_companyCode || '').trim()
      replaceCompanyInUrl(id, code)
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
    const row = w.companies.find((c) => Number(c.id) === Number(w.activeCompanyId))
    const code = row ? String(row.company_id || '').trim() : ''
    replaceCompanyInUrl(w.activeCompanyId, code)
  }, [w.companiesReady, w.activeCompanyId, searchParams, replaceCompanyInUrl, w.companies])

  /** 供书签 / 旧脚本读取的 company 快照（不设 __PROCESS_LIST_SPA_EMBED__，避免误走 legacy 分支） */
  useEffect(() => {
    if (!w.companiesReady || w.loadCompaniesError || w.activeCompanyId == null) return
    const pw = window as ProcessListWindow
    const raw = searchParams.get('company_id')
    let effectiveId = w.activeCompanyId
    if (raw != null && raw !== '') {
      const want = parseInt(raw, 10)
      if (Number.isFinite(want)) effectiveId = want
    }
    pw.PROCESSLIST_COMPANY_ID = effectiveId
    pw.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD = effectiveId ? [effectiveId] : []
    const activeRow = w.companies.find((c) => Number(c.id) === Number(effectiveId))
    pw.PROCESSLIST_COMPANY_CODE = activeRow ? String(activeRow.company_id || '').trim() : ''
    const map: Record<string, string> = {}
    for (const c of w.companies) {
      map[String(c.id)] = String(c.company_id || '').trim()
    }
    pw.PROCESSLIST_COMPANY_CODE_BY_ID = map
    pw.PROCESSLIST_PAGE_FILE = 'processlist_classic.php'
  }, [w.companiesReady, w.loadCompaniesError, w.activeCompanyId, w.companies, spKey])

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
    <div className="plShell" data-process-list-spa="native">
      <ProcessListNative bootstrap={bootstrap} workspace={w} replaceCompanyInUrl={replaceCompanyInUrl} />
    </div>
  )
}
