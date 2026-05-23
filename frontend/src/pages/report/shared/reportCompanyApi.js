import { buildApiUrl } from "../../../utils/core/apiUrl.js";

export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return [];
}

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

export async function fetchCurrencies(companyId) {
  let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
  if (companyId) url += `?company_id=${companyId}`;
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load currencies");
  }
  return json.data || [];
}
