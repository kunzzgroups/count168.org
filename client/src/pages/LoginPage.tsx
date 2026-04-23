import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Lock, Send, User } from 'lucide-react'
import { apiFetch, apiUrl } from '../lib/api'
import { resolvePostLoginRedirect } from '../lib/resolvePostLoginRedirect'
import type { LoginProcessJson } from '../types/login'
import './LoginPage.css'

type Role = 'admin' | 'member'

type MaintenanceItem = { id: number; content: string }

export function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const role: Role =
    searchParams.get('role') === 'member' ? 'member' : 'admin'
  const [companyId, setCompanyId] = useState('')
  const [userField, setUserField] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [modal, setModal] = useState<{ title: string; message: string } | null>(
    null,
  )
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalTitleId = useId()
  const modalDescId = useId()

  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal])

  const setActiveRole = (next: Role) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'admin') p.delete('role')
        else p.set('role', 'member')
        return p
      },
      { replace: true },
    )
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(
          '/api/maintenance/get_public_api.php',
        )
        const json: {
          success?: boolean
          data?: MaintenanceItem[]
        } = await res.json()
        if (
          !cancelled &&
          json.success &&
          Array.isArray(json.data) &&
          json.data.length > 0
        ) {
          setMaintenance(json.data)
        } else if (!cancelled) {
          setMaintenance([])
        }
      } catch {
        if (!cancelled) setMaintenance([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const verifyCompany = useCallback((value: string) => {
    if (!value.trim()) return
    const fd = new FormData()
    fd.set('company_id', value)
    void apiFetch('/api/company/verify_api.php', { method: 'POST', body: fd })
  }, [])

  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current)
    if (!companyId.trim()) return
    verifyTimer.current = setTimeout(() => {
      verifyCompany(companyId)
    }, 500)
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current)
    }
  }, [companyId, verifyCompany])

  const showNotice = (message: string, title = 'Notice') => {
    setModal({ title, message })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    const fd = new FormData()
    fd.set('company_id', companyId.trim().toUpperCase())
    fd.set('password', password)
    fd.set('login_role', role)
    fd.set('action', 'login')
    if (role === 'member') {
      fd.set('account_id', userField.trim().toUpperCase())
    } else {
      fd.set('login_id', userField.trim().toUpperCase())
    }
    if (remember) fd.set('remember_me', '1')

    try {
      const res = await apiFetch('/login_process.php', { method: 'POST', body: fd })
      const data: LoginProcessJson = await res.json()
      if (data.status === 'success' && data.redirect) {
        const url = resolvePostLoginRedirect(data.redirect)
        window.location.assign(url)
        return
      }
      showNotice(data.message || 'Login failed')
    } catch {
      showNotice('An error occurred during login')
    } finally {
      setSubmitting(false)
    }
  }

  const userPlaceholder = role === 'member' ? 'Account Id' : 'Username'
  const showForgot = role === 'admin'

  const supportHref =
    import.meta.env.VITE_SUPPORT_TELEGRAM_URL || 'https://t.me'

  return (
    <div className="login-page">
      <div className="login-page-inner">
        {maintenance.length > 0 && (
          <div className="maintenance-zone" aria-live="polite">
            <div className="maintenance-wrap">
              <div className="maintenance-track" role="list">
                {[...maintenance, ...maintenance].map((m, i) => (
                  <div
                    className="maintenance-item"
                    key={`${m.id}-${i}`}
                    role="listitem"
                  >
                    <span className="maintenance-dot" />
                    <span className="maintenance-lbl">系统维护中:</span>
                    <span>{m.content}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="role-tabs" role="tablist" aria-label="Login role">
          <button
            type="button"
            className={`role-tab ${role === 'admin' ? 'active' : ''}`}
            role="tab"
            aria-selected={role === 'admin'}
            onClick={() => setActiveRole('admin')}
          >
            Admin
          </button>
          <button
            type="button"
            className={`role-tab ${role === 'member' ? 'active' : ''}`}
            role="tab"
            aria-selected={role === 'member'}
            onClick={() => setActiveRole('member')}
          >
            Member
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <Building2
                  className="input-ico"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <input
                  name="company_id"
                  autoComplete="organization"
                  placeholder="Company / Group ID"
                  value={companyId}
                  onChange={(e) =>
                    setCompanyId(e.target.value.toUpperCase())
                  }
                  required
                />
              </div>
              <div className="input-group">
                <User
                  className="input-ico"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <input
                  name={role === 'member' ? 'account_id' : 'login_id'}
                  autoComplete="username"
                  placeholder={userPlaceholder}
                  value={userField}
                  onChange={(e) =>
                    setUserField(e.target.value.toUpperCase())
                  }
                  required
                />
              </div>
              <div className="input-group">
                <Lock
                  className="input-ico"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-options">
                <label className="remember-switch">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="slider" />
                  <span className="remember-text">Remember me</span>
                </label>
                {showForgot && (
                  <a
                    className="forgot-link"
                    href={apiUrl('/reset-password.php')}
                  >
                    Forget Password?
                  </a>
                )}
              </div>

              <button
                className="login-btn"
                type="submit"
                disabled={submitting}
              >
                {submitting ? '…' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <a
        className="tg-fab"
        href={supportHref}
        target="_blank"
        rel="noopener noreferrer"
        title="Telegram"
        aria-label="Telegram"
      >
        <Send size={26} />
      </a>

      {modal && (
        <div
          className="login-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null)
          }}
        >
          <div
            className="login-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={modalDescId}
          >
            <h3 id={modalTitleId}>{modal.title}</h3>
            <p id={modalDescId}>{modal.message}</p>
            <button
              type="button"
              className="login-modal-ok"
              onClick={() => setModal(null)}
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
