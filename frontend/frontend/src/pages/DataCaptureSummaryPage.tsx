import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/services/http'

type CurrencyRow = { id: number; code: string }
type AccountRow = {
  id: number
  account_id: string
  role: string
  name: string
}

type LoadResponse = {
  success: boolean
  message?: string
  currencies?: CurrencyRow[]
  accounts?: AccountRow[]
  debug?: {
    accounts_count: number
    currencies_count: number
    company_id: number
  }
}

type SummaryStateResponse = {
  success: boolean
  message?: string
  data: Record<string, unknown> | null
}

export function DataCaptureSummaryPage() {
  const [searchParams] = useSearchParams()
  const companyFromUrl = searchParams.get('company_id') ?? ''

  const [companyId, setCompanyId] = useState(companyFromUrl)
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [debug, setDebug] = useState<LoadResponse['debug'] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [processId, setProcessId] = useState('')
  const [processCode, setProcessCode] = useState('')
  const [summaryState, setSummaryState] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [stateError, setStateError] = useState<string | null>(null)

  const fetchBootstrap = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (companyId.trim()) params.company_id = companyId.trim()
      const { data } = await http.get<LoadResponse>(
        '/datacapture_summary/summary_api.php',
        { params },
      )
      if (data.success) {
        setCurrencies(data.currencies ?? [])
        setAccounts(data.accounts ?? [])
        setDebug(data.debug ?? null)
      } else {
        setCurrencies([])
        setAccounts([])
        setDebug(null)
        setLoadError(data.message || 'Load failed')
      }
    } catch (e) {
      setCurrencies([])
      setAccounts([])
      setDebug(null)
      setLoadError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void fetchBootstrap()
  }, [fetchBootstrap])

  const fetchSummaryState = async () => {
    setStateError(null)
    setStateLoading(true)
    setSummaryState(null)
    try {
      const params: Record<string, string> = {
        action: 'get_summary_state',
      }
      if (processId.trim()) params.process_id = processId.trim()
      if (processCode.trim()) params.process_code = processCode.trim()
      if (companyId.trim()) params.company_id = companyId.trim()

      const { data } = await http.get<SummaryStateResponse>(
        '/datacapture_summary/summary_api.php',
        { params },
      )
      if (data.success) {
        setSummaryState(
          data.data && typeof data.data === 'object' ? data.data : null,
        )
      } else {
        setStateError(data.message || 'get_summary_state failed')
      }
    } catch (e) {
      setStateError(e instanceof Error ? e.message : 'get_summary_state failed')
    } finally {
      setStateLoading(false)
    }
  }

  return (
    <div
      className="page data-capture-summary-spa"
      style={{ padding: '1rem 1.25rem', textAlign: 'left' }}
    >
      <h1 style={{ marginTop: 0 }}>Data Capture Summary (API shell)</h1>
      <p style={{ color: '#64748b', maxWidth: 720 }}>
        Step 1 of migrating off classic <code>datacapturesummary.php</code>: load
        currencies/accounts via the same <code>summary_api.php</code> default
        action, and read server-side summary state. Full grid + submit stays on
        classic until ported.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>company_id (optional)</span>
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="uses session if empty"
            style={{ padding: '8px 10px', width: 120 }}
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchBootstrap()}
          disabled={loading}
          style={{
            padding: '10px 18px',
            fontWeight: 700,
            background: 'linear-gradient(180deg, #63c4ff, #0d60ff)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Reload bootstrap'}
        </button>
      </div>

      {loadError ? (
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{loadError}</p>
      ) : null}
      {debug ? (
        <p style={{ fontSize: 14, marginBottom: 16 }}>
          <strong>Debug:</strong> company_id {debug.company_id}, currencies{' '}
          {debug.currencies_count}, accounts {debug.accounts_count}
        </p>
      ) : null}

      <h2 style={{ fontSize: '1.1rem' }}>Currencies</h2>
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 280 }}>
          <thead>
            <tr>
              <th style={th}>id</th>
              <th style={th}>code</th>
            </tr>
          </thead>
          <tbody>
            {currencies.length === 0 && !loading ? (
              <tr>
                <td colSpan={2} style={td}>
                  No rows
                </td>
              </tr>
            ) : (
              currencies.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.id}</td>
                  <td style={td}>{c.code}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1.1rem' }}>Accounts</h2>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={th}>id</th>
              <th style={th}>account_id</th>
              <th style={th}>role</th>
              <th style={th}>name</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} style={td}>
                  No rows
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id}>
                  <td style={td}>{a.id}</td>
                  <td style={td}>{a.account_id}</td>
                  <td style={td}>{a.role}</td>
                  <td style={td}>{a.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1.1rem' }}>Server summary state</h2>
      <p style={{ color: '#64748b', fontSize: 14 }}>
        <code>action=get_summary_state</code> — for this action the API uses{' '}
        <strong>session</strong> company_id (see summary_api.php).
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 12,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>process_id</span>
          <input
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            style={{ padding: '8px 10px', width: 120 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>process_code</span>
          <input
            value={processCode}
            onChange={(e) => setProcessCode(e.target.value)}
            style={{ padding: '8px 10px', width: 160 }}
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchSummaryState()}
          disabled={stateLoading}
          style={{
            padding: '10px 18px',
            fontWeight: 700,
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            background: '#f8fafc',
            cursor: stateLoading ? 'wait' : 'pointer',
          }}
        >
          {stateLoading ? 'Loading…' : 'Fetch state'}
        </button>
      </div>
      {stateError ? (
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{stateError}</p>
      ) : null}
      <pre
        style={{
          background: '#0f172a',
          color: '#e2e8f0',
          padding: 16,
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: 360,
          fontSize: 12,
        }}
      >
        {summaryState == null
          ? '(no state — click Fetch state or empty on server)'
          : JSON.stringify(summaryState, null, 2)}
      </pre>
    </div>
  )
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e2e8f0',
  fontSize: 12,
}
const td: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 13,
}
