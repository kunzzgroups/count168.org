const prefetchedModules = new Set();
const prefetchedData = new Set();

/** Routes still synchronously imported in App.jsx (skip duplicate prefetch). */
const EAGER_ROUTE_PATHS = new Set([
  "/login",
  "/reset-password",
  "/owner-secondary-password",
  "/user-secondary-password",
]);

function prefetchModule(key, loader) {
  if (prefetchedModules.has(key)) return;
  prefetchedModules.add(key);
  void loader().catch(() => {
    prefetchedModules.delete(key);
  });
}

/** Warm remaining lazy routes in parallel right after session boot. */
export function prefetchAuthenticatedRoutes() {
  const routes = [
    "/dashboard",
    "/domain",
    "/ownership",
    "/process-list",
    "/bank-process-list",
    "/datacapture",
    "/datacapturesummary",
    "/transaction",
    "/customer-report",
    "/domain-report",
    "/capture-maintenance",
    "/transaction-maintenance",
    "/formula-maintenance",
    "/bankprocess-maintenance",
    "/payment-maintenance",
    "/useraccess",
    "/deleted-log",
  ];
  routes.forEach((path) => prefetchRouteModule(path));
}

/** Prefetch route JS chunk on sidebar hover / pointer down. */
export function prefetchRouteModule(pathname) {
  const path = String(pathname || "").split("?")[0];
  if (EAGER_ROUTE_PATHS.has(path)) return;
  switch (path) {
    case "/dashboard":
      prefetchModule(path, () => import("../../pages/dashboard/TransactionDashboardPage.jsx"));
      break;
    case "/domain":
      prefetchModule(path, () => import("../../pages/domain/DomainPage.jsx"));
      break;
    case "/ownership":
      prefetchModule(path, () => import("../../pages/ownership/OwnershipPage.jsx"));
      break;
    case "/bank-process-list":
      prefetchModule(path, () => import("../../pages/bankprocesslist/BankProcessListPage.jsx"));
      break;
    case "/process-list":
    case "/games-process-list":
      prefetchModule(path, () => import("../../pages/processlist/ProcessListPage.jsx"));
      break;
    case "/datacapture":
      prefetchModule(path, () => import("../../pages/datacapture/DataCapturePage.jsx"));
      break;
    case "/datacapturesummary":
      prefetchModule(path, () => import("../../pages/datacapturesummary/DataCaptureSummaryPage.jsx"));
      break;
    case "/transaction":
      prefetchModule(path, () => import("../../pages/transaction/TransactionPaymentPage.jsx"));
      break;
    case "/customer-report":
      prefetchModule(path, () => import("../../pages/report/customer/CustomerReportPage.jsx"));
      break;
    case "/domain-report":
      prefetchModule(path, () => import("../../pages/report/domain/DomainReportPage.jsx"));
      break;
    case "/capture-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/capture/CaptureMaintenancePage.jsx"));
      break;
    case "/transaction-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/transaction/TransactionMaintenancePage.jsx"));
      break;
    case "/formula-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/formula/FormulaMaintenancePage.jsx"));
      break;
    case "/bankprocess-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx"));
      break;
    case "/payment-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/payment/PaymentMaintenancePage.jsx"));
      break;
    case "/useraccess":
      prefetchModule(path, () => import("../../pages/useraccess/UserAccessPage.jsx"));
      break;
    case "/deleted-log":
      prefetchModule(path, () => import("../../pages/deletedlog/DeletedLogPage.jsx"));
      break;
    default:
      break;
  }
}

/** Warm auto-renew list API so first paint is faster after navigation. */
export function prefetchAutoRenewList() {
  const key = "auto-renew:pending";
  if (prefetchedData.has(key)) return;
  prefetchedData.add(key);
  import("../../pages/autorenew/autoRenewRoutePrefetch.js")
    .then(({ prefetchAutoRenewApprovals }) => prefetchAutoRenewApprovals("pending"))
    .catch(() => {
      prefetchedData.delete(key);
    });
}
