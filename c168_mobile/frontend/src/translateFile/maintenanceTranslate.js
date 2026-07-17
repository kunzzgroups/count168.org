import { DASHBOARD_I18N } from "./dashboardTranslate.js";
import { createGetText } from "./i18nHelpers.js";

/** Mobile Maintenance (Transaction + Payment) dictionary. Spreads dashboard nav labels for MobileShell. */
export const MAINTENANCE_I18N = {
  en: {
    ...DASHBOARD_I18N.en,

    // More entry
    maintenance: "Maintenance",
    maintenanceDescription: "Transaction and payment records.",
    maintenanceBadge: "MAINTENANCE",

    // Hub
    hubTitle: "Maintenance Centre",
    hubSubtitle: "Review operational records and manage data.",
    sectionRecords: "Records",
    sectionSetup: "Setup",
    comingSoon: "Coming soon",

    txMaintenanceTitle: "Transaction Maintenance",
    txMaintenanceDesc: "Review transaction and data capture records.",
    txFeatures: "Audit records · Read only · Filters",

    payMaintenanceTitle: "Payment Maintenance",
    payMaintenanceDesc: "Review and remove payment records.",
    payFeatures: "Payment history · Deleted records",
    deleteAccess: "Delete access",

    setupDataCapture: "Data Capture",
    setupFormula: "Formula",
    setupBank: "Bank Process",

    // Scope
    scope: "Scope",
    company: "Company",
    group: "Group",
    selectScope: "Select scope",
    groupAggregate: "Group (all companies)",
    apply: "Apply",
    cancel: "Cancel",

    // Filters
    filter: "Filter",
    dateRange: "Date range",
    dateFrom: "From",
    dateTo: "To",
    category: "Category",
    transactionType: "Transaction type",
    allTypes: "All",
    allProcesses: "All processes",
    keyword: "Keyword",
    searchPlaceholder: "Account, description or remark",
    showResults: "Show results",
    reset: "Reset",
    readOnlyNote: "Transaction Maintenance is read-only.",

    // Card / row labels
    process: "Process",
    product: "Product",
    account: "Account",
    accountTo: "To",
    accountFrom: "From",
    description: "Description",
    remark: "Remark",
    currency: "Currency",
    rate: "Rate",
    amount: "Amount",
    submitter: "By",
    deletedBy: "Deleted by",
    deletedTag: "DELETED",

    // States
    loading: "Loading…",
    noData: "No records found. Adjust filters and try again.",
    loadFailed: "Failed to load records.",
    foundRecords: "Found {n} record(s)",

    // Payment delete
    selectedCount: "{n} selected",
    delete: "Delete",
    deleteRecords: "Delete records",
    deleteConfirmTitle: "Delete {n} payment record(s)?",
    deleteConfirmBody:
      "Deleted records stay visible in payment history. Related RATE entries may also be removed.",
    cannotUndo: "This action cannot be undone.",
    deleteSuccess: "Deleted {n} record(s)",
    deleteFailed: "Delete failed",
    selectAtLeastOne: "Please select at least one record",
    notSelectable: "This row cannot be deleted",
  },
  zh: {
    ...DASHBOARD_I18N.zh,

    maintenance: "维护",
    maintenanceDescription: "交易与支付记录。",
    maintenanceBadge: "维护",

    hubTitle: "维护中心",
    hubSubtitle: "查看业务记录并管理数据。",
    sectionRecords: "记录",
    sectionSetup: "设置",
    comingSoon: "即将上线",

    txMaintenanceTitle: "交易维护",
    txMaintenanceDesc: "查看交易与数据采集记录。",
    txFeatures: "审计记录 · 只读 · 筛选",

    payMaintenanceTitle: "支付维护",
    payMaintenanceDesc: "查看并删除支付记录。",
    payFeatures: "支付历史 · 删除记录",
    deleteAccess: "删除权限",

    setupDataCapture: "数据采集",
    setupFormula: "公式",
    setupBank: "银行流程",

    scope: "范围",
    company: "公司",
    group: "集团",
    selectScope: "选择范围",
    groupAggregate: "集团（所有公司）",
    apply: "应用",
    cancel: "取消",

    filter: "筛选",
    dateRange: "日期范围",
    dateFrom: "开始",
    dateTo: "结束",
    category: "类别",
    transactionType: "交易类型",
    allTypes: "全部",
    allProcesses: "全部流程",
    keyword: "关键词",
    searchPlaceholder: "账号、说明或备注",
    showResults: "查看结果",
    reset: "重置",
    readOnlyNote: "交易维护为只读页面。",

    process: "流程",
    product: "产品",
    account: "账户",
    accountTo: "入账",
    accountFrom: "出账",
    description: "说明",
    remark: "备注",
    currency: "币种",
    rate: "汇率",
    amount: "金额",
    submitter: "提交",
    deletedBy: "删除人",
    deletedTag: "已删除",

    loading: "加载中…",
    noData: "暂无记录。请调整筛选条件后重试。",
    loadFailed: "加载记录失败。",
    foundRecords: "共找到 {n} 条记录",

    selectedCount: "已选 {n} 条",
    delete: "删除",
    deleteRecords: "删除记录",
    deleteConfirmTitle: "删除 {n} 条支付记录？",
    deleteConfirmBody: "删除后记录仍会显示在支付历史中。关联的 RATE 分录也可能被删除。",
    cannotUndo: "此操作不可撤销。",
    deleteSuccess: "已删除 {n} 条记录",
    deleteFailed: "删除失败",
    selectAtLeastOne: "请至少选择一条记录",
    notSelectable: "该记录不可删除",
  },
};

export const getMaintenanceText = createGetText(MAINTENANCE_I18N);

export function maintenanceText(lang) {
  return MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en;
}

/** Payment Maintenance transaction types. */
export const PAYMENT_MAINTENANCE_TYPES = [
  "PAYMENT",
  "RECEIVE",
  "CONTRA",
  "CLAIM",
  "RATE",
  "ADJUSTMENT",
];
