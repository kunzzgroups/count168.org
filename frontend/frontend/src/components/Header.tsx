import { Link, NavLink, useNavigate } from 'react-router-dom'
import { AUTH_TOKEN_STORAGE_KEY } from '@/config/auth'

export function Header() {
  const navigate = useNavigate()

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    navigate('/', { replace: true })
  }

  return (
    <header className="app-header">
      <Link to="/home" className="app-header__brand">
        count168
      </Link>
      <nav className="app-header__nav" aria-label="Main">
        <NavLink to="/home" end>
          Modules
        </NavLink>
        <NavLink to="/capture-maintenance">Data capture maint.</NavLink>
        <NavLink to="/datacapture-summary">DC summary</NavLink>
        <NavLink to="/stock">C168 maint.</NavLink>
        <button type="button" className="app-header__logout" onClick={logout}>
          Log out
        </button>
      </nav>
    </header>
  )
}
