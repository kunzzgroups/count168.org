import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import { publicAsset } from '../lib/publicAsset'
import { resolvePostLoginRedirect } from '../lib/resolvePostLoginRedirect'
import type { ApiResult } from '../types/api'
import type {
  SecondaryStatusData,
  VerifySecondaryData,
} from '../types/secondaryPassword'
import './LoginPage.css'
import './OwnerSecondaryPasswordPage.css'

type GateState = 'loading' | 'form'

/**
 * 对应原 `owner_secondary_password.php`；提交走 `api/owner/verify_secondary_password_api.php`
 */
export function OwnerSecondaryPasswordPage() {
  const [gate, setGate] = useState<GateState>('loading')
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pageBg = `url('${publicAsset('images/count_bg.png')}')`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(
          '/api/owner/secondary_password_status_api.php',
        )
        const json: ApiResult<SecondaryStatusData> = await res.json()
        if (cancelled) return
        if (json.success && json.data?.redirect) {
          window.location.assign(resolvePostLoginRedirect(json.data.redirect))
          return
        }
        if (json.success && json.data?.needPassword) {
          setGate('form')
          return
        }
        if (!json.success && (json.data as { redirect?: string } | null)?.redirect) {
          const r = (json.data as { redirect: string }).redirect
          window.location.assign(apiUrl(`/${r.replace(/^\//, '')}`))
          return
        }
        if (!json.success) {
          window.location.assign(apiUrl('/index.php'))
          return
        }
        setGate('form')
      } catch {
        if (!cancelled) window.location.assign(apiUrl('/index.php'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onInput = (v: string) => {
    const n = v.replace(/[^0-9]/g, '').slice(0, 6)
    setDigits(n)
    if (error) setError('')
  }

  const onPaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault()
    const t = (e.clipboardData || (window as unknown as { clipboardData?: ClipboardEvent['clipboardData'] }).clipboardData)?.getData('text') || ''
    onInput(t)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!/^\d{6}$/.test(digits)) {
      setError('Please enter exactly 6 digits')
      return
    }
    setSubmitting(true)
    setError('')
    const fd = new FormData()
    fd.set('secondary_password', digits)
    try {
      const res = await apiFetch(
        '/api/owner/verify_secondary_password_api.php',
        { method: 'POST', body: fd },
      )
      const json: ApiResult<VerifySecondaryData> = await res.json()
      if (json.success && json.data?.redirect) {
        window.location.assign(resolvePostLoginRedirect(json.data.redirect))
        return
      }
      if (!json.success) {
        setError(json.message || json.error || 'Verification failed')
        return
      }
      setError('Verification failed')
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (gate === 'loading') {
    return (
      <div
        className="bg"
        style={{ '--c168-page-bg': pageBg } as CSSProperties}
      >
        <div className="login-container">
          <p className="own-sec-loading">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg"
      style={{ '--c168-page-bg': pageBg } as CSSProperties}
    >
      <div className="login-container">
        <div className="login-card">
          <div className="form-content">
            <h2 className="own-sec-title">Secondary Password Verification</h2>
            <p className="own-sec-sub">
              Please enter your 6-digit secondary password to continue
            </p>
            <form
              className="login-form"
              id="secondaryPasswordForm"
              method="post"
              onSubmit={onSubmit}
            >
              <div className="input-group">
                <i
                  className="fas fa-lock input-icon"
                  aria-hidden="true"
                />
                <input
                  type="password"
                  name="secondary_password"
                  id="secondary_password"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  required
                  placeholder="Enter 6-digit password"
                  value={digits}
                  onChange={(e) => onInput(e.target.value)}
                  onPaste={onPaste}
                  autoFocus
                />
              </div>
              {error ? <div className="own-sec-err" role="alert">{error}</div> : null}
              <button className="login-btn" type="submit" disabled={submitting}>
                <span>{submitting ? '…' : 'Verify'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
