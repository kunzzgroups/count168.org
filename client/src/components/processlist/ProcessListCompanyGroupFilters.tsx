import type { OwnerCompany } from '../../types/dashboard'

type Props = {
  groupIds: string[]
  selectedGroup: string | null
  onSetGroup: (g: string | null) => void
  scopeCompanies: OwnerCompany[]
  activeCompanyId: number
  onPickCompany: (id: number) => void
}

/**
 * 与 `includes/company_filter.php` + 经典 Process List Bank 操作区一致：GroupID 与 Company 药丸。
 */
export function ProcessListCompanyGroupFilters({
  groupIds,
  selectedGroup,
  onSetGroup,
  scopeCompanies,
  activeCompanyId,
  onPickCompany,
}: Props) {
  const showGroup = groupIds.length > 0

  return (
    <>
      {showGroup ? (
        <div
          className="process-company-filter shared-group-wrapper"
          id="processListSpaGroupButtons"
        >
          <span className="process-company-label">GroupID:</span>
          <div className="process-company-buttons">
            {groupIds.map((gid) => (
              <button
                key={gid}
                type="button"
                className={
                  'process-company-btn shared-group-btn' +
                  (selectedGroup != null && String(selectedGroup).toUpperCase() === gid ? ' active' : '')
                }
                data-group-id={gid}
                onClick={() => onSetGroup(gid)}
              >
                {gid}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {scopeCompanies.length > 0 ? (
        <div
          className="process-company-filter shared-company-wrapper"
          id="processListSpaCompanyButtons"
        >
          <span className="process-company-label">Company:</span>
          <div className="process-company-buttons">
            {scopeCompanies.map((c) => {
              const code = String(c.company_id || '').trim()
              const gid = c.group_id ? String(c.group_id).toUpperCase() : ''
              return (
                <button
                  key={c.id}
                  type="button"
                  className={
                    'process-company-btn shared-company-btn' +
                    (Number(activeCompanyId) === Number(c.id) ? ' active' : '')
                  }
                  data-company-id={c.id}
                  data-group-id={gid}
                  data-company-code={code}
                  onClick={() => onPickCompany(Number(c.id))}
                >
                  {code || `#${c.id}`}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}
