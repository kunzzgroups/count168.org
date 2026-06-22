import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as captureMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as captureMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as captureMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveCaptureMaintenanceScope,
};

/** Group entity, C168, or bank-only company payroll: SALARY / BONUS / COMMISSION / PROFIT process list. */
export function captureMaintenanceUsesGroupProcesses(scope) {
  if (!scope) return false;
  if (scope.c168Channel || scope.companyPayrollChannel) return true;
  return scope.mode === "group";
}

/** Query params for capture maintenance search / delete APIs. */
export function captureMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  // Company payroll channel (C168 / bank-only): company ledger only — never group_only.
  if (scope.c168Channel || scope.companyPayrollChannel) {
    const companyId = scope.scopeCompanyId ?? scope.uiCompanyId ?? undefined;
    return {
      companyId,
      viewGroup: scope.viewGroup || scope.groupId || undefined,
      reportScope: "company",
    };
  }
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
