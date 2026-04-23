import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertModal } from '../components/login/AlertModal'
import { LoginForm } from '../components/login/LoginForm'
import { MaintenanceMarquee } from '../components/login/MaintenanceMarquee'
import { RoleTabs } from '../components/login/RoleTabs'
import { TelegramAnchor } from '../components/login/TelegramAnchor'
import type { Role } from '../components/login/types'
import { apiFetch } from '../lib/api'
import { publicAsset } from '../lib/publicAsset'
import { resolvePostLoginRedirect } from '../lib/resolvePostLoginRedirect'
import type { LoginProcessJson } from '../types/login'
import './LoginPage.css'

type MaintenanceItem = { id: number; content: string }

/**
 * 对应 `index.php` 整页：根节点用 `className="bg"`（等同原站 body.bg 下 login-container 一段）。
 * 子组件 DOM 与 `view-source:count168.org` 的 id/class 对齐。
 */
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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
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

  const supportHref =
    import.meta.env.VITE_SUPPORT_TELEGRAM_URL || 'https://t.me'

  const pageBg = `url('${publicAsset('images/count_bg.png')}')`

  return (
    <div
      className="bg"
      style={{ '--c168-page-bg': pageBg } as CSSProperties}
    >
      <div className="login-container">
        <MaintenanceMarquee items={maintenance} />

        <RoleTabs role={role} onSelect={setActiveRole} />

        <div className="login-card">
          <div className="form-content">
            <LoginForm
              role={role}
              companyId={companyId}
              userField={userField}
              password={password}
              remember={remember}
              submitting={submitting}
              onCompanyIdChange={setCompanyId}
              onUserFieldChange={setUserField}
              onPasswordChange={setPassword}
              onRememberChange={setRemember}
              onSubmit={onSubmit}
            />
          </div>
        </div>
      </div>

      <TelegramAnchor href={supportHref} />

      <AlertModal
        open={!!modal}
        title={modal?.title ?? 'Notice'}
        message={modal?.message ?? ''}
        onConfirm={() => setModal(null)}
        onRequestClose={() => setModal(null)}
      />
    </div>
  )
}
