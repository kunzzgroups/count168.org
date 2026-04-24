import { Link, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, apiUrl } from '../../lib/api'
import { publicAsset } from '../../lib/publicAsset'
import type { SidebarContext } from '../../types/sidebarContext'
import type { DashboardBootstrapData } from '../../types/dashboard'

type Props = {
  context: SidebarContext
  bootstrap: DashboardBootstrapData
  onCloseMobile?: () => void
}

const NAV_HIDDEN_FOR_EXTERNAL = new Set([
  'admin',
  'account',
  'process',
  'datacapture',
  'payment',
  'maintenance',
])

function hasPerm(permissions: string[], key: string): boolean {
  if (!permissions || permissions.length === 0) return true
  return permissions.includes(key)
}

function canNavItem(
  permissions: string[],
  key: string,
  isExternalView: boolean,
): boolean {
  if (!hasPerm(permissions, key)) return false
  if (!isExternalView) return true
  return !NAV_HIDDEN_FOR_EXTERNAL.has(key)
}

function phref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return apiUrl(p)
}

const AVATAR_IDS = {
  male: ['male1', 'male2', 'male3', 'male4', 'male5', 'male6', 'male7', 'male8', 'male9'] as const,
  female: [
    'female1',
    'female2',
    'female3',
    'female4',
    'female5',
    'female6',
    'female7',
    'female8',
    'female9',
  ] as const,
}

function readSavedAvatarId(): string {
  try {
    const ls = localStorage.getItem('selectedAvatar')
    if (ls && /^(male|female)\d+$/.test(ls)) return ls
  } catch {
    /* ignore */
  }
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )selectedAvatar=([^;]*)/) : null
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return 'male1'
}

function avatarSrc(id: string): string {
  if (id.startsWith('male')) {
    const n = id.replace(/^male/, '')
    return apiUrl(`/images/avatar${n}.png`)
  }
  if (id.startsWith('female')) {
    const n = id.replace(/^female/, '')
    return apiUrl(`/images/female${n}.png`)
  }
  return apiUrl('/images/avatar1.png')
}

type Countdown = { text: string; status: 'expired' | 'warning' | 'normal' }

function calculateCountdown(expirationDate: string): Countdown | null {
  if (!expirationDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expirationDate)
  exp.setHours(0, 0, 0, 0)
  const diffTime = exp.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: 'Expired', status: 'expired' }
  if (diffDays === 0) return { text: 'Expires today', status: 'warning' }
  if (diffDays <= 7)
    return { text: `${diffDays} day${diffDays > 1 ? 's' : ''} left`, status: 'warning' }
  if (diffDays <= 30) return { text: `${diffDays} days left`, status: 'normal' }
  const months = Math.floor(diffDays / 30)
  const days = diffDays % 30
  if (days === 0) return { text: `${months} month${months > 1 ? 's' : ''} left`, status: 'normal' }
  return { text: `${months}m ${days}d left`, status: 'normal' }
}

type AnnouncementRow = { title: string; content: string; created_at: string }

function useBankCategoryFlag(companyCode: string) {
  const [isBankCategory, setIsBankCategory] = useState(false)

  const read = useCallback(() => {
    const c = companyCode.trim()
    if (!c) {
      setIsBankCategory(false)
      return
    }
    let raw = localStorage.getItem('selectedPermission_' + c.toUpperCase())
    if (raw === 'Gambling') raw = 'Games'
    setIsBankCategory(raw === 'Bank')
  }, [companyCode])

  useEffect(() => {
    read()
    window.addEventListener('storage', read)
    window.addEventListener('c168:company-session-updated', read)
    return () => {
      window.removeEventListener('storage', read)
      window.removeEventListener('c168:company-session-updated', read)
    }
  }, [read])

  return isBankCategory
}

/**
 * 与 `sidebar.php` 结构一致：白 logo、通知铃、头像选择、informationmenu-content、footer、通知浮层。
 */
