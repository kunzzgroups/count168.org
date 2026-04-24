import { useCallback, useEffect, useRef, useState } from 'react'
import type { BankProcessRow } from '../../lib/processListTypes'
import { BANK_STATUS_OPTIONS } from '../../lib/processListTypes'
import { getBankStatusSelectValue, normalizeBankIssueFlag } from '../../lib/processListBankUtils'
import {
  postToggleProcessStatus,
  postUpdateBankIssueFlag,
} from '../../lib/processListApi'

type Props = {
  process: BankProcessRow
  onAfterChange: () => void
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

function applyClasses(raw: string): string {
  const n = String(raw || '')
    .trim()
    .toLowerCase()
  if (n === 'inactive') return 'is-inactive'
  if (n === 'official') return 'is-official'
  if (n === 'e_invoice') return 'is-e-invoice'
  if (n === 'block') return 'is-block'
  return 'is-active'
}

function labelFor(value: string): string {
  const o = BANK_STATUS_OPTIONS.find((x) => x.value === value)
  return o ? o.label : 'ACTIVE'
}

/**
 * 与 `js/processlist.js` 中 `renderBankStatusSelect` + `applyBankStatusSelectAppearance` 行为一致
 */
export function BankStatusDropdown({ process, onAfterChange, onNotice }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pid = process.id
  const display = getBankStatusSelectValue(process)

  const onPick = useCallback(
    async (raw: string) => {
      const v = raw.toLowerCase()
      const prevSel = getBankStatusSelectValue(process)
      if (v === prevSel) {
        setOpen(false)
        return
      }

      if (v === 'official' || v === 'e_invoice' || v === 'block') {
        const r = await postUpdateBankIssueFlag(pid, v)
        if (r.success) onNotice('Status updated', 'ok')
        else onNotice(r.error, 'err')
        if (r.success) onAfterChange()
        setOpen(false)
        return
      }

      if (v !== 'active' && v !== 'inactive') return

      const st = String(process.status || '').toLowerCase()
      const hasIssue = !!normalizeBankIssueFlag(process.issue_flag)

      if (v === 'active' && st === 'active' && hasIssue) {
        const r = await postUpdateBankIssueFlag(pid, '')
        if (r.success) onNotice('Updated', 'ok')
        else onNotice(r.error, 'err')
        if (r.success) onAfterChange()
        setOpen(false)
        return
      }
      if (v === 'inactive' && st === 'inactive' && hasIssue) {
        const r = await postUpdateBankIssueFlag(pid, '')
        if (r.success) onNotice('Updated', 'ok')
        else onNotice(r.error, 'err')
        if (r.success) onAfterChange()
        setOpen(false)
        return
      }

      if (!window.confirm(v === 'inactive' ? 'Switch to Inactive?' : 'Switch to Active?')) {
        setOpen(false)
        return
      }
      const t = await postToggleProcessStatus(pid, 'Bank')
      if (!t.success) {
        onNotice(t.error, 'err')
        setOpen(false)
        return
      }
      try {
        await postUpdateBankIssueFlag(pid, '')
      } catch {
        /* ignore */
      }
      onNotice('Status updated', 'ok')
      onAfterChange()
      setOpen(false)
    },
    [process, pid, onAfterChange, onNotice],
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onK = () => setOpen(false)
    document.addEventListener('click', onDoc, true)
    window.addEventListener('resize', onK)
    window.addEventListener('scroll', onK, true)
    return () => {
      document.removeEventListener('click', onDoc, true)
      window.removeEventListener('resize', onK)
      window.removeEventListener('scroll', onK, true)
    }
  }, [open])

  const curLabel = labelFor(display)
  const btnClass = 'bank-status-button ' + applyClasses(display) + (open ? ' open' : '')

  return (
    <div
      ref={rootRef}
      className={'bank-status-dropdown-react' + (open ? ' open' : '')}
      data-current-value={display}
    >
      <button
        type="button"
        className={btnClass}
        data-value={display}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {curLabel}
      </button>
      <div className="bank-status-menu-react" role="listbox" onClick={(e) => e.stopPropagation()}>
        {BANK_STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={'bank-status-option-react' + (o.value === display ? ' selected' : '')}
            data-value={o.value}
            onClick={() => void onPick(o.value)}
            role="option"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
