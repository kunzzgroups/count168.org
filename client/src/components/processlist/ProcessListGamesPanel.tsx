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
  const [addAllDay, setAddAllDay] = useState(false)

  const [edProcName, setEdProcName] = useState('')
  const [edStatus, setEdStatus] = useState('active')
  const [edCurrency, setEdCurrency] = useState('')
  const [edDesc, setEdDesc] = useState<string[]>([])
  const [edRemove, setEdRemove] = useState('')
  const [edRepFrom, setEdRepFrom] = useState('')
  const [edRepTo, setEdRepTo] = useState('')
  const [edRemark, setEdRemark] = useState('')
  const [edDays, setEdDays] = useState<Record<number, boolean>>({})
  const [edAllDay, setEdAllDay] = useState(false)
  const [edDtsModified, setEdDtsModified] = useState('')
  const [edDtsCreated, setEdDtsCreated] = useState('')
  const [edModifiedBy, setEdModifiedBy] = useState('')
  const [edCreatedBy, setEdCreatedBy] = useState('')

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (addOpen) setAddOpen(false)
      if (editId != null) setEditId(null)
    }
    if (addOpen || editId != null) {
      window.addEventListener('keydown', onKey)
    }
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, editId])

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
    setAddAllDay(false)
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
    setEdDtsModified(p.dts_modified != null ? String(p.dts_modified) : '')
    setEdDtsCreated(p.dts_created != null ? String(p.dts_created) : '')
    setEdModifiedBy(p.modified_by != null ? String(p.modified_by) : '')
    setEdCreatedBy(p.created_by != null ? String(p.created_by) : '')
    const allDayPick =
      rMeta.data.days.length > 0 && rMeta.data.days.every((d) => dayMap[d.id])
    setEdAllDay(!!allDayPick)
  }

  useEffect(() => {
    if (!formMeta || !addOpen) return
    const all = formMeta.days.length > 0 && formMeta.days.every((d) => addDays[d.id])
    setAddAllDay(all)
  }, [addDays, formMeta, addOpen])

  useEffect(() => {
    if (!formMeta || editId == null) return
    const all = formMeta.days.length > 0 && formMeta.days.every((d) => edDays[d.id])
    setEdAllDay(all)
  }, [edDays, formMeta, editId])

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
        <div
          id="addModal"
          className="modal"
          style={{ display: 'block' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="addModalTitle"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h2 id="addModalTitle">Add Process</h2>
              <button
                type="button"
                className="close"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form
                id="addProcessForm"
                onSubmit={(e) => void submitAdd(e)}
                className="process-form add-grid"
              >
                <div className="add-col">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="add_process_id">Process ID *</label>
                      <div className="input-with-checkbox">
                        <input
                          type="text"
                          id="add_process_id"
                          name="process_id"
                          placeholder="Enter Process ID"
                          value={addProcessId}
                          onChange={(e) => setAddProcessId(e.target.value)}
                          disabled={addMultiUse}
                        />
                        <div className="checkbox-container">
                          <input
                            type="checkbox"
                            id="add_multi_use"
                            name="multi_use_purpose"
                            checked={addMultiUse}
                            onChange={(e) => setAddMultiUse(e.target.checked)}
                          />
                          <label htmlFor="add_multi_use">Multi-Process</label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {addMultiUse ? (
                    <div
                      className="form-row"
                      id="multi_use_processes"
                      style={{ display: addMultiUse ? 'block' : 'none' }}
                    >
                      <div className="form-group">
                        <label>Select Multi-use Processes</label>
                        <div className="process-checkboxes" id="process_checkboxes">
                          {uniqueProcessNames.map((name) => (
                            <div key={name} className="checkbox-item">
                              <input
                                type="checkbox"
                                id={`add_proc_${name}`}
                                name="selected_processes[]"
                                checked={addSelProc.includes(name)}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setAddSelProc((s) => [...s, name])
                                  else setAddSelProc((s) => s.filter((x) => x !== name))
                                }}
                              />
                              <label htmlFor={`add_proc_${name}`}>{name}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="form-row">
                    <div className="form-group">
                      <label>Description *</label>
                      <div className="plGamesFormScroll" id="add_description_list">
                        {formMeta.descriptions.map((d) => (
                          <div key={d.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              id={`add_desc_${d.id}`}
                              checked={addSelDesc.includes(d.name)}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setAddSelDesc((s) => [...s, d.name])
                                else setAddSelDesc((s) => s.filter((x) => x !== d.name))
                              }}
                            />
                            <label htmlFor={`add_desc_${d.id}`}>{d.name}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="add_currency">Currency</label>
                      <select
                        id="add_currency"
                        name="currency_id"
                        value={addCurrency}
                        onChange={(e) => setAddCurrency(e.target.value)}
                      >
                        <option value="">Select Currency</option>
                        {formMeta.currencies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="add-col">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="add_remove_words">Remove Words</label>
                      <input
                        type="text"
                        id="add_remove_words"
                        name="remove_word"
                        placeholder="Enter words to remove"
                        value={addRemove}
                        onChange={(e) => setAddRemove(e.target.value)}
                      />
                      <small className="field-help">
                        (Use semicolon to separate multiple words, e.g. abc;cde;efg)
                      </small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <div className="day-use-header">
                        <label>Day Use</label>
                        <div className="all-day-checkbox">
                          <input
                            type="checkbox"
                            id="add_all_day"
                            name="all_day"
                            checked={addAllDay}
                            onChange={(e) => {
                              const v = e.target.checked
                              setAddAllDay(v)
                              if (!formMeta) return
                              setAddDays((prev) => {
                                const next = { ...prev }
                                formMeta.days.forEach((d) => {
                                  next[d.id] = v
                                })
                                return next
                              })
                            }}
                          />
                          <label htmlFor="add_all_day">All Day</label>
                        </div>
                      </div>
                      <div className="day-checkboxes" id="day_checkboxes">
                        {formMeta.days.map((d) => (
                          <div key={d.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              id={`add_day_${d.id}`}
                              name="day_use[]"
                              value={d.id}
                              checked={!!addDays[d.id]}
                              onChange={(e) =>
                                setAddDays((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.checked,
                                }))
                              }
                            />
                            <label htmlFor={`add_day_${d.id}`}>{d.day_name}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-row row-two-cols">
                    <div className="form-group">
                      <label htmlFor="add_replace_word_from">Replace From</label>
                      <input
                        type="text"
                        id="add_replace_word_from"
                        name="replace_word_from"
                        placeholder="Old word"
                        value={addRepFrom}
                        onChange={(e) => setAddRepFrom(e.target.value)}
                      />
                      <small className="field-help">(Word to be replaced)</small>
                    </div>
                    <div className="form-group">
                      <label htmlFor="add_replace_word_to">Replace To</label>
                      <input
                        type="text"
                        id="add_replace_word_to"
                        name="replace_word_to"
                        placeholder="New word"
                        value={addRepTo}
                        onChange={(e) => setAddRepTo(e.target.value)}
                      />
                      <small className="field-help">(Replacement word)</small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="add_remarks">Remarks</label>
                      <textarea
                        id="add_remarks"
                        name="remark"
                        rows={5}
                        placeholder="Enter remarks..."
                        value={addRemark}
                        onChange={(e) => setAddRemark(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-actions add-actions">
                  <button type="submit" className="btn btn-save">
                    Add Process
                  </button>
                  <button
                    type="button"
                    className="btn btn-cancel"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {editId != null && formMeta ? (
        <div
          id="editModal"
          className="modal"
          style={{ display: 'block' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="editModalTitle"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h2 id="editModalTitle">Edit Process</h2>
              <button
                type="button"
                className="close"
                onClick={() => setEditId(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form
                id="editProcessForm"
                onSubmit={(e) => void submitEdit(e)}
                className="process-form add-grid"
              >
                <input type="hidden" name="id" value={editId} />
                <input type="hidden" name="status" value={edStatus} />

                <div className="add-col">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit_process_name">Process Name *</label>
                      <input
                        type="text"
                        id="edit_process_name"
                        name="process_name"
                        value={edProcName}
                        readOnly
                        style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Description</label>
                      <div className="plGamesFormScroll" id="edit_description_list">
                        {formMeta.descriptions.map((d) => (
                          <div key={d.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              id={`edit_desc_${d.id}`}
                              checked={edDesc.includes(d.name)}
                              onChange={() => {
                                setEdDesc((prev) => {
                                  if (prev.includes(d.name))
                                    return prev.filter((x) => x !== d.name)
                                  return [...prev, d.name]
                                })
                              }}
                            />
                            <label htmlFor={`edit_desc_${d.id}`}>{d.name}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit_currency">Currency</label>
                      <select
                        id="edit_currency"
                        name="currency_id"
                        value={edCurrency}
                        onChange={(e) => setEdCurrency(e.target.value)}
                      >
                        <option value="">Select Currency</option>
                        {formMeta.currencies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: '#666' }}>DTS Modified:</label>
                      <div
                        className="edit-dts-readonly"
                        style={{
                          backgroundColor: '#f5f5f5',
                          marginTop: 5,
                          padding: '8px 12px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                          minWidth: 200,
                          minHeight: 38,
                          boxSizing: 'border-box',
                        }}
                      >
                        <span>{edDtsModified ? edDtsModified.replace('T', ' ').slice(0, 19) : ''}</span>
                        <span style={{ fontWeight: 600 }}>{edModifiedBy}</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: '#666' }}>DTS Created:</label>
                      <div
                        className="edit-dts-readonly"
                        style={{
                          backgroundColor: '#f5f5f5',
                          marginTop: 5,
                          padding: '8px 12px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                          minWidth: 200,
                          minHeight: 38,
                          boxSizing: 'border-box',
                        }}
                      >
                        <span>{edDtsCreated ? edDtsCreated.replace('T', ' ').slice(0, 19) : ''}</span>
                        <span style={{ fontWeight: 600 }}>{edCreatedBy}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="add-col">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit_remove_words">Remove Words</label>
                      <input
                        type="text"
                        id="edit_remove_words"
                        name="remove_word"
                        placeholder="Enter words to remove"
                        value={edRemove}
                        onChange={(e) => setEdRemove(e.target.value)}
                      />
                      <small className="field-help">
                        (Use semicolon to separate multiple words, e.g. abc;cde;efg)
                      </small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <div className="day-use-header">
                        <label>Day Use</label>
                        <div className="all-day-checkbox">
                          <input
                            type="checkbox"
                            id="edit_all_day"
                            name="all_day"
                            checked={edAllDay}
                            onChange={(e) => {
                              const v = e.target.checked
                              setEdAllDay(v)
                              if (!formMeta) return
                              setEdDays((prev) => {
                                const next = { ...prev }
                                formMeta.days.forEach((d) => {
                                  next[d.id] = v
                                })
                                return next
                              })
                            }}
                          />
                          <label htmlFor="edit_all_day">All Day</label>
                        </div>
                      </div>
                      <div className="day-checkboxes" id="edit_day_checkboxes">
                        {formMeta.days.map((d) => (
                          <div key={d.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              id={`edit_day_${d.id}`}
                              name="edit_day_use[]"
                              value={d.id}
                              checked={!!edDays[d.id]}
                              onChange={(e) =>
                                setEdDays((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.checked,
                                }))
                              }
                            />
                            <label htmlFor={`edit_day_${d.id}`}>{d.day_name}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-row row-two-cols">
                    <div className="form-group">
                      <label htmlFor="edit_replace_word_from">Replace From</label>
                      <input
                        type="text"
                        id="edit_replace_word_from"
                        name="replace_word_from"
                        placeholder="Old word"
                        value={edRepFrom}
                        onChange={(e) => setEdRepFrom(e.target.value)}
                      />
                      <small className="field-help">(Word to be replaced)</small>
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit_replace_word_to">Replace To</label>
                      <input
                        type="text"
                        id="edit_replace_word_to"
                        name="replace_word_to"
                        placeholder="New word"
                        value={edRepTo}
                        onChange={(e) => setEdRepTo(e.target.value)}
                      />
                      <small className="field-help">(Replacement word)</small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit_remarks">Remarks</label>
                      <textarea
                        id="edit_remarks"
                        name="remark"
                        rows={5}
                        placeholder="Enter remarks..."
                        value={edRemark}
                        onChange={(e) => setEdRemark(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-actions add-actions">
                  <button type="submit" className="btn btn-save">
                    Update Process
                  </button>
                  <button
                    type="button"
                    className="btn btn-cancel"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
