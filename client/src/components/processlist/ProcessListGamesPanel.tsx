import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { GamesProcessRow, GamePermission } from '../../lib/processListTypes'
import { apiUrl } from '../../lib/api'
import {
  type AddProcessFormPayload,
  fetchAddProcessFormData,
  fetchGetProcess,
  fetchProcessList,
  postAddProcess,
  postDeleteProcesses,
  postToggleProcessStatus,
  postUpdateProcess,
} from '../../lib/processListApi'

const PAGE_SIZE = 20

type Props = {
  companyId: number
  /** Games / Loan / … 与 `processlist_api` GET `permission` 一致 */
  permission: GamePermission
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

function sortGamesRows(a: GamesProcessRow, b: GamesProcessRow): number {
  const aKey = String(a.process_name || '').toLowerCase()
  const bKey = String(b.process_name || '').toLowerCase()
  if (aKey < bKey) return -1
  if (aKey > bKey) return 1
  const ad = String(a.description || '').toLowerCase()
  const bd = String(b.description || '').toLowerCase()
  if (ad < bd) return -1
  if (ad > bd) return 1
  return 0
}

export function ProcessListGamesPanel({
  companyId,
  permission,
  onNotice,
}: Props) {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [rows, setRows] = useState<GamesProcessRow[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formMeta, setFormMeta] = useState<AddProcessFormPayload | null>(null)
  const [addMultiUse, setAddMultiUse] = useState(false)
  const [addProcessId, setAddProcessId] = useState('')
  const [addSelProc, setAddSelProc] = useState<string[]>([])
  const [addSelDesc, setAddSelDesc] = useState<string[]>([])
  const [addCurrency, setAddCurrency] = useState('')
  const [addDays, setAddDays] = useState<Record<number, boolean>>({})
  const [addRemove, setAddRemove] = useState('')
  const [addRepFrom, setAddRepFrom] = useState('')
  const [addRepTo, setAddRepTo] = useState('')
  const [addRemark, setAddRemark] = useState('')

  const [edProcName, setEdProcName] = useState('')
  const [edStatus, setEdStatus] = useState('active')
  const [edCurrency, setEdCurrency] = useState('')
  const [edDesc, setEdDesc] = useState<string[]>([])
  const [edRemove, setEdRemove] = useState('')
  const [edRepFrom, setEdRepFrom] = useState('')
  const [edRepTo, setEdRepTo] = useState('')
  const [edRemark, setEdRemark] = useState('')
  const [edDays, setEdDays] = useState<Record<number, boolean>>({})

  const [delSel, setDelSel] = useState<Record<number, boolean>>({})

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchProcessList(companyId, permission, {
        search,
        showInactive,
        showAll,
        showOfficial: false,
        showEInvoice: false,
        showBlock: false,
      })
      if (r.success) {
        const list = [...(r.data as GamesProcessRow[])].sort(sortGamesRows)
        setRows(list)
        setCurrentPage(1)
      } else {
        onNotice(r.error, 'err')
      }
    } finally {
      setLoading(false)
    }
  }, [companyId, permission, search, showInactive, showAll, onNotice])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useLayoutEffect(() => {
    if (showAll) {
      document.body.classList.add('process-page--show-all')
    } else {
      document.body.classList.remove('process-page--show-all')
    }
    return () => document.body.classList.remove('process-page--show-all')
  }, [showAll])

  useEffect(() => {
    if (showInactive) setShowAll(false)
  }, [showInactive])

  useEffect(() => {
    if (showAll) setShowInactive(false)
  }, [showAll])

  const displayRows = useMemo(() => {
    if (showAll) return rows.filter((p) => p.status === 'active')
    return rows
  }, [rows, showAll])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const pageItems = useMemo(() => {
    if (showAll) return displayRows
    const s = (page - 1) * PAGE_SIZE
    return displayRows.slice(s, s + PAGE_SIZE)
  }, [displayRows, page, showAll])

  const startIndex = showAll ? 0 : (page - 1) * PAGE_SIZE

  const openAdd = async () => {
    setAddMultiUse(false)
    setAddProcessId('')
    setAddSelProc([])
    setAddSelDesc([])
    setAddCurrency('')
    setAddDays({})
    setAddRemove('')
    setAddRepFrom('')
    setAddRepTo('')
    setAddRemark('')
    const r = await fetchAddProcessFormData(companyId)
    if (r.success) {
      setFormMeta(r.data)
      setAddOpen(true)
    } else onNotice(r.error, 'err')
  }

  const uniqueProcessNames = useMemo(() => {
    if (!formMeta) return [] as string[]
    const s = new Set<string>()
    formMeta.processes.forEach((p) => {
      if (p.process_name) s.add(p.process_name)
    })
    return Array.from(s).sort()
  }, [formMeta])

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formMeta) return
    if (addMultiUse) {
      if (addSelProc.length === 0) {
        onNotice('Please select at least one process for Multi-use', 'err')
        return
      }
    } else if (!addProcessId.trim()) {
      onNotice('Please enter Process ID', 'err')
      return
    }
    if (addSelDesc.length === 0) {
      onNotice('Please select at least one description', 'err')
      return
    }
    if (!addCurrency) {
      onNotice('Please select currency', 'err')
      return
    }
    const dayIds = formMeta.days
      .filter((d) => addDays[d.id])
      .map((d) => String(d.id))
    const fd = new FormData()
    if (addMultiUse) {
      fd.append('selected_processes', JSON.stringify(addSelProc))
    } else {
      fd.append('process_id', addProcessId.trim())
    }
    fd.append('selected_descriptions', JSON.stringify(addSelDesc))
    fd.append('currency_id', addCurrency)
    fd.append('day_use', dayIds.join(','))
    fd.append('remove_word', addRemove)
    fd.append('replace_word_from', addRepFrom)
    fd.append('replace_word_to', addRepTo)
    fd.append('remark', addRemark)
    const res = await postAddProcess(fd)
    if (res.success) {
      onNotice('Process added', 'ok')
      setAddOpen(false)
      void loadList()
    } else onNotice(res.error, 'err')
  }

  const openEdit = async (id: number) => {
    const rMeta = await fetchAddProcessFormData(companyId)
    if (!rMeta.success) {
      onNotice(rMeta.error, 'err')
      return
    }
    setFormMeta(rMeta.data)
    const g = await fetchGetProcess(id, '')
    if (!g.success || !g.data) {
      onNotice('Failed to load process', 'err')
      return
    }
    const p = g.data
    setEditId(id)
    setEdProcName(String(p.process_name || p.process_id || ''))
    setEdStatus(String(p.status || 'active'))
    setEdCurrency(p.currency_id != null ? String(p.currency_id) : '')
    const dnames: string[] = Array.isArray(p.description_names)
      ? p.description_names.map((x) => String(x))
      : p.description_name
        ? [String(p.description_name)]
        : []
    setEdDesc(dnames)
    setEdRemove(String(p.remove_word || ''))
    const rw = String(p.replace_word || '')
    const [from, to] = rw.split(' == ')
    setEdRepFrom((from || '').trim())
    setEdRepTo((to || '').trim())
    let remark = String(p.remarks || '')
    try {
      const meta = JSON.parse(remark) as { user_remarks?: string }
      if (meta && meta.user_remarks != null) remark = String(meta.user_remarks)
    } catch {
      /* plain text */
    }
    setEdRemark(remark)
    const dayMap: Record<number, boolean> = {}
    if (p.day_use) {
      String(p.day_use)
        .split(',')
        .forEach((x) => {
          const n = parseInt(x.trim(), 10)
          if (Number.isFinite(n)) dayMap[n] = true
        })
    }
    setEdDays(dayMap)
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editId == null) return
    const dayIds = (formMeta?.days || [])
      .filter((d) => edDays[d.id])
      .map((d) => String(d.id))
    const fd = new FormData()
    fd.append('id', String(editId))
    fd.append('process_name', edProcName.trim())
    fd.append('currency_id', edCurrency)
    fd.append('remove_word', edRemove)
    fd.append('replace_word_from', edRepFrom)
    fd.append('replace_word_to', edRepTo)
    fd.append('remark', edRemark)
    fd.append('status', edStatus)
    fd.append('day_use', dayIds.join(','))
    fd.append('selected_descriptions', JSON.stringify(edDesc.length ? [edDesc[0]] : []))
    const r = await postUpdateProcess(fd)
    if (r.success) {
      onNotice('Updated', 'ok')
      setEditId(null)
      void loadList()
    } else onNotice(r.error, 'err')
  }

  const onToggle = async (id: number) => {
    const r = await postToggleProcessStatus(id, 'Games')
    if (r.success) {
      onNotice('Status updated', 'ok')
      void loadList()
    } else onNotice(r.error, 'err')
  }

  const toDelete = Object.entries(delSel)
    .filter(([, v]) => v)
    .map(([k]) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))

  const doDelete = async () => {
    if (toDelete.length === 0) {
      onNotice('Select processes to delete', 'err')
      return
    }
    if (!window.confirm(`Delete ${toDelete.length} process(es)?`)) return
    const r = await postDeleteProcesses(toDelete, 'Games')
    if (r.success) {
      onNotice('Deleted', 'ok')
      setDelSel({})
      void loadList()
    } else onNotice(r.error, 'err')
  }

  const toggleSelectAllGames = (checked: boolean) => {
    setDelSel((prev) => {
      const next = { ...prev }
      pageItems.forEach((p) => {
        if (p.status !== 'active' && !p.has_transactions) {
          next[p.id] = checked
        }
      })
      return next
    })
  }

  return (
    <>
      <div className="action-buttons-container">
        <div className="action-buttons">
          <div
            className="action-controls-row"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <button type="button" className="btn btn-add" onClick={() => void openAdd()}>
              Add Process
            </button>
            <div className="search-container" style={{ position: 'relative' }}>
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                id="searchInput"
                className="search-input"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
              />
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showAllGames"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              <label htmlFor="showAllGames">Show All</label>
            </div>
            <div className="checkbox-section">
              <input
                type="checkbox"
                id="showInactiveGames"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <label htmlFor="showInactiveGames">Show Inactive</label>
            </div>
            <a className="plClassicLink" href={apiUrl('/processlist_classic.php')} style={{ fontSize: 14 }}>
              经典版
            </a>
            {loading ? (
              <span style={{ color: '#64748b', fontSize: 13 }}>Loading…</span>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-delete"
            id="processDeleteSelectedBtn"
            onClick={() => void doDelete()}
            disabled={!toDelete.length}
            title="Only inactive processes can be deleted"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="process-table-wrapper" id="processTableWrapper">
        <div className="table-header" id="tableHeader">
          <div className="header-item gambling-header">No</div>
          <div className="header-item gambling-header">Process ID</div>
          <div className="header-item gambling-header">Description</div>
          <div className="header-item gambling-header">Status</div>
          <div className="header-item gambling-header">Currency</div>
          <div className="header-item gambling-header">Day Use</div>
          <div className="header-item gambling-header">
            Action
            <input
              type="checkbox"
              id="selectAllProcesses"
              title="Select all"
              style={{ marginLeft: 10, cursor: 'pointer' }}
              onChange={(e) => toggleSelectAllGames(e.target.checked)}
            />
          </div>
        </div>

        <div className="process-cards" id="processTableBody">
          {displayRows.length === 0 && !loading ? (
            <div className="process-card">
              <div className="card-item" style={{ gridColumn: '1 / -1' }}>
                No process data found
              </div>
            </div>
          ) : null}
          {pageItems.map((process, idx) => (
            <div key={process.id} className="process-card" data-id={process.id}>
              <div className="card-item">{startIndex + idx + 1}</div>
              <div className="card-item">{(process.process_name || '').toUpperCase()}</div>
              <div className="card-item">{(process.description || '').toUpperCase()}</div>
              <div className="card-item" style={{ justifyContent: 'center' }}>
                <span
                  className={
                    'role-badge ' +
                    (process.status === 'active' ? 'status-active' : 'status-inactive') +
                    ' status-clickable'
                  }
                  onClick={() => void onToggle(process.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') void onToggle(process.id)
                  }}
                  role="button"
                  tabIndex={0}
                  title="Click to toggle status"
                >
                  {(process.status || '').toUpperCase()}
                </span>
              </div>
              <div className="card-item">{process.currency || ''}</div>
              <div className="card-item">{process.day_use || ''}</div>
              <div className="card-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="edit-btn"
                  onClick={() => void openEdit(process.id)}
                  title="Edit"
                  aria-label="Edit"
                >
                  <img src={apiUrl('/images/edit.svg')} alt="" width={16} height={16} />
                </button>
                {process.status === 'active' || process.has_transactions ? null : (
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    data-id={String(process.id)}
                    checked={!!delSel[process.id]}
                    onChange={(e) =>
                      setDelSel((prev) => ({ ...prev, [process.id]: e.target.checked }))
                    }
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!showAll && displayRows.length > 0 ? (
        <div className="pagination-container" id="paginationContainer">
          <button
            type="button"
            className="pagination-btn"
            id="prevBtn"
            disabled={page <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Previous"
          >
            ◀
          </button>
          <span className="pagination-info" id="paginationInfo">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="pagination-btn"
            id="nextBtn"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next"
          >
            ▶
          </button>
        </div>
      ) : null}

      {addOpen && formMeta ? (
        <div className="plModalHost">
          <div
            className="plModalBackdrop"
            onClick={() => setAddOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setAddOpen(false)}
            role="presentation"
          />
          <div className="plModal">
            <h3 className="plModal__title">Add Process</h3>
            <form onSubmit={(e) => void submitAdd(e)} className="plModalForm">
              <label className="plCheck">
                <input
                  type="checkbox"
                  checked={addMultiUse}
                  onChange={(e) => setAddMultiUse(e.target.checked)}
                />{' '}
                Multi-use
              </label>
              {addMultiUse ? (
                <div className="plField">
                  <div className="plField__label">Processes</div>
                  <div className="plCheckGrid">
                    {uniqueProcessNames.map((name) => (
                      <label key={name} className="plCheck">
                        <input
                          type="checkbox"
                          checked={addSelProc.includes(name)}
                          onChange={(e) => {
                            if (e.target.checked)
                              setAddSelProc((s) => [...s, name])
                            else setAddSelProc((s) => s.filter((x) => x !== name))
                          }}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <label className="plField">
                  <span className="plField__label">Process ID</span>
                  <input
                    className="plInput"
                    value={addProcessId}
                    onChange={(e) => setAddProcessId(e.target.value)}
                  />
                </label>
              )}
              <div className="plField">
                <div className="plField__label">Descriptions</div>
                <div className="plCheckGrid">
                  {formMeta.descriptions.map((d) => (
                    <label key={d.id} className="plCheck">
                      <input
                        type="checkbox"
                        checked={addSelDesc.includes(d.name)}
                        onChange={(e) => {
                          if (e.target.checked)
                            setAddSelDesc((s) => [...s, d.name])
                          else setAddSelDesc((s) => s.filter((x) => x !== d.name))
                        }}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="plField">
                <span className="plField__label">Currency</span>
                <select
                  className="plInput"
                  value={addCurrency}
                  onChange={(e) => setAddCurrency(e.target.value)}
                >
                  <option value="">—</option>
                  {formMeta.currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <div className="plField">
                <div className="plField__label">Days</div>
                <div className="plCheckGrid">
                  {formMeta.days.map((d) => (
                    <label key={d.id} className="plCheck">
                      <input
                        type="checkbox"
                        checked={!!addDays[d.id]}
                        onChange={(e) =>
                          setAddDays((prev) => ({ ...prev, [d.id]: e.target.checked }))
                        }
                      />
                      {d.day_name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="plField">
                <span className="plField__label">Remove word</span>
                <input
                  className="plInput"
                  value={addRemove}
                  onChange={(e) => setAddRemove(e.target.value)}
                />
              </label>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Replace from</span>
                  <input
                    className="plInput"
                    value={addRepFrom}
                    onChange={(e) => setAddRepFrom(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Replace to</span>
                  <input
                    className="plInput"
                    value={addRepTo}
                    onChange={(e) => setAddRepTo(e.target.value)}
                  />
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">Remark</span>
                <textarea
                  className="plInput plInput--ta"
                  value={addRemark}
                  onChange={(e) => setAddRemark(e.target.value)}
                  rows={2}
                />
              </label>
              <div className="plModal__actions">
                <button type="button" className="plBtn" onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="plBtn plBtn--primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editId != null && formMeta ? (
        <div className="plModalHost">
          <div
            className="plModalBackdrop"
            onClick={() => setEditId(null)}
            onKeyDown={(e) => e.key === 'Escape' && setEditId(null)}
            role="presentation"
          />
          <div className="plModal plModal--wide">
            <h3 className="plModal__title">Edit Process</h3>
            <form onSubmit={(e) => void submitEdit(e)} className="plModalForm">
              <label className="plField">
                <span className="plField__label">Process name</span>
                <input
                  className="plInput"
                  value={edProcName}
                  onChange={(e) => setEdProcName(e.target.value)}
                />
              </label>
              <label className="plField">
                <span className="plField__label">Status</span>
                <select
                  className="plInput"
                  value={edStatus}
                  onChange={(e) => setEdStatus(e.target.value)}
                >
                  <option value="active">ACTIVE</option>
                  <option value="inactive">INACTIVE</option>
                </select>
              </label>
              <div className="plField">
                <div className="plField__label">Description (first is saved)</div>
                <div className="plCheckGrid">
                  {formMeta.descriptions.map((d) => (
                    <label key={d.id} className="plCheck">
                      <input
                        type="checkbox"
                        checked={edDesc.includes(d.name)}
                        onChange={() => {
                          setEdDesc((prev) => {
                            if (prev.includes(d.name))
                              return prev.filter((x) => x !== d.name)
                            return [...prev, d.name]
                          })
                        }}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="plField">
                <span className="plField__label">Currency</span>
                <select
                  className="plInput"
                  value={edCurrency}
                  onChange={(e) => setEdCurrency(e.target.value)}
                >
                  <option value="">—</option>
                  {formMeta.currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <div className="plField">
                <div className="plField__label">Days</div>
                <div className="plCheckGrid">
                  {formMeta.days.map((d) => (
                    <label key={d.id} className="plCheck">
                      <input
                        type="checkbox"
                        checked={!!edDays[d.id]}
                        onChange={(e) =>
                          setEdDays((prev) => ({ ...prev, [d.id]: e.target.checked }))
                        }
                      />
                      {d.day_name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="plField">
                <span className="plField__label">Remove word</span>
                <input
                  className="plInput"
                  value={edRemove}
                  onChange={(e) => setEdRemove(e.target.value)}
                />
              </label>
              <div className="plRow2">
                <label className="plField">
                  <span className="plField__label">Replace from</span>
                  <input
                    className="plInput"
                    value={edRepFrom}
                    onChange={(e) => setEdRepFrom(e.target.value)}
                  />
                </label>
                <label className="plField">
                  <span className="plField__label">Replace to</span>
                  <input
                    className="plInput"
                    value={edRepTo}
                    onChange={(e) => setEdRepTo(e.target.value)}
                  />
                </label>
              </div>
              <label className="plField">
                <span className="plField__label">Remark</span>
                <textarea
                  className="plInput plInput--ta"
                  value={edRemark}
                  onChange={(e) => setEdRemark(e.target.value)}
                  rows={2}
                />
              </label>
              <div className="plModal__actions">
                <button type="button" className="plBtn" onClick={() => setEditId(null)}>
                  Cancel
                </button>
                <button type="submit" className="plBtn plBtn--primary">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
