import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { http, siteHttp } from '@/services/http'
import '../../../../css/style.css'
import '../../../../css/index.css'
import './loginPageExtras.css'

type LoginRole = 'admin' | 'member'

type MaintenanceRow = {
  id: number
  content: string
}

type MaintenanceApiResponse = {
  success: boolean
  message: string
  data: MaintenanceRow[] | null
}

type LoginProcessResponse = {
  status: 'success' | 'error'
  message?: string
  redirect?: string
}

type VerifyCompanyResponse = {
  success: boolean
  message: string
}

export function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const roleFromUrl = searchParams.get('role') === 'member' ? 'member' : 'admin'

  const [loginRole, setLoginRole] = useState<LoginRole>(roleFromUrl)
  const [companyId, setCompanyId] = useState('')
  const [userIdentifier, setUserIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceRow[]>([])
  const [maintenanceVisible, setMaintenanceVisible] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [modal, setModal] = useState({ open: false, title: 'Notice', message: '' })
  const modalDoneRef = useRef<(() => void) | null>(null)

  const verifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    document.body.classList.add('bg')
    return () => document.body.classList.remove('bg')
  }, [])

  useEffect(() => {
    setLoginRole(roleFromUrl)
  }, [roleFromUrl])

  const verifyCompanyId = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return

    const fd = new FormData()
    fd.append('company_id', trimmed)

    http.post<VerifyCompanyResponse>('/company/verify_api.php', fd).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    http
      .get<MaintenanceApiResponse>('/maintenance/get_public_api.php')
      .then((res) => {
        if (cancelled) return
        const list = res.data.success && res.data.data?.length ? res.data.data : []
        setMaintenanceItems(list)
        setMaintenanceVisible(list.length > 0)
      })
      .catch(() => {
        if (!cancelled) {
          setMaintenanceItems([])
          setMaintenanceVisible(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    const trimmed = companyId.trim()
    if (!trimmed) return

    verifyTimeoutRef.current = setTimeout(() => {
      verifyCompanyId(trimmed)
    }, 500)
    return () => {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    }
  }, [companyId, verifyCompanyId])

  const onCompanyBlur = () => {
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    if (companyId.trim()) verifyCompanyId(companyId)
  }

  const setRoleTab = (role: LoginRole) => {
    setLoginRole(role)
    if (role === 'member') {
      setSearchParams({ role: 'member' })
    } else {
      setSearchParams({})
    }
  }

  const marqueeEntries = maintenanceItems.flatMap((m) => [m, m])

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const fd = new FormData()
    fd.append('action', 'login')
    fd.append('login_role', loginRole)
    fd.append('company_id', companyId.trim())
    fd.append('password', password)
    if (rememberMe) fd.append('remember_me', '1')
    if (loginRole === 'member') {
      fd.append('account_id', userIdentifier.trim())
    } else {
      fd.append('login_id', userIdentifier.trim())
    }

    try {
      const { data } = await siteHttp.post<LoginProcessResponse>('/login_process.php', fd)
      if (data.status === 'success' && data.redirect) {
        window.location.href = data.redirect
      } else {
        await alertModal('Notice', data.message || 'Login failed')
      }
    } catch {
      await alertModal('Notice', 'An error occurred during login')
    } finally {
      setSubmitting(false)
    }
  }

  const forgotDisplay = loginRole === 'member' ? 'none' : 'block'
  const userPlaceholder = loginRole === 'member' ? 'Account Id' : 'Username'

  return (
    <>
      <div className="login-container">
        {maintenanceVisible ? (
          <div className="maintenance-marquee-wrapper" id="maintenanceMarqueeWrapper">
            <div className="maintenance-marquee-track" id="maintenanceMarqueeTrack">
              {marqueeEntries.map((maintenance, index) => (
                <div
                  key={`${maintenance.id}-${index}`}
                  className="maintenance-marquee-item"
                >
                  <span className="maintenance-marquee-dot" />
                  <span className="maintenance-marquee-label">系统维护中:</span>
                  <span>{maintenance.content}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab${loginRole === 'admin' ? ' active' : ''}`}
            id="admin-tab"
            onClick={() => setRoleTab('admin')}
          >
            Admin
          </button>
          <button
            type="button"
            className={`role-tab${loginRole === 'member' ? ' active' : ''}`}
            id="member-tab"
            onClick={() => setRoleTab('member')}
          >
            Member
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" id="loginForm" method="POST" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" />
                <input
                  type="text"
                  placeholder="Company / Group ID"
                  id="company-id"
                  name="company_id"
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value.toUpperCase())}
                  onBlur={onCompanyBlur}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-user input-icon" />
                <input
                  type="text"
                  placeholder={userPlaceholder}
                  id="user-id"
                  name={loginRole === 'member' ? 'account_id' : 'login_id'}
                  data-account-field="account_id"
                  required
                  value={userIdentifier}
                  onChange={(e) => setUserIdentifier(e.target.value.toUpperCase())}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder="Password"
                  id="password"
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-options">
                <label className="remember-switch">
                  <input
                    type="checkbox"
                    name="remember_me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="slider" />
                  <span className="remember-text">Remember me</span>
                </label>
                <a
                  href="/reset-password.php"
                  className="forgot-link"
                  style={{ display: forgotDisplay }}
                >
                  Forget Password?
                </a>
              </div>

              <button type="submit" className="login-btn" disabled={submitting}>
                <span>{submitting ? '…' : 'Login'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <img src="/images/telegram.png" alt="Telegram" className="telegram-icon" />

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
              id="modalConfirmBtn"
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
