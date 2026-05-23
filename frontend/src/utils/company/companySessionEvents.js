/**
 * Call after `update_company_session_api.php` succeeds so AuthenticatedLayout
 * refetches `current_user_api.php` (Domain / Announcement visibility, company flags).
 */
export function notifyCompanySessionUpdated() {
  window.dispatchEvent(new CustomEvent("eazycount:company-session-updated"));
}
