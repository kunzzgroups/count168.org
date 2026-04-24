import type { OwnerCompany } from '../../types/dashboard'

/** Process List 内 GroupID / Company 药丸与 `useTransactionWorkspace` 对齐 */
export type ProcessListWorkspacePick = {
  groupIds: string[]
  selectedGroup: string | null
  setGroup: (g: string | null, opts?: { preferredCompanyId?: number | null }) => void
  scopeCompanies: OwnerCompany[]
  activeCompanyId: number
  onPickCompany: (id: number) => void
}
