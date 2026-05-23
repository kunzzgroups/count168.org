import { useCallback, useMemo, useState } from "react";
import {
  applySharedGroupClickWithCompanySwitch,
  filterMaintenanceVisibleCompanies,
  sortedUniqueGroupIds,
  toggleGroupFilterKind,
} from "../../../utils/company/sharedCompanyFilter.js";

/**
 * Maintenance 各页 Group / Company 筛选（对齐 Process List、Account List 的 groupFilterKind 行为）。
 */
export function useMaintenanceGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  switchCompany,
  switchingCompany = false,
}) {
  const [groupFilterKind, setGroupFilterKind] = useState("follow");

  const snapGroupIds = useMemo(() => sortedUniqueGroupIds(companies), [companies]);

  const visibleCompanies = useMemo(
    () =>
      filterMaintenanceVisibleCompanies(companies, {
        groupFilterKind,
        selectedGroup,
        groupIds: snapGroupIds,
        preferredCompanyId: companyId,
      }),
    [companies, groupFilterKind, selectedGroup, snapGroupIds, companyId],
  );

  const handlePickAllGroups = useCallback(() => {
    if (switchingCompany) return;
    setGroupFilterKind((k) => toggleGroupFilterKind(k));
  }, [switchingCompany]);

  const handleGroupClick = useCallback(
    async (gid) => {
      setGroupFilterKind("follow");
      await applySharedGroupClickWithCompanySwitch({
        clickedGroupId: gid,
        currentSelectedGroup: selectedGroup,
        companies,
        currentCompanyId: companyId,
        setSelectedGroup,
        switchCompany,
      });
    },
    [selectedGroup, companies, companyId, setSelectedGroup, switchCompany],
  );

  const followCurrentCompanyGroup = useCallback(() => {
    setGroupFilterKind("follow");
  }, []);

  return {
    groupFilterKind,
    snapGroupIds,
    visibleCompanies,
    handlePickAllGroups,
    handleGroupClick,
    followCurrentCompanyGroup,
  };
}
