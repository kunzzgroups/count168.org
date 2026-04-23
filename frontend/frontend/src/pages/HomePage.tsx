import { Link } from 'react-router-dom'
import { API_BASE_URL } from '@/config/api'
import { phpPagePath } from '@/lib/phpOrigin'

const spaModules: { to: string; title: string; note: string }[] = [
  {
    to: '/stock',
    title: 'C168 maintenance marquee',
    note: 'List / create / edit / delete via API (was StockPage placeholder name).',
  },
  {
    to: '/capture-maintenance',
    title: 'Data Capture maintenance',
    note: 'Search + batch delete via XHR (no full page reload).',
  },
  {
    to: '/datacapture-summary',
    title: 'Data Capture summary (API shell)',
    note: 'Loads currencies/accounts + get_summary_state; full grid still on classic PHP.',
  },
]

const legacyPhp: { href: string; title: string; note: string }[] = [
  {
    href: phpPagePath('/datacapture.php'),
    title: 'Data Capture (classic)',
    note: 'Large JS bundle; migrate incrementally. Set VITE_PHP_ORIGIN in dev if PHP runs on another port.',
  },
  {
    href: phpPagePath('/datacapturesummary.php'),
    title: 'Data Capture summary (classic)',
    note: 'Uses summary_api.php; full UI still in PHP/JS.',
  },
  {
    href: phpPagePath('/capture_maintenance.php'),
    title: 'Data Capture maintenance (classic)',
    note: 'Original styled page; React version is /capture-maintenance.',
  },
]

export function HomePage() {
  return (
    <section className="page home-page">
      <h1>Module hub</h1>
      <p>
        API base: <code>{API_BASE_URL}</code>
      </p>

      <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>React (SPA)</h2>
      <ul style={{ textAlign: 'left', maxWidth: 560 }}>
        {spaModules.map((m) => (
          <li key={m.to} style={{ marginBottom: 12 }}>
            <Link to={m.to}>{m.title}</Link>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{m.note}</div>
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Classic PHP (same DB / session)</h2>
      <ul style={{ textAlign: 'left', maxWidth: 560 }}>
        {legacyPhp.map((m) => (
          <li key={m.href} style={{ marginBottom: 12 }}>
            <a href={m.href} rel="noreferrer">
              {m.title}
            </a>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{m.note}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}
