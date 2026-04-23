import type { Role } from './types'

type RoleTabsProps = {
  role: Role
  onSelect: (r: Role) => void
}

/**
 * 对应 `index.php` 中
 * `div.role-tabs` + `#admin-tab` / `#member-tab`
 */
export function RoleTabs({ role, onSelect }: RoleTabsProps) {
  return (
    <div className="role-tabs" role="tablist" aria-label="Login role">
      <button
        type="button"
        className={`role-tab ${role === 'admin' ? 'active' : ''}`}
        id="admin-tab"
        role="tab"
        aria-selected={role === 'admin'}
        onClick={() => onSelect('admin')}
      >
        Admin
      </button>
      <button
        type="button"
        className={`role-tab ${role === 'member' ? 'active' : ''}`}
        id="member-tab"
        role="tab"
        aria-selected={role === 'member'}
        onClick={() => onSelect('member')}
      >
        Member
      </button>
    </div>
  )
}
