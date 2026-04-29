import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { DashboardBootstrapData } from '../../types/dashboard'
import '../../../../css/accountCSS.css'
import '../../../../css/datacapturesummary.css'
import '../../../../css/global-13inch.css'
import './DataCaptureMain.css'

type Props = {
  bootstrap: DashboardBootstrapData
}

type ProcessData = {
  date?: string
  process?: string | number
  process_name?: string
  processName?: string
  description?: string
  currency?: string
  remark?: string
}

type AccountListApiRow = {
  id: number
  account_id: string
}

type Cell = {
  type?: string
  value?: string | number
}

type CapturedTableData = {
  headers?: Cell[]
  rows?: Cell[][]
}

function parseJsonStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function cellText(cell: Cell | undefined): string {
  if (!cell) return ''
  return String(cell.value ?? '').trim()
}

function normalizeHeaderName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const norm = headers.map((h) => normalizeHeaderName(h))
  for (const a of aliases) {
    const idx = norm.findIndex((h) => h === normalizeHeaderName(a))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * React `/datacapturesummary` 第一阶段：
 * - 由 React 直接读取 Data Capture 写入的 localStorage 快照并展示 Summary
 * - 暂不接入复杂公式编辑器与批量提交（下一阶段再迁移）
 */
export function DataCaptureSummaryMain({ bootstrap }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [processData, setProcessData] = useState<ProcessData | null>(null)
  const [tableData, setTableData] = useState<CapturedTableData | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useLayoutEffect(() => {
    document.body.classList.add('datacapture-summary-spa-embed', 'datacapture-page')
    return () => {
      document.body.classList.remove('datacapture-summary-spa-embed', 'datacapture-page')
    }
  }, [])

  useLayoutEffect(() => {
    window.DATACAPTURESUMMARY_COMPANY_ID = bootstrap.companyId ?? null
    return () => {
      delete window.DATACAPTURESUMMARY_COMPANY_ID
    }
  }, [bootstrap.companyId])

  useEffect(() => {
    setProcessData(parseJsonStorage<ProcessData>('capturedProcessData'))
    setTableData(parseJsonStorage<CapturedTableData>('capturedTableData'))
  }, [])

  useEffect(() => {
    if (searchParams.get('success') === '1') {
      setNotice({ kind: 'ok', msg: 'Data captured and summary generated successfully.' })
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.delete('success')
          return p
        },
        { replace: true },
      )
    } else if (searchParams.get('error') === '1') {
      setNotice({ kind: 'err', msg: 'Failed to generate summary. Please try again.' })
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.delete('error')
          return p
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  const displayRows = useMemo(() => {
    const rows = tableData?.rows
    if (!Array.isArray(rows)) return []
    return rows.filter((r) => Array.isArray(r) && r.some((c) => cellText(c) !== ''))
  }, [tableData])

  const displayHeaders = useMemo(() => {
    const h = tableData?.headers
    if (!Array.isArray(h) || h.length === 0) return []
    return h.map((x) => cellText(x))
  }, [tableData])

  const processLabel =
    processData?.process_name || processData?.processName || String(processData?.process || '-')

  const canTrySubmitBeta = displayRows.length > 0 && displayHeaders.length > 0

  const submitBeta = async () => {
    if (!processData?.date || !processData?.process) {
      setNotice({
        kind: 'err',
        msg: 'Missing process metadata. Please go back to Data Capture and regenerate summary.',
      })
      return
    }
    const idxIdProduct = findHeaderIndex(displayHeaders, ['Id Product', 'ID Product'])
    const idxAccount = findHeaderIndex(displayHeaders, ['Account'])
    const idxCurrency = findHeaderIndex(displayHeaders, ['Currency'])
    const idxFormula = findHeaderIndex(displayHeaders, ['Formula'])
    const idxProcessed = findHeaderIndex(displayHeaders, [
      'Processed Amount',
      'Amount',
      'Final Amount',
    ])

    if (idxIdProduct < 0 || idxAccount < 0 || idxCurrency < 0 || idxProcessed < 0) {
      setNotice({
        kind: 'err',
        msg: 'Cannot detect required columns (Id Product / Account / Currency / Processed Amount). Please use Open Classic.',
      })
      return
    }

    setSubmitting(true)
    try {
      const companyId = bootstrap.companyId
      const accountRes = await apiFetch(
        `/api/accounts/accountlistapi.php?company_id=${encodeURIComponent(String(companyId))}&showAll=1`,
      )
      const accountJson = (await accountRes.json()) as {
        success?: boolean
        data?: { accounts?: AccountListApiRow[] }
      }
      const accounts = Array.isArray(accountJson.data?.accounts) ? accountJson.data!.accounts : []
      const byAccountId = new Map(
        accounts.map((a) => [String(a.account_id || '').trim().toUpperCase(), Number(a.id)]),
      )

      const summaryRows: Array<Record<string, unknown>> = []
      for (const r of displayRows) {
        const idProduct = cellText(r[idxIdProduct])
        const accountText = cellText(r[idxAccount])
        const currencyText = cellText(r[idxCurrency]).replace(/[()]/g, '').trim()
        const processedRaw = cellText(r[idxProcessed]).replace(/,/g, '')
        const formulaText = idxFormula >= 0 ? cellText(r[idxFormula]) : ''
        if (!idProduct || !accountText) continue
        const accountKey = accountText.split(/\s+/)[0]?.trim().toUpperCase() || accountText.toUpperCase()
        const accountId = byAccountId.get(accountKey)
        if (!accountId) continue
        const processedNum = parseFloat(processedRaw)
        if (!Number.isFinite(processedNum)) continue
        summaryRows.push({
          idProductMain: idProduct,
          idProduct: idProduct,
          productType: 'main',
          accountId,
          account: accountText,
          accountDisplay: accountText,
          currency: currencyText,
          currencyDisplay: currencyText,
          formula: formulaText,
          processedAmount: processedNum,
        })
      }

      if (summaryRows.length === 0) {
        setNotice({
          kind: 'err',
          msg: 'No valid rows could be mapped for submit. Please use Open Classic.',
        })
        return
      }

      const submitBody = {
        captureDate: processData.date,
        processId: processData.process,
        processName: processData.processName || processData.process_name || '',
        currencyId: processData.currency || '',
        currencyName: processData.currency || '',
        remark: processData.remark || '',
        summaryRows,
      }
      const url = `/api/datacapture_summary/summary_api.php?action=submit&company_id=${encodeURIComponent(String(companyId))}`
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitBody),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; error?: string }
      if (!json.success) {
        throw new Error(String(json.message || json.error || 'Submit failed'))
      }
      setNotice({ kind: 'ok', msg: 'Submitted successfully (beta submit).' })
    } catch (e) {
      setNotice({
        kind: 'err',
        msg: e instanceof Error ? e.message : 'Submit failed, please use Open Classic.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dcShell">
      <div className="container">
        <h1>Data Capture Summary</h1>
        {notice && (
          <p className={notice.kind === 'ok' ? 'tShell__searchOk' : 'tShell__searchErr'}>
            {notice.msg}
          </p>
        )}

        <div className="summary-action-buttons" id="actionButtons" style={{ display: 'flex' }}>
          <button
            type="button"
            className="summary-btn summary-btn-delete"
            onClick={() => void submitBeta()}
            disabled={!canTrySubmitBeta || submitting}
            title="React beta submit"
          >
            {submitting ? 'Submitting...' : 'Submit (Beta)'}
          </button>
          <button
            type="button"
            className="summary-btn summary-btn-cancel"
            onClick={() => {
              window.location.href = '/datacapture'
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="summary-btn summary-btn-delete"
            onClick={() => {
              window.location.href = '/datacapturesummary_classic.php'
            }}
            title="Open classic summary for advanced edit/submit"
          >
            Open Classic
          </button>
        </div>

        <div className="summary-table-container" id="summaryTableContainer" style={{ display: 'block' }}>
          <div className="process-info-container" id="processInfoContainer" style={{ display: 'block' }}>
            <div className="process-info-row">
              <div className="process-info-item">
                <span className="process-info-label">Date:</span>
                <span className="process-info-value">{processData?.date || '-'}</span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Process:</span>
                <span className="process-info-value">{processLabel}</span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Description:</span>
                <span className="process-info-value">{processData?.description || '-'}</span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Currency:</span>
                <span className="process-info-value">{processData?.currency || '-'}</span>
              </div>
              <div className="process-info-item">
                <span className="process-info-label">Remark:</span>
                <span className="process-info-value">{processData?.remark || '-'}</span>
              </div>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="summary-table" id="summaryTable">
              <thead>
                <tr>
                  {(displayHeaders.length > 0 ? displayHeaders : ['Data']).map((h, idx) => (
                    <th key={`${h}_${idx}`}>{h || `Column ${idx + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody id="summaryTableBody">
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(displayHeaders.length, 1)}>No captured summary data found.</td>
                  </tr>
                ) : (
                  displayRows.map((r, rowIdx) => (
                    <tr key={`r_${rowIdx}`}>
                      {r.map((c, colIdx) => (
                        <td key={`c_${rowIdx}_${colIdx}`}>{cellText(c)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {displayRows.length === 0 && (
          <div style={{ marginTop: 12, color: '#6b7280' }}>
            Use `Back` to run Data Capture first, or open classic page to recover legacy data.
          </div>
        )}
      </div>
    </div>
  )
}
