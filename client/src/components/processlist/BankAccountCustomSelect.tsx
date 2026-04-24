import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatBankAccountDisplay, isAllowedBankFormRole } from '../../lib/processListBankUtils'

export type BankAccountPick = {
  id: number
  account_id: string
  name?: string
  role?: string
}

type Props = {
  gate: string
  openGate: string | null
  setOpenGate: (id: string | null) => void
  accounts: BankAccountPick[]
  value: number | ''
  onChange: (id: number | '') => void
  buttonId: string
  dropdownId: string
  disabled?: boolean
  addAccountTitle?: string
  onAddAccountClick?: () => void
}

export function BankAccountCustomSelect({
  gate,
  openGate,
  setOpenGate,
  accounts,
  value,
  onChange,
  buttonId,
  dropdownId,
  disabled,
  addAccountTitle = 'Add New Account',
  onAddAccountClick,
}: Props) {
  const isOpen = openGate === gate
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })

  const list = useMemo(
    () => accounts.filter((a) => isAllowedBankFormRole(a.role)),
    [accounts],
  )

  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({
      top: r.bottom + 2,
      left: r.left,
      width: Math.max(r.width, 220),
    })
  }, [isOpen])

  const close = useCallback(() => setOpenGate(null), [setOpenGate])

  useEffect(() => {
    if (!isOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('click', onDoc, true)
    return () => document.removeEventListener('click', onDoc, true)
  }, [isOpen, close])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return [...list]
      .filter((a) => {
        if (!q) return true
        return formatBankAccountDisplay(a.account_id, a.name, a.id).toLowerCase().includes(q)
      })
      .sort((a, b) =>
        formatBankAccountDisplay(a.account_id, a.name, a.id).localeCompare(
          formatBankAccountDisplay(b.account_id, b.name, b.id),
        ),
      )
  }, [list, search])

  const selected = list.find((a) => a.id === value)
  const label = selected
    ? formatBankAccountDisplay(selected.account_id, selected.name, selected.id)
    : 'Select Account'

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    if (isOpen) close()
    else {
      setOpenGate(gate)
      setSearch('')
    }
  }

  const pick = (id: number | '') => {
    onChange(id)
    close()
  }

  const dropdown =
    isOpen && typeof document !== 'undefined' ? (
      <div
        ref={dropRef}
        id={dropdownId}
        className="custom-select-dropdown"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: pos.width,
          minWidth: pos.width,
          zIndex: 10001,
          display: 'block',
        }}
      >
        <div className="custom-select-search">
          <input
            type="text"
            placeholder="Search account..."
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        </div>
        <div className="custom-select-options" style={{ maxHeight: 280, overflowY: 'auto' }}>
          <div
            role="option"
            tabIndex={0}
            className="custom-select-option"
            onClick={() => pick('')}
            onKeyDown={(e) => e.key === 'Enter' && pick('')}
          >
            Select Account
          </div>
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No accounts found</div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                role="option"
                tabIndex={0}
                className={'custom-select-option' + (a.id === value ? ' selected' : '')}
                onClick={() => pick(a.id)}
                onKeyDown={(e) => e.key === 'Enter' && pick(a.id)}
              >
                {formatBankAccountDisplay(a.account_id, a.name, a.id)}
              </div>
            ))
          )}
        </div>
      </div>
    ) : null

  return (
    <div className="account-select-with-buttons">
      <div className="custom-select-wrapper">
        <button
          type="button"
          id={buttonId}
          ref={btnRef}
          className="custom-select-button"
          data-placeholder="Select Account"
          data-value={value === '' ? '' : String(value)}
          disabled={disabled}
          onClick={toggle}
        >
          {label}
        </button>
      </div>
      {onAddAccountClick ? (
        <button
          type="button"
          className="bank-add-btn"
          title={addAccountTitle}
          onClick={(e) => {
            e.stopPropagation()
            onAddAccountClick()
          }}
        >
          +
        </button>
      ) : null}
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
