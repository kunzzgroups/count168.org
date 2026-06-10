import CompanySettingsModal from "./CompanySettingsModal.jsx";

/**
 * Group Settings — same UX as Company Settings; persists via domain save (groups table).
 */
export default function GroupSettingsModal({ group, ...rest }) {
  const company = {
    ...group,
    company_id: group?.group_code ?? "",
  };
  return <CompanySettingsModal tenantType="group" company={company} {...rest} />;
}
