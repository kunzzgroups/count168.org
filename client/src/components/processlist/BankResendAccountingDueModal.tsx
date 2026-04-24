import { useCallback, useEffect, useState } from 'react'
import type { BankProcessRow } from '../../lib/processListTypes'
import {
  bankDayFieldForDateInput,
  bankResendScheduleDayStartForbiddenMessage,
  isBankResendDayStartBackendErrorMessage,
  isSelectedDayStartResendLockedToday,
  normalizeResendDayStartToYmd,
} from '../../lib/processListBankUtils'
import { postCheckBankResendDayStartLock, postResendAccountingDue } from '../../lib/processListApi'

type Props = {
  process: BankProcessRow | null
  open: boolean
  onClose: () => void
  /** 与经典 `persistOpenBankEditBeforeResend` 一致：同进程编辑弹窗打开时先静默保存 */
  beforeResend: (processId: number) => Promise<void>
  onSuccess: () => void
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

/**
 * 与 `bank_process_list.php` + `processlist.js` 中 `#confirmBankResendModal` 行为一致（沿用同名 id 以吃现有 CSS）。
 */
export function BankResendAccountingDueModal({
  process,
  open,
  onClose,
  beforeResend,
  onSuccess,
  onNotice,
}: Props) {
  const [dayStart, setDayStart] = useState('')
  const [dayEnd, setDayEnd] = useState('')
  const [frequency, setFrequency] = useState<'monthly' | '1st_of_every_month'>('1st_of_every_month')
  const [dayStartError, setDayStartError] = useState('')
  const [backendLocked, setBackendLocked] = useState(false)
  const [lockPending, setLockPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const monthlyDisabled = !!String(dayEnd || '').trim()

  useEffect(() => {
    if (!open || !process) return
    const ds = bankDayFieldForDateInput(process.day_start)
    const de = bankDayFieldForDateInput(process.day_end)
    setDayStart(ds)
    setDayEnd(de)
    const fq = process.day_start_frequency === 'monthly' ? 'monthly' : '1st_of_every_month'
    if (de) {
      setFrequency('1st_of_every_month')
    } else {
      setFrequency(fq)
    }
    setDayStartError('')
    setBackendLocked(false)
  }, [open, process])

  useEffect(() => {
    if (monthlyDisabled && frequency === 'monthly') {
      setFrequency('1st_of_every_month')
    }
  }, [monthlyDisabled, frequency])

  useEffect(() => {
    if (!open || !process) return
    const ymd = normalizeResendDayStartToYmd(dayStart)
    if (!ymd) {
      setBackendLocked(false)
      setLockPending(false)
      return
    }
    let cancelled = false
    setLockPending(true)
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await postCheckBankResendDayStartLock(process.id, ymd)
          if (cancelled) return
          setBackendLocked(r.success && !!r.locked)
        } catch {
          if (!cancelled) setBackendLocked(isSelectedDayStartResendLockedToday(process, dayStart))
        } finally {
          if (!cancelled) setLockPending(false)
        }
      })()
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      setLockPending(false)
    }
  }, [open, process, dayStart])

  const clearInlineError = useCallback(() => {
    setDayStartError('')
  }, [])

  const quickLocked = process ? isSelectedDayStartResendLockedToday(process, dayStart) : false
  const confirmDisabled = submitting || lockPending || quickLocked || backendLocked

  const label =
    process != null
      ? String(process.supplier || process.card_lower || `#${process.id}`).trim() || `#${process.id}`
      : ''

  const handleConfirm = async () => {
    if (!process) return
    const id = process.id
    await beforeResend(id)

    const ymdCheck = normalizeResendDayStartToYmd(dayStart)
    if (ymdCheck) {
      try {
        const lockR = await postCheckBankResendDayStartLock(id, ymdCheck)
        if (lockR.success && lockR.locked) {
          onNotice(
            'This process has already been resent for this Day start today. Please select another Day start.',
            'err',
          )
          return
        }
      } catch {
        if (isSelectedDayStartResendLockedToday(process, dayStart)) {
          onNotice(
            'This process has already been resent for this Day start today. Please select another Day start.',
            'err',
          )
          return
        }
      }
    }

    const forbid = bankResendScheduleDayStartForbiddenMessage(dayStart, process.day_start ?? null)
    if (forbid) {
      setDayStartError(forbid)
      return
    }

    setSubmitting(true)
    try {
      const r = await postResendAccountingDue({
        bank_process_id: id,
        day_start: String(dayStart || '').trim(),
        day_end: String(dayEnd || '').trim(),
        day_start_frequency: frequency === 'monthly' ? 'monthly' : '1st_of_every_month',
      })
      if (r.success) {
        onNotice(r.message || 'You can post from Accounting Due again', 'ok')
        onSuccess()
        onClose()
      } else {
        const err = r.error || 'Resend failed'
        onNotice(err, 'err')
        if (isBankResendDayStartBackendErrorMessage(err)) {
          setDayStartError(err)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!open || !process) return null

  return (
    <div
      id="confirmBankResendModal"
      className="process-modal process-modal--bank-resend"
      style={{ display: 'block' }}
      role="dialog"
      aria-modal
      aria-labelledby="bankResendModalTitle"
    >
      <div className="process-confirm-modal-content bank-resend-modal-content">
        <div className="bank-resend-modal-hero">
          <div className="process-confirm-icon-container bank-resend-modal-icon-wrap">
            <svg
              className="process-confirm-icon process-confirm-icon--resend"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3v5h5" />
            </svg>
          </div>
          <h2 id="bankResendModalTitle" className="process-confirm-title bank-resend-modal-title">
            Resend to Accounting Due
          </h2>
          <p className="process-confirm-message bank-resend-modal-message" style={{ whiteSpace: 'pre-line' }}>
            {`Resend "${label}" to Accounting Due?\n\nThis clears posted markers so the process can appear in Accounting Due again. The schedule below applies only to this Resend and does not change the Edit Process form.`}
          </p>
        </div>
        <div id="confirmBankResendScheduleFields" className="bank-resend-schedule-card">
          <div className="bank-resend-schedule-card__head">
            <span className="bank-resend-schedule-card__label">Billing schedule</span>
            <p className="bank-resend-schedule-card__hint">
              These values apply only to this Resend (which month to reopen). They are not saved to the
              process record; Edit Process keeps its own billing until you click Update Process.
            </p>
          </div>
          <div className="bank-resend-schedule-grid">
            <div className="bank-resend-field">
              <label className="bank-resend-field__label" htmlFor="bank_resend_day_start">
                Day start
              </label>
              <input
                type="date"
                id="bank_resend_day_start"
                className={`bank-resend-control${dayStartError ? ' bank-resend-control--error' : ''}`}
                autoComplete="off"
                value={dayStart}
                onChange={(e) => {
                  clearInlineError()
                  setDayStart(e.target.value)
                }}
                aria-invalid={dayStartError ? true : undefined}
              />
              {dayStartError ? (
                <div id="bankResendDayStartInlineError" className="bank-resend-inline-alert" role="alert">
                  {dayStartError}
                </div>
              ) : null}
            </div>
            <div className="bank-resend-field">
              <label className="bank-resend-field__label" htmlFor="bank_resend_day_end">
                Day end
              </label>
              <input
                type="date"
                id="bank_resend_day_end"
                className="bank-resend-control"
                autoComplete="off"
                value={dayEnd}
                onChange={(e) => setDayEnd(e.target.value)}
              />
            </div>
            <div className="bank-resend-field bank-resend-field--full">
              <label className="bank-resend-field__label" htmlFor="bank_resend_frequency">
                Frequency
              </label>
              <select
                id="bank_resend_frequency"
                className="bank-resend-control bank-resend-control--select"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value === 'monthly' ? 'monthly' : '1st_of_every_month')
                }
              >
                <option value="1st_of_every_month">1st of Every Month</option>
                <option value="monthly" disabled={monthlyDisabled}>
                  Monthly
                </option>
              </select>
            </div>
          </div>
        </div>
        <div className="process-confirm-actions bank-resend-modal-actions">
          <button
            type="button"
            className="process-btn process-btn-cancel confirm-cancel confirm-bank-resend-cancel"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="process-btn process-btn-resend confirm-bank-resend-confirm"
            id="confirmBankResendBtn"
            disabled={confirmDisabled}
            title={
              backendLocked || quickLocked
                ? 'Today for this Day start has already been resent. Please choose another date.'
                : lockPending
                  ? 'Checking latest backend status...'
                  : undefined
            }
            onClick={() => void handleConfirm()}
          >
            {submitting ? 'Resending…' : 'Resend'}
          </button>
        </div>
      </div>
    </div>
  )
}
