import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AUTH_TOKEN_STORAGE_KEY } from '@/config/auth'
import { phpPagePath } from '@/lib/phpOrigin'
import { siteHttp } from '@/services/http'
import '../../../../css/style.css'
import '../../../../css/index.css'
import './loginPageExtras.css'

type SubmitResponse =
  | { status: 'success'; redirect?: string }
  | { status: 'error'; message?: string }

function loginRedirectWithApiToken(redirectPath: string, token: string): string {
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  const url = phpPagePath(path)
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}api_token=${encodeURIComponent(token)}`
}

export function OwnerSecondaryPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tokenFromUrl = searchParams.get('api_token') ?? ''

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modal, setModal] = useState({ open: false, title: 'Notice', message: '' })
  const modalDoneRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    document.body.classList.add('bg')
    return () => document.body.classList.remove('bg')
  }, [])

  const alertModal = (title: string, message: string) =>
    new Promise<void>((resolve) => {
      modalDoneRef.current = resolve
      setModal({ open: true, title: title || 'Notice', message: message || '' })
    })

  const closeModal = () => {
    setModal((m) => ({ ...m, open: false }))
    modalDoneRef.current?.()
    modalDoneRef.current = null
  }

  const onPinInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setPin(digits)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const code = pin.trim()
    if (!/^\d{6}$/.test(code)) {
      setError('Please enter exactly 6 digits')
      return
    }

    setSubmitting(true)
    const fd = new FormData()
    fd.append('secondary_password', code)
    const plain =
      tokenFromUrl && tokenFromUrl.length === 64 && /^[0-9a-f]+$/i.test(tokenFromUrl)
        ? tokenFromUrl
        : (localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '')
    if (plain.length === 64 && /^[0-9a-f]+$/i.test(plain)) {
      fd.append('api_token', plain)
    }

    try {
      const { data } = await siteHttp.post<SubmitResponse>(
        phpPagePath('/api/users/owner_secondary_password_submit_api.php'),
        fd,
      )
      if (data.status === 'success') {
        const redir = data.redirect ?? 'dashboard.php'
        const tok = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
        if (tok && /^[0-9a-f]{64}$/i.test(tok)) {
          window.location.href = loginRedirectWithApiToken(
            redir.startsWith('/') ? redir : `/${redir}`,
            tok,
          )
        } else {
          window.location.href = phpPagePath(
            redir.startsWith('/') ? redir : `/${redir}`,
          )
        }
      } else {
        setError(data.message ?? 'Verification failed')
      }
    } catch {
      await alertModal('Notice', 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="login-container">
        <div className="login-card">
          <div className="form-content">
            <h2
              style={{
                textAlign: 'center',
                marginBottom: 30,
                color: '#1e293b',
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              Secondary Password Verification
            </h2>
            <p
              style={{
                textAlign: 'center',
                marginBottom: 30,
                color: '#64748b',
                fontSize: 14,
              }}
            >
              Please enter your 6-digit secondary password to continue
            </p>

            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Enter 6-digit password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => onPinInput(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error ? (
                <div
                  style={{
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 20,
                    fontSize: 14,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button type="submit" className="login-btn" disabled={submitting}>
                <span>{submitting ? '…' : 'Verify'}</span>
              </button>

              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
                <button
                  type="button"
                  className="forgot-link"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit',
                  }}
                  onClick={() => navigate('/')}
                >
                  Back to login
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>

      <div
        id="alertModalOverlay"
        className={`modal-overlay${modal.open ? ' is-open' : ''}`}
        aria-hidden={!modal.open}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeModal()
        }}
      >
        <div
          className="modal-box"
          role="dialog"
          aria-labelledby="modalTitle"
          aria-describedby="modalMessage"
        >
          <div className="modal-icon-wrap">
            <i className="fas fa-exclamation-triangle modal-icon" aria-hidden />
          </div>
          <h3 id="modalTitle" className="modal-title">
            {modal.title}
          </h3>
          <p id="modalMessage" className="modal-message">
            {modal.message}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn modal-btn-primary"
              onClick={closeModal}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
