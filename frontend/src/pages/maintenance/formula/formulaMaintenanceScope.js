import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as formulaMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as formulaMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as formulaMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveFormulaMaintenanceScope,
};

/** Group entity scope: SALARY / BONUS only (aligned with Capture Maintenance). */
export function formulaMaintenanceUsesGroupProcesses(scope) {
  return scope?.mode === "group";
}

/** Query params for formula maintenance list / update / delete APIs. */
export function formulaMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  const base = customerReportScopeApiParams(scope);
  const out = {
    ...base,
    reportScope: scope.mode,
  };
  if (scope.mode === "group") {
    out.groupOnly = true;
    out.groupAggregate = true;
  }
  return out;
}

/** Numeric company id for API body/query; omit when group resolves via group_id only. */
export function formulaMaintenanceEffectiveCompanyId(scope, uiCompanyId = null) {
  const fromScope = Number(scope?.scopeCompanyId);
  if (fromScope > 0) return fromScope;
  const fromUi = Number(uiCompanyId);
  if (fromUi > 0) return fromUi;
  return undefined;
}