export function ClassicInformationMenu({ context: ctx, bootstrap, onCloseMobile }: Props) {
  const { pathname } = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)
  const reportWrapRef = useRef<HTMLDivElement>(null)
  const maintWrapRef = useRef<HTMLDivElement>(null)
  const [sidebarFlyout, setSidebarFlyout] = useState<
    null | { kind: 'report' | 'maintenance'; left: number; top: number }
  >(null)
  const flyoutHideTimerRef = useRef<number | null>(null)

  const clearFlyoutHide = useCallback(() => {
    if (flyoutHideTimerRef.current != null) {
      window.clearTimeout(flyoutHideTimerRef.current)
      flyoutHideTimerRef.current = null
    }
  }, [])

  const scheduleFlyoutHide = useCallback(() => {
    clearFlyoutHide()
    flyoutHideTimerRef.current = window.setTimeout(() => setSidebarFlyout(null), 100)
  }, [clearFlyoutHide])

  const positionFlyout = useCallback(
    (kind: 'report' | 'maintenance', wrap: HTMLElement | null) => {
      if (!wrap) return
      const title = wrap.querySelector('.informationmenu-section-title')
      const sidebarEl = wrap.closest('.informationmenu')
      if (!title || !sidebarEl) return
      const titleRect = title.getBoundingClientRect()
      const sidebarRect = sidebarEl.getBoundingClientRect()
      clearFlyoutHide()
      setSidebarFlyout({ kind, left: sidebarRect.right, top: titleRect.top })
    },
    [clearFlyoutHide],
  )

  useEffect(() => () => clearFlyoutHide(), [clearFlyoutHide])

  useEffect(() => {
    setSidebarFlyout(null)
  }, [pathname])
  const { permissions, isMember, isExternalView: ext, hasC168DomainPageAccess, companyHasGambling, companyHasBank } =
    ctx
  const companyCode = ctx.companyCode ?? ''
  const isBankCategory = useBankCategoryFlag(companyCode)

  const [avatarId, setAvatarId] = useState(readSavedAvatarId)
  const [gender, setGender] = useState<'male' | 'female'>(() =>
    readSavedAvatarId().startsWith('female') ? 'female' : 'male',
  )
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifRows, setNotifRows] = useState<AnnouncementRow[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState(false)

  const expDate = ctx.expiration?.date ?? ''
  const [expLive, setExpLive] = useState<Countdown | null>(() =>
    expDate ? calculateCountdown(expDate) : null,
  )

  useEffect(() => {
    if (!expDate) {
      setExpLive(null)
      return
    }
    const tick = () => setExpLive(calculateCountdown(expDate))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [expDate])

  const showHome = permissions.length === 0 || permissions.includes('home')

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (document.getElementById('avatarOptions')?.contains(t)) return
      if (document.getElementById('currentAvatar')?.contains(t)) return
      setAvatarMenuOpen(false)
    }
    if (avatarMenuOpen) document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [avatarMenuOpen])

  useEffect(() => {
    if (!notifOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (document.querySelector('.notification-bell')?.contains(t)) return
      if (document.getElementById('notificationPanel')?.contains(t)) return
      setNotifOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [notifOpen])

  useEffect(() => {
    if (!notifOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [notifOpen])

  const loadAnnouncements = useCallback(async () => {
    setNotifLoading(true)
    setNotifError(false)
    try {
      const res = await apiFetch('/api/announcements/announcement_get_dashboard_api.php')
      const result = await res.json()
      if (result.success && Array.isArray(result.data)) {
        setNotifRows(result.data as AnnouncementRow[])
      } else {
        setNotifRows([])
      }
    } catch {
      setNotifRows([])
      setNotifError(true)
    } finally {
      setNotifLoading(false)
    }
  }, [])

  const toggleNotif = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setNotifOpen((o) => {
      if (o) return false
      void loadAnnouncements()
      return true
    })
  }

  const selectAvatar = (id: string) => {
    setAvatarId(id)
    setAvatarMenuOpen(false)
    try {
      localStorage.setItem('selectedAvatar', id)
    } catch {
      /* ignore */
    }
    document.cookie = `selectedAvatar=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`
    if (id.startsWith('female')) setGender('female')
    else setGender('male')
  }

  const onLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      const u = phref('dashboard.php?logout=1')
      const top = window.top
      if (top != null && top !== window.self) top.location.assign(u)
      else window.location.assign(u)
    }
  }

  const roleDisplay = (ctx.role || '').charAt(0).toUpperCase() + (ctx.role || '').slice(1).toLowerCase()
  const loginId = bootstrap.userData.login_id || ''

  const maintHas = !ext && (permissions.length === 0 || permissions.includes('maintenance'))
  const showMaintCapture = maintHas && companyHasGambling && !isBankCategory
  const showMaintTransaction = maintHas && companyHasGambling && !isBankCategory
  const showMaintPayment = maintHas
  const showMaintFormula = companyHasGambling && !isBankCategory
  let showMaintProcess = false
  if (maintHas && companyHasBank) {
    if (!companyHasGambling) showMaintProcess = true
    else showMaintProcess = isBankCategory
  }

  const go = () => onCloseMobile?.()

  return (
    <div
      ref={rootRef}
      className="classic-informationmenu-root"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div className="informationmenu-header">
        <div className="header-logo-section">
          <img
            src={apiUrl('/images/count_whitelogo.png')}
            alt="EAZYCOUNT Logo"
            className="header-logo"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = publicAsset('images/count_logo.png')
            }}
          />
          <div className="notification-bell" title="Notifications" onClick={toggleNotif} role="presentation">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
            </svg>
          </div>
        </div>

        <div className="user-info-container">
          <div className="avatar-selector-container">
            <div
              className="current-avatar"
              id="currentAvatar"
              onClick={() => setAvatarMenuOpen((o) => !o)}
              role="presentation"
            >
              <img
                id="currentAvatarImg"
                className="current-avatar-img"
                src={avatarSrc(avatarId)}
                data-avatar-id={avatarId}
                alt="Avatar"
                fetchPriority="high"
              />
            </div>

            <div className={`avatar-options${avatarMenuOpen ? ' show' : ''}`} id="avatarOptions">
              <div className="options-title">Choose Avatar</div>
              <div className="gender-selection" id="genderSelection">
                <button
                  type="button"
                  className={`gender-btn${gender === 'male' ? ' active' : ''}`}
                  onClick={() => setGender('male')}
                >
                  Male
                </button>
                <button
                  type="button"
                  className={`gender-btn${gender === 'female' ? ' active' : ''}`}
                  onClick={() => setGender('female')}
                >
                  Female
                </button>
              </div>
              <div className={`avatar-list${gender === 'male' ? ' show' : ''}`} id="maleAvatarList">
                {AVATAR_IDS.male.map((id) => (
                  <div
                    key={id}
                    className={`avatar-option${avatarId === id ? ' selected' : ''}`}
                    data-avatar-id={id}
                    onClick={() => selectAvatar(id)}
                    role="presentation"
                  >
                    <img src={avatarSrc(id)} alt="" className="avatar-option-img" />
                  </div>
                ))}
              </div>
              <div className={`avatar-list${gender === 'female' ? ' show' : ''}`} id="femaleAvatarList">
                {AVATAR_IDS.female.map((id) => (
                  <div
                    key={id}
                    className={`avatar-option${avatarId === id ? ' selected' : ''}`}
                    data-avatar-id={id}
                    onClick={() => selectAvatar(id)}
                    role="presentation"
                  >
                    <img src={avatarSrc(id)} alt="" className="avatar-option-img" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="user-avatar-dropdown">
            <div className="user-info">
              <div className="user-name">{loginId}</div>
              <div className="user-role">{roleDisplay}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="informationmenu-content">
        <div className="content-separator" />

        {isMember ? (
          <div className="informationmenu-section">
            <a
              className="informationmenu-section-title account-direct"
              data-page="member.php"
              href={phref('member.php')}
              onClick={go}
            >
              <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
              </svg>
              Win/Loss
            </a>
          </div>
        ) : (
          <>
            {showHome && (
              <div className="informationmenu-section">
                <Link
                  to="/dashboard"
                  className={`informationmenu-section-title${pathname === '/dashboard' ? ' current-page' : ''}`}
                  data-page="dashboard.php"
                  onClick={go}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                  </svg>
                  Home
                </Link>
              </div>
            )}

            {hasC168DomainPageAccess && (
              <div className="informationmenu-section">
                <a className="informationmenu-section-title" data-page="domain.php" href={phref('domain.php')} onClick={go}>
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                  </svg>
                  Domain
                </a>
              </div>
            )}

            {hasC168DomainPageAccess && (
              <div className="informationmenu-section">
                <a
                  className="informationmenu-section-title account-direct"
                  data-page="announcement.php"
                  href={phref('announcement.php')}
                  onClick={go}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                  Announcement
                </a>
              </div>
            )}

            {canNavItem(permissions, 'admin', ext) && (
              <div className="informationmenu-section">
                <a
                  className="informationmenu-section-title account-direct"
                  data-page="userlist.php"
                  href={phref('userlist.php')}
                  onClick={go}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  Admin
                </a>
              </div>
            )}

            {canNavItem(permissions, 'account', ext) && (
              <>
                <div className="informationmenu-section">
                  <Link
                    to="/accounts"
                    className={`informationmenu-section-title account-direct${pathname === '/accounts' ? ' current-page' : ''}`}
                    data-page="account-list.php"
                    onClick={go}
                  >
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                    Account
                  </Link>
                </div>
                <div className="informationmenu-section">
                  <a
                    className="informationmenu-section-title account-direct"
                    data-page="ownership.php"
                    href={phref('ownership.php')}
                    onClick={go}
                  >
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                    Ownership
                  </a>
                </div>
              </>
            )}

            {canNavItem(permissions, 'process', ext) && (
              <div className="informationmenu-section">
                <a className="informationmenu-section-title" data-page="processlist.php" href={phref('processlist.php')} onClick={go}>
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  Process
                </a>
              </div>
            )}

            {canNavItem(permissions, 'datacapture', ext) && (
              <div
                className="informationmenu-section"
                id="sidebar-datacapture-section"
                style={{ display: companyHasGambling ? undefined : 'none' }}
              >
                <Link
                  to="/datacapture"
                  className={`informationmenu-section-title${pathname === '/datacapture' ? ' current-page' : ''}`}
                  data-page="datacapture.php"
                  onClick={go}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                  </svg>
                  Data Capture
                </Link>
              </div>
            )}

            {canNavItem(permissions, 'payment', ext) && (
              <div className="informationmenu-section">
                <Link
                  to="/transaction"
                  className={`informationmenu-section-title${pathname === '/transaction' ? ' current-page' : ''}`}
                  data-page="transaction.php"
                  onClick={go}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                  </svg>
                  Transaction Payment
                </Link>
              </div>
            )}

            {canNavItem(permissions, 'report', ext) && (
              <div
                className="informationmenu-section"
                id="sidebar-report-section"
                style={{ display: companyHasGambling ? undefined : 'none' }}
              >
                <div
                  ref={reportWrapRef}
                  className="menu-item-wrapper"
                  onMouseEnter={() => positionFlyout('report', reportWrapRef.current)}
                  onMouseLeave={scheduleFlyoutHide}
                  onMouseMove={() => positionFlyout('report', reportWrapRef.current)}
                >
                  <div className="informationmenu-section-title" data-section="report">
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                    </svg>
                    Report
                    <span className="section-arrow">▶</span>
                  </div>
                </div>
              </div>
            )}

            {!ext && (
              <div className="informationmenu-section">
                <div
                  ref={maintWrapRef}
                  className="menu-item-wrapper"
                  onMouseEnter={() => positionFlyout('maintenance', maintWrapRef.current)}
                  onMouseLeave={scheduleFlyoutHide}
                  onMouseMove={() => positionFlyout('maintenance', maintWrapRef.current)}
                >
                  <div className="informationmenu-section-title" data-section="maintenance">
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                    </svg>
                    Maintenance
                    <span className="section-arrow">▶</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="informationmenu-footer">
        {expDate && expLive && (
          <div className={`company-expiration-countdown ${expLive.status}`} id="companyExpirationCountdown">
            <svg
              className="expiration-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">Exp:</span>
              <span className={`expiration-countdown-text ${expLive.status}`} id="expirationCountdownText">
                {expLive.text}
              </span>
            </div>
          </div>
        )}
        <button type="button" className="btn logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>

      {createPortal(
        <>
          <div
            className={`notification-overlay${notifOpen ? ' show' : ''}`}
            id="notificationOverlay"
            onClick={() => setNotifOpen(false)}
            role="presentation"
            aria-hidden={!notifOpen}
          />
          <div
            className={`notification-panel${notifOpen ? ' show' : ''}`}
            id="notificationPanel"
            role="dialog"
            aria-label="Announcements"
          >
            <div className="notification-header">
              <h2>Announcements</h2>
              <button type="button" className="notification-close" onClick={() => setNotifOpen(false)} title="关闭">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="notification-content" id="notificationContent">
              {notifLoading && (
                <div className="notification-empty">
                  <p>Loading…</p>
                </div>
              )}
              {!notifLoading && notifError && (
                <div className="notification-empty">
                  <p>Failed to load announcements</p>
                </div>
              )}
              {!notifLoading &&
                !notifError &&
                notifRows.length > 0 &&
                notifRows.map((a, i) => (
                  <div key={i} className="notification-item unread" role="presentation">
                    <div className="notification-title">{a.title}</div>
                    <div className="notification-message">{a.content}</div>
                    <div className="notification-time">{a.created_at}</div>
                  </div>
                ))}
              {!notifLoading && !notifError && notifRows.length === 0 && (
                <div className="notification-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                  <p>No announcements</p>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

      {createPortal(
        sidebarFlyout && (
          <div
            className="submenu classic-informationmenu-submenu-portal"
            id={sidebarFlyout.kind === 'report' ? 'report-submenu' : 'maintenance-submenu'}
            style={{
              position: 'fixed',
              left: sidebarFlyout.left,
              top: sidebarFlyout.top,
              opacity: 1,
              visibility: 'visible',
              transform: 'translateX(0)',
              pointerEvents: 'auto',
              zIndex: 3000,
            }}
            onMouseEnter={clearFlyoutHide}
            onMouseLeave={scheduleFlyoutHide}
          >
            <div className="submenu-content">
              {sidebarFlyout.kind === 'report' ? (
                <>
                  <a href={phref('customer_report.php')} className="submenu-item" onClick={go}>
                    <span>Customer Report</span>
                  </a>
                  <a href={phref('domain_report.php')} className="submenu-item" onClick={go}>
                    <span>Domain Report</span>
                  </a>
                </>
              ) : (
                <>
                  {showMaintCapture && (
                    <a
                      href={phref('capture_maintenance.php')}
                      className="submenu-item"
                      id="maintenance-capture-link"
                      onClick={go}
                    >
                      <span>Data Capture</span>
                    </a>
                  )}
                  {showMaintTransaction && (
                    <a
                      href={phref('transaction_maintenance.php')}
                      className="submenu-item"
                      id="maintenance-transaction-link"
                      onClick={go}
                    >
                      <span>Transaction</span>
                    </a>
                  )}
                  {showMaintPayment && (
                    <a href={phref('payment_maintenance.php')} className="submenu-item" onClick={go}>
                      <span>Payment</span>
                    </a>
                  )}
                  {showMaintFormula && (
                    <a
                      href={phref('formula_maintenance.php')}
                      className="submenu-item"
                      id="maintenance-formula-link"
                      onClick={go}
                    >
                      <span>Formula</span>
                    </a>
                  )}
                  {showMaintProcess && (
                    <a
                      href={phref('bankprocess_maintenance.php')}
                      className="submenu-item"
                      id="maintenance-process-link"
                      onClick={go}
                    >
                      <span>Process</span>
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  )
}
