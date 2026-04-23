import { Link, NavLink } from 'react-router-dom'

export function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="app-header__brand">
        count168
      </Link>
      <nav className="app-header__nav" aria-label="Main">
        <NavLink to="/" end>
          Home
        </NavLink>
      </nav>
    </header>
  )
}
