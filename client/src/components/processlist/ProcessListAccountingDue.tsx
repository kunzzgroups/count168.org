import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountingInboxRow } from '../../lib/processListTypes'
import {
  fetchProcessAccountingInbox,
  postAccountingInboxToTransactions,
  postDismissAccountingDueRows,
} from '../../lib/processListApi'

type Props = {
  companyId: number
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

function periodTypeForRow(row: AccountingInboxRow): string {
  if (row.is_manual_inactive) return 'manual_inactive'
  if (row.is_resend_consolidated_range) return 'resend_consolidated_range'
  if (row.is_partial_first_month) return 'partial_first_month'
  if (row.is_day_end_tail) return 'day_end_tail'
  return 'monthly'
}

function rowKey(row: AccountingInboxRow): string {
  const pt = periodTypeForRow(row)
  const bm = String(row.monthly_billing_month ?? '').trim()
  return `${row.id}|${pt}|${bm}`
}

function contractCellLabel(raw: string): string {
  const t = raw.trim()
  const map: Record<string, string> = {
    '1+1': '1+1 MONTH',
    '1+2': '1+2 MONTHS',
    '1+3': '1+3 MONTHS',
  }
  return map[t] || t || '-'
}

function dispatchBankListRefresh() {
  window.dispatchEvent(new Event('c168:bank-accounting-due-updated'))
}

/**
 * Bank 页标题旁 Accounting Due 徽章 + 与经典 `processlist.js` 一致的大弹窗（入账 / 从列表移除）。
 */
export function ProcessListAccountingDue({ companyId, onNotice }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AccountingInboxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postChecked, setPostChecked] = useState<Record<string, boolean>>({})
  const [deleteChecked, setDeleteChecked] = useState<Record<string, boolean>>({})

  const loadInbox = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchProcessAccountingInbox()
      if (r.success) setItems(Array.isArray(r.data) ? r.data : [])
      else {
        setItems([])
        onNotice(r.error, 'err')
      }
    } finally {
      setLoading(false)
    }
  }, [onNotice])

  useEffect(() => {
    void loadInbox()
  }, [companyId, loadInbox])

  useEffect(() => {
    const t = window.setInterval(() => void loadInbox(), 120000)
    return () => window.clearInterval(t)
  }, [loadInbox])

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const row of items) {
      const k = rowKey(row)
      if (!row.already_posted_today) next[k] = true
    }
    setPostChecked(next)
    setDeleteChecked({})
  }, [items])

  const postableCount = useMemo(
    () => items.filter((r) => !r.already_posted_today).length,
    [items],
  )

  const badgeCount = postableCount

  const togglePostAll = (checked: boolean) => {
    setPostChecked((prev) => {
      const next = { ...prev }
      for (const row of items) {
        if (row.already_posted_today) continue
        next[rowKey(row)] = checked
      }
      return next
    })
  }

  const toggleDeleteAll = (checked: boolean) => {
    setDeleteChecked((prev) => {
      const next = { ...prev }
      for (const row of items) {
        next[rowKey(row)] = checked
      }
      return next
    })
  }

  const selectedPostPairs = useMemo(() => {
    const out: { id: number; periodType: string; billingMonth: string }[] = []
    for (const row of items) {
      if (row.already_posted_today) continue
      const k = rowKey(row)
      if (!postChecked[k]) continue
      out.push({
        id: row.id,
        periodType: periodTypeForRow(row),
        billingMonth: String(row.monthly_billing_month ?? '').trim(),
      })
    }
    return out
  }, [items, postChecked])

  const selectedDeletePairs = useMemo(() => {
    const out: { id: number; periodType: string; billingMonth: string }[] = []
    for (const row of items) {
      const k = rowKey(row)
      if (!deleteChecked[k]) continue
      out.push({
        id: row.id,
        periodType: periodTypeForRow(row),
        billingMonth: String(row.monthly_billing_month ?? '').trim(),
      })
    }
    return out
  }, [items, deleteChecked])

  const doPost = async () => {
    if (selectedPostPairs.length === 0) {
      onNotice('Please select at least one process to post.', 'err')
      return
    }
    setPosting(true)
    try {
      const r = await postAccountingInboxToTransactions(selectedPostPairs)
      if (r.success) {
        onNotice(r.message || 'Posted successfully.', 'ok')
        setOpen(false)
        void loadInbox()
        dispatchBankListRefresh()
        window.dispatchEvent(new Event('c168:company-session-updated'))
      } else onNotice(r.error || 'Post failed.', 'err')
    } finally {
      setPosting(false)
    }
  }

  const doDismiss = async () => {
    if (selectedDeletePairs.length === 0) {
      onNotice('Select rows in the Delete column to remove from Accounting Due.', 'err')
      return
    }
    const ok = window.confirm(
      selectedDeletePairs.length === 1
        ? 'This row will be removed from Accounting Due. Process data will not change.'
        : `These ${selectedDeletePairs.length} rows will be removed from Accounting Due. Process data will not change.`,
    )
    if (!ok) return
    setPosting(true)
    try {
      const r = await postDismissAccountingDueRows(selectedDeletePairs)
      if (r.success) {
        onNotice(r.message || 'Removed from Accounting Due', 'ok')
        void loadInbox()
        dispatchBankListRefresh()
      } else onNotice(r.error || 'Remove failed.', 'err')
    } finally {
      setPosting(false)
    }
  }

  const openModal = () => {
    setOpen(true)
    void loadInbox()
  }

  const closeModal = () => setOpen(false)

  return (
    <>
      <div className="process-accounting-inbox-wrap" id="processAccountingInboxWrap">
        <button
          type="button"
          className="process-accounting-inbox-btn process-accounting-inbox-main"
          id="processAccountingInboxBtn"
          onClick={openModal}
        >
          <svg className="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
          Accounting Due
          <span className="process-accounting-inbox-badge" id="processAccountingInboxCount">
            {badgeCount}
          </span>
        </button>
      </div>

      {open ? (
        <div
          className="modal"
          id="processAccountingDueModal"
          style={{ display: 'block' }}
          role="dialog"
          aria-modal
          aria-labelledby="processAccountingDueModalTitle"
        >
          <div
            className="modal-content accounting-due-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="processAccountingDueModalTitle">
                Accounting Due
                <span className="process-accounting-inbox-badge" style={{ marginLeft: 8 }}>
                  {badgeCount}
                </span>
              </h2>
              <div className="modal-header-actions">
                <button type="button" className="close" onClick={closeModal} aria-label="Close">
                  &times;
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="process-accounting-inbox-table-wrap">
                <table className="process-accounting-inbox-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          title="Select all"
                          className="process-accounting-inbox-cb"
                          checked={postableCount > 0 && items.filter((r) => !r.already_posted_today).every((r) => postChecked[rowKey(r)])}
                          disabled={postableCount === 0}
                          onChange={(e) => togglePostAll(e.target.checked)}
                        />
                      </th>
                      <th>No</th>
                      <th>Start Date</th>
                      <th>Card Owner</th>
                      <th>Bank</th>
                      <th>Contract</th>
                      <th style={{ width: 80 }}>
                        Delete{' '}
                        <input
                          type="checkbox"
                          title="Select all for delete"
                          className="process-accounting-inbox-delete-cb"
                          checked={items.length > 0 && items.every((r) => deleteChecked[rowKey(r)])}
                          disabled={items.length === 0}
                          onChange={(e) => toggleDeleteAll(e.target.checked)}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && items.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '10px 8px', color: '#6b7280' }}>
                          Loading…
                        </td>
                      </tr>
                    ) : null}
                    {!loading && items.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '10px 8px', color: '#6b7280' }}>
                          No processes due for accounting today.
                        </td>
                      </tr>
                    ) : null}
                    {items.map((row, idx) => {
                      const k = rowKey(row)
                      const name = row.name || row.bank || '-'
                      const startDate =
                        (row.day_start || row.start_date || '').toString().trim() || '-'
                      const contractDisplay = contractCellLabel(String(row.contract || ''))
                      const posted = !!row.already_posted_today
                      const rowClass = posted ? 'process-accounting-inbox-row-posted' : ''
                      const pt = periodTypeForRow(row)
                      const bm = String(row.monthly_billing_month ?? '').trim()
                      return (
                        <tr
                          key={k}
                          className={rowClass}
                          data-id={row.id}
                          data-period-type={pt}
                          {...(bm ? { 'data-billing-month': bm } : {})}
                        >
                          <td>
                            <input
                              type="checkbox"
                              className="process-accounting-inbox-row-cb"
                              disabled={posted}
                              checked={!!postChecked[k] && !posted}
                              onChange={(e) =>
                                setPostChecked((s) => ({ ...s, [k]: e.target.checked }))
                              }
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{startDate}</td>
                          <td>{name}</td>
                          <td>{row.bank || '-'}</td>
                          <td>{contractDisplay}</td>
                          <td>
                            <input
                              type="checkbox"
                              className="process-accounting-inbox-delete-cb"
                              checked={!!deleteChecked[k]}
                              onChange={(e) =>
                                setDeleteChecked((s) => ({ ...s, [k]: e.target.checked }))
                              }
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="process-accounting-inbox-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={posting || selectedPostPairs.length === 0}
                  onClick={() => void doPost()}
                >
                  {selectedPostPairs.length > 0
                    ? `Transaction (${selectedPostPairs.length})`
                    : 'Transaction'}
                </button>
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={posting || selectedDeletePairs.length === 0}
                  onClick={() => void doDismiss()}
                >
                  Delete
                </button>
                <button type="button" className="btn btn-cancel" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
