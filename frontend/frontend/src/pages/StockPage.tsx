/**
 * There is no `stock.php` in this repo. This page implements the closest matching
 * CRUD pattern: C168 maintenance marquee admin (the Maintenance tab on `announcement.php`)
 * — list in a table-style layout, create via POST, edit/delete via existing APIs.
 *
 * Similar list+form PHP pages you may convert next: `domain.php`, `account-list.php`,
 * `userlist.php`, `formula_maintenance.php`.
 */
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { http } from '@/services/http'
import '../../../../css/accountCSS.css'
import '../../../../css/announcement.css'

type MaintenanceRow = {
  id: number
  content: string
  status: string
  created_at: string
  created_by: string
}

type ListResponse = {
  success: boolean
  message: string
  data: MaintenanceRow[]
}

type MutationResponse = {
  success: boolean
  message: string
  data?: { id?: number }
}

export function StockPage() {
  const [rows, setRows] = useState<MaintenanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const { data } = await http.get<ListResponse>('/maintenance/list_api.php')
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data)
      } else {
        setRows([])
        setLoadError(data.message || 'Failed to load list')
      }
    } catch (e) {
      setRows([])
      setLoadError(e instanceof Error ? e.message : 'Failed to load list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.body.classList.add('announcement-page')
    void refresh()
    return () => document.body.classList.remove('announcement-page')
  }, [refresh])

  const hasExisting = rows.length > 0

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    const content = newContent.trim()
    if (!content) {
      setNotice({ type: 'error', text: 'Please fill in the content' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('content', content)
      const { data } = await http.post<MutationResponse>(
        '/maintenance/create_api.php',
        fd,
      )
      if (data.success) {
        setNotice({ type: 'success', text: 'Maintenance content published successfully' })
        setNewContent('')
        await refresh()
      } else {
        setNotice({ type: 'error', text: data.message || 'Publish failed' })
      }
    } catch (e) {
      setNotice({
        type: 'error',
        text: e instanceof Error ? e.message : 'Publish failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (id: number) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this maintenance content? This action cannot be undone.',
      )
    ) {
      return
    }
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('id', String(id))
      const { data } = await http.post<MutationResponse>(
        '/maintenance/delete_api.php',
        fd,
      )
      if (data.success) {
        setNotice({ type: 'success', text: 'Maintenance content deleted successfully' })
        await refresh()
      } else {
        setNotice({ type: 'error', text: data.message || 'Delete failed' })
      }
    } catch (e) {
      setNotice({
        type: 'error',
        text: e instanceof Error ? e.message : 'Delete failed',
      })
    }
  }

  const openEdit = (row: MaintenanceRow) => {
    setEditId(row.id)
    setEditContent(row.content)
    setEditOpen(true)
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditId(null)
    setEditContent('')
  }

  const onEditSave = async (e: FormEvent) => {
    e.preventDefault()
    if (editId == null) return
    const content = editContent.trim()
    if (!content) {
      setNotice({ type: 'error', text: 'Please fill in the content' })
      return
    }
    setEditSaving(true)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('id', String(editId))
      fd.append('content', content)
      const { data } = await http.post<MutationResponse>(
        '/maintenance/update_api.php',
        fd,
      )
      if (data.success) {
        setNotice({ type: 'success', text: 'Maintenance content updated successfully' })
        closeEdit()
        await refresh()
      } else {
        setNotice({ type: 'error', text: data.message || 'Update failed' })
      }
    } catch (e) {
      setNotice({
        type: 'error',
        text: e instanceof Error ? e.message : 'Update failed',
      })
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="announcement-page-container container">
      <div className="page-header">
        <h1>Maintenance content (C168)</h1>
      </div>

      <div className="separator-line" />

      {notice ? (
        <p
          style={{
            margin: '12px 0',
            padding: '10px 14px',
            borderRadius: 8,
            fontWeight: 600,
            background: notice.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {notice.text}
        </p>
      ) : null}

      {loadError ? (
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{loadError}</p>
      ) : null}

      <div className="maintenance-layout">
        <div className="maintenance-form-section">
          <h2
            style={{
              marginTop: 0,
              color: '#002C49',
              fontFamily: 'Amaranth, sans-serif',
              fontSize: 'clamp(16px, 1.25vw, 24px)',
              marginBottom: 'clamp(8px, 0.73vw, 14px)',
            }}
          >
            Create new maintenance content
          </h2>
          {hasExisting ? (
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                color: '#92400e',
                fontSize: 'clamp(11px, 0.73vw, 14px)',
              }}
            >
              <strong>Notice:</strong> Maintenance content already exists. Please delete
              the existing content before creating a new one.
            </div>
          ) : null}
          <form id="maintenanceForm" onSubmit={onCreate}>
            <div className="form-group">
              <label htmlFor="maintenanceContent">Content *</label>
              <textarea
                id="maintenanceContent"
                name="content"
                required
                placeholder="Enter maintenance content"
                value={newContent}
                disabled={hasExisting || loading}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="submit-btn"
              disabled={hasExisting || loading || saving}
              style={
                hasExisting
                  ? { opacity: 0.5, cursor: 'not-allowed' }
                  : undefined
              }
            >
              {saving ? 'Publishing…' : 'Publish maintenance content'}
            </button>
          </form>
        </div>

        <div className="maintenance-list-section">
          <div className="maintenance-list-header">
            <h2>Published maintenance content</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ fontWeight: 600 }}>Loading…</p>
            ) : rows.length === 0 ? (
              <div className="empty-state">
                <p>No maintenance content</p>
              </div>
            ) : (
              rows.map((maintenance) => (
                <div key={maintenance.id} className="maintenance-item">
                  <div className="maintenance-item-header">
                    <div style={{ flex: 1 }} />
                    <div>
                      <button
                        type="button"
                        className="maintenance-edit-btn"
                        onClick={() => openEdit(maintenance)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="maintenance-delete-btn"
                        onClick={() => void onDelete(maintenance.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="maintenance-content">{maintenance.content}</div>
                  <div className="announcement-meta">
                    <span>Created by: {maintenance.created_by}</span>
                    <span>Created at: {maintenance.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {editOpen ? (
        <div
          className="edit-modal"
          style={{ display: 'block' }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEdit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeEdit()
          }}
        >
          <div className="edit-modal-content">
            <div className="edit-modal-header">
              <h2>Edit maintenance content</h2>
              <button
                type="button"
                className="edit-modal-close"
                aria-label="Close"
                onClick={closeEdit}
              >
                &times;
              </button>
            </div>
            <form id="editMaintenanceForm" onSubmit={onEditSave}>
              <input type="hidden" name="id" value={editId ?? ''} readOnly />
              <div className="form-group">
                <label htmlFor="editMaintenanceContent">Content *</label>
                <textarea
                  id="editMaintenanceContent"
                  name="content"
                  required
                  placeholder="Enter maintenance content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              </div>
              <div className="edit-modal-actions">
                <button
                  type="button"
                  className="edit-modal-btn edit-modal-btn-cancel"
                  onClick={closeEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="edit-modal-btn edit-modal-btn-save"
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
