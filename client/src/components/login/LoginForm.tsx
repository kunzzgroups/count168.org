import type { FormEvent } from 'react'
import { apiUrl } from '../../lib/api'
import type { Role } from './types'

type LoginFormProps = {
  role: Role
  companyId: string
  userField: string
  password: string
  remember: boolean
  submitting: boolean
  onCompanyIdChange: (v: string) => void
  onUserFieldChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onRememberChange: (v: boolean) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

/**
 * 对应 `index.php` 中
 * `form#loginForm.login-form` 及内层字段 `id` / `name`（与 PHP 一致，便于对稿与 e2e）
 */
export function LoginForm({
  role,
  companyId,
  userField,
  password,
  remember,
  submitting,
  onCompanyIdChange,
  onUserFieldChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
}: LoginFormProps) {
  const userPlaceholder = role === 'member' ? 'Account Id' : 'Username'
  const showForgot = role === 'admin'
  return (
    <form
      className="login-form"
      id="loginForm"
      method="post"
      onSubmit={onSubmit}
    >
      <div className="input-group">
        <i className="fas fa-building input-icon" aria-hidden="true" />
        <input
          type="text"
          name="company_id"
          id="company-id"
          autoComplete="organization"
          placeholder="Company / Group ID"
          value={companyId}
          onChange={(e) => onCompanyIdChange(e.target.value.toUpperCase())}
          required
        />
      </div>

      <div className="input-group">
        <i className="fas fa-user input-icon" aria-hidden="true" />
        <input
          type="text"
          name={role === 'member' ? 'account_id' : 'login_id'}
          id="user-id"
          autoComplete="username"
          placeholder={userPlaceholder}
          value={userField}
          onChange={(e) => onUserFieldChange(e.target.value.toUpperCase())}
          required
          data-account-field="account_id"
        />
      </div>

      <div className="input-group">
        <i className="fas fa-lock input-icon" aria-hidden="true" />
        <input
          type="password"
          name="password"
          id="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
        />
      </div>

      <div className="form-options">
        <label className="remember-switch" htmlFor="remember-me-cb">
          <input
            type="checkbox"
            id="remember-me-cb"
            name="remember_me"
            value="1"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
          />
          <span className="slider" />
          <span className="remember-text">Remember me</span>
        </label>
        <a
          href={apiUrl('/reset-password.php')}
          className="forgot-link"
          style={{ display: showForgot ? 'block' : 'none' }}
        >
          Forget Password?
        </a>
      </div>

      <button className="login-btn" type="submit" disabled={submitting}>
        <span>{submitting ? '…' : 'Login'}</span>
      </button>
    </form>
  )
}
