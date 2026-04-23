import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/services/http'

type CaptureRow = {
  no: number
  capture_id: number
  process: string
  process_id?: string | null
  dts_created: string
  product: string
  currency: string
  currency_id?: number | null
  wl_group: string
  submitted_by: string
  is_deleted?: number | boolean | string
  deleted_by?: string | null
  dts_deleted?: string | null
}

function rowIsDeleted(row: CaptureRow): boolean {
  const v = row.is_deleted
  return v === 1 || v === true || v === '1'
}

type SearchResponse = {
  success: boolean
  message: string
  data: CaptureRow[]
}

type DeleteResponse = {
  success: boolean
  message: string
  data?: { deleted?: number }
}

function todayDMY(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function CaptureMaintenancePage() {
  const [searchParams] = useSearchParams()
  const companyFromUrl = searchParams.get('company_id')

  const [dateFrom, setDateFrom] = useState(todayDMY)
  const [dateTo, setDateTo] = useState(todayDMY)
  const [processFilter, setProcessFilter] = useState('')
  const [companyId, setCompanyId] = useState(companyFromUrl ?? '')

  const [rows, setRows] = useState<CaptureRow[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  )

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectableRows = useMemo(
    () => rows.filter((r) => !rowIsDeleted(r)),
    [rows],
  )

  const runSearch = useCallback(async () => {
    if (!dateFrom.trim() || !dateTo.trim()) {
      setNotice({ kind: 'err', text: 'Please set date from / to (dd/mm/yyyy)' })
      return
    }
    setNotice(null)
    setLoading(true)
    setSelected(new Set())
    try {
      const params: Record<string, string> = {
        date_from: dateFrom.trim(),
        date_to: dateTo.trim(),
      }
      if (processFilter.trim()) params.process = processFilter.trim()
      if (companyId.trim()) params.company_id = companyId.trim()

      const { data } = await http.get<SearchResponse>(
        '/capture_maintenance/search_api.php',
        { params },
      )
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data)
        setNotice({
          kind: 'ok',
          text:
            data.data.length === 0
              ? 'No data found'
              : `Found ${data.data.length} record(s)`,
        })
      } else {
        setRows([])
        setNotice({ kind: 'err', text: data.message || 'Search failed' })
      }
    } catch (e) {
      setRows([])
      setNotice({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Search failed',
      })
    } finally {
      setLoading(false)
    }
  }, [companyId, dateFrom, dateTo, processFilter])

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const ids = selectableRows.map((r) => r.capture_id)
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id))
    if (allOn) setSelected(new Set())
    else setSelected(new Set(ids))
  }

  const onDelete = async () => {
    if (!confirmDelete) {
      setNotice({ kind: 'err', text: 'Confirm deletion with the checkbox below' })
      return
    }
    const items = Array.from(selected)
      .map((capture_id) => ({ capture_id }))
      .filter((x) => x.capture_id > 0)
    if (items.length === 0) {
      setNotice({ kind: 'err', text: 'Select at least one row' })
      return
    }
    if (
      !window.confirm(
        `Delete ${items.length} record(s)? This cannot be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setNotice(null)
    try {
      const { data } = await http.post<DeleteResponse>(
        '/capture_maintenance/delete_api.php',
        {
          date_from: dateFrom.trim(),
          date_to: dateTo.trim(),
          items,
        },
      )
      if (data.success) {
        setNotice({ kind: 'ok', text: data.message || 'Deleted' })
        setSelected(new Set())
        await runSearch()
      } else {
        setNotice({ kind: 'err', text: data.message || 'Delete failed' })
      }
    } catch (e) {
      setNotice({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Delete failed',
      })
    } finally {
      setDeleting(false)
    }
  }

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.capture_id))

  return (
    <div
      style={{
        padding: '1rem 1.5rem 2rem',
        maxWidth: 1400,
        margin: '0 auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        Maintenance — Data Capture (React)
      </h1>
      <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Search and delete use JSON/XHR (no full page submit). Owner users can pass{' '}
        <code>?company_id=</code> or set Company ID below.
      </p>

      {notice ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: notice.kind === 'ok' ? '#dcfce7' : '#fee2e2',
            color: notice.kind === 'ok' ? '#166534' : '#991b1b',
            fontWeight: 600,
          }}
        >
          {notice.text}
        </div>
      ) : null}

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
          <span style={{ fontSize: 12, fontWeight: 600 }}>Date from</span>
          <input
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="dd/mm/yyyy"
            style={{ padding: '8px 10px', minWidth: 120 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Date to</span>
          <input
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="dd/mm/yyyy"
            style={{ padding: '8px 10px', minWidth: 120 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Process (optional)</span>
          <input
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
            placeholder="process numeric id or code"
            style={{ padding: '8px 10px', minWidth: 200 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Company ID (optional)</span>
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="session default if empty"
            style={{ padding: '8px 10px', minWidth: 100 }}
          />
        </label>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontWeight: 700,
            background: 'linear-gradient(180deg, #63c4ff, #0d60ff)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.checked)}
          />
          <span>I confirm delete</span>
        </label>
        <button
          type="button"
          disabled={
            deleting || !confirmDelete || selected.size === 0 || loading
          }
          onClick={() => void onDelete()}
          style={{
            padding: '8px 16px',
            fontWeight: 700,
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor:
              deleting || !confirmDelete || selected.size === 0
                ? 'not-allowed'
                : 'pointer',
            opacity: deleting || !confirmDelete || selected.size === 0 ? 0.5 : 1,
          }}
        >
          {deleting ? 'Deleting…' : 'Delete selected'}
        </button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: 10, width: 44 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableRows.length === 0}
                  aria-label="Select all"
                />
              </th>
              <th style={{ padding: 10 }}>No</th>
              <th style={{ padding: 10 }}>Created</th>
              <th style={{ padding: 10 }}>Product</th>
              <th style={{ padding: 10 }}>Process</th>
              <th style={{ padding: 10 }}>CCY</th>
              <th style={{ padding: 10 }}>WL Group</th>
              <th style={{ padding: 10 }}>Submitted by</th>
              <th style={{ padding: 10 }}>Deleted</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center' }}>
                  No rows — run search
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isDel = rowIsDeleted(row)
                const delText =
                  isDel &&
                  (row.deleted_by
                    ? `${row.deleted_by} (${row.dts_deleted ?? '-'})`
                    : row.dts_deleted ?? '-')
                return (
                  <tr
                    key={`${row.capture_id}-${row.no}`}
                    style={{
                      background: isDel ? '#fef2f2' : undefined,
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.capture_id)}
                        disabled={isDel}
                        onChange={() => toggleRow(row.capture_id)}
                      />
                    </td>
                    <td style={{ padding: 10 }}>{row.no}</td>
                    <td style={{ padding: 10 }}>{row.dts_created || '—'}</td>
                    <td style={{ padding: 10 }}>{row.product || '—'}</td>
                    <td style={{ padding: 10 }}>{row.process || '—'}</td>
                    <td style={{ padding: 10 }}>{row.currency || '—'}</td>
                    <td style={{ padding: 10 }}>{row.wl_group || '—'}</td>
                    <td style={{ padding: 10 }}>{row.submitted_by || '—'}</td>
                    <td style={{ padding: 10 }}>{isDel ? delText : '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
