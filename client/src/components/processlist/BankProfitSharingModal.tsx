import { useCallback, useEffect, useState } from 'react'
import type { ProfitSharingEntry } from '../../lib/processListBankUtils'
import { formatBankAccountDisplay } from '../../lib/processListBankUtils'
import { BankAccountCustomSelect, type BankAccountPick } from './BankAccountCustomSelect'

type Row = { key: string; accountId: number | ''; amount: string }

function newRow(): Row {
  return { key: `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, accountId: '', amount: '' }
}

type Props = {
  open: boolean
  onClose: () => void
  accounts: BankAccountPick[]
  onSubmit: (entries: ProfitSharingEntry[]) => void
}

export function BankProfitSharingModal({ open, onClose, accounts, onSubmit }: Props) {
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [openGate, setOpenGate] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setRows([newRow()])
      setOpenGate(null)
    }
  }, [open])

  const addRow = useCallback(() => {
    setRows((r) => [...r, newRow()])
  }, [])

  const removeRow = useCallback((key: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.key !== key)))
  }, [])

  const doSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const out: ProfitSharingEntry[] = []
    for (const row of rows) {
      if (row.accountId === '' || !String(row.amount).trim()) continue
      const acc = accounts.find((a) => a.id === row.accountId)
      const accountText = acc
        ? formatBankAccountDisplay(acc.account_id, acc.name, acc.id)
        : String(row.accountId)
      const num = parseFloat(String(row.amount).trim())
      const amount = Number.isFinite(num) ? num.toFixed(2) : String(row.amount).trim()
      out.push({ accountId: Number(row.accountId), accountText, amount })
    }
    if (out.length === 0) return
    onSubmit(out)
    onClose()
  }

  if (!open) return null

  return (
    <div id="profitSharingModal" className="modal" style={{ display: 'block' }} role="dialog" aria-modal>
      <div className="modal-content" style={{ maxWidth: 628 }}>
        <div className="modal-header">
          <h2>Add Profit Sharing</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <form id="profitSharingForm" className="bank-form" style={{ display: 'block' }} onSubmit={doSubmit}>
            <div id="profitSharingRowsContainer">
              {rows.map((row, idx) => (
                <div key={row.key} className="form-row bank-row-two-cols profit-sharing-row">
                  <div className="form-group">
                    <label htmlFor={`${row.key}_acc`}>Account</label>
                    <BankAccountCustomSelect
                      gate={`ps_${row.key}`}
                      openGate={openGate}
                      setOpenGate={setOpenGate}
                      accounts={accounts}
                      value={row.accountId === '' ? '' : row.accountId}
                      onChange={(id) =>
                        setRows((rs) =>
                          rs.map((x) => (x.key === row.key ? { ...x, accountId: id } : x)),
                        )
                      }
                      buttonId={`profit_sharing_account_btn_${row.key}`}
                      dropdownId={`profit_sharing_account_dropdown_${row.key}`}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${row.key}_amt`}>Amount</label>
                    <input
                      id={`${row.key}_amt`}
                      type="number"
                      className="bank-input profit-sharing-amount"
                      placeholder="Enter amount"
                      step="0.01"
                      min={0}
                      value={row.amount}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((x) => (x.key === row.key ? { ...x, amount: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="form-group profit-sharing-delete-cell profit-sharing-first-row-spacer">
                    {idx > 0 ? (
                      <button
                        type="button"
                        className="remove-country-modal"
                        title="Remove row"
                        onClick={() => removeRow(row.key)}
                      >
                        &times;
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="profit-sharing-add-row-wrap" style={{ marginTop: 10 }}>
              <button type="button" className="bank-add-btn" title="Add another Account & Amount" onClick={addRow}>
                +
              </button>
            </div>
            <div className="form-actions bank-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-save">
                Add
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
