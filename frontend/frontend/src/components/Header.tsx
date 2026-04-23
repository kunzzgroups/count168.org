import { Link, NavLink } from 'react-router-dom'

export function Header() {
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
      </nav>
    </header>
  )
}
