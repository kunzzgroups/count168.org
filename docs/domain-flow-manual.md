# Domain 页面 — 整体流程说明书

> 本文档说明 **Domain List（`/domain`）** 从入口权限、列表操作、创建/编辑域名、Company/Group 设置、Price 定价、收费记账，到 Domain Report / Auto Renew 关联的完整行为。
>
> 目标读者：产品 / 开发。写法尽量落到具体字段、API action、表结构与代码位置。
>
> **注意：** `docs/agents/domain.md` 是工程领域建模（DDD）指引，**不是**本产品 Domain 功能文档。

---

## 目录

1. [Domain 是什么](#1-domain-是什么)
2. [相关代码与文件](#2-相关代码与文件)
3. [名词与数据模型](#3-名词与数据模型)
4. [访问权限与路由](#4-访问权限与路由)
5. [列表页 UI 与操作](#5-列表页-ui-与操作)
6. [创建 / 编辑 Domain（主弹窗 Confirm）](#6-创建--编辑-domain主弹窗-confirm)
7. [Company Settings](#7-company-settings)
8. [Group Settings](#8-group-settings)
9. [Price（Domain Fee）定价](#9-pricedomain-fee定价)
10. [收费（收费开关）完整流水线](#10-收费收费开关完整流水线)
11. [按周期取价（Period-aware Pricing）](#11-按周期取价period-aware-pricing)
12. [Share % 分成计算](#12-share--分成计算)
13. [Permissions（分类权限）](#13-permissions分类权限)
14. [到期日 / 倒计时 / 延期](#14-到期日--倒计时--延期)
15. [SMS 去重与再收费](#15-sms-去重与再收费)
16. [API Action 一览](#16-api-action-一览)
17. [Payload 形状](#17-payload-形状)
18. [数据库表](#18-数据库表)
19. [与 Auto Renew 的关系](#19-与-auto-renew-的关系)
20. [Domain Report（独立功能）](#20-domain-report独立功能)
21. [完整端到端示例](#21-完整端到端示例)
22. [易误解点汇总](#22-易误解点汇总)
23. [回归检查清单](#23-回归检查清单)

---

## 1. Domain 是什么

Domain 页面管理的是 **C168 平台下的「域名主账号（Owner）」及其下属 Company / Group 租户**。

一次业务操作通常包括：

1. **Owner**：列表里的一行（Owner Code / Name / Email / 密码等）；
2. **Company / Group**：挂在该 Owner 下的租户，各有到期日、Share%、（公司还有）Permissions；
3. **Price**：全局默认价表（Company 价 / Group 价，按周期）；
4. **收费**：在 Company/Group Settings 打开「收费」后，于 Domain 主弹窗 **Confirm** 时，向 C168 写入 Domain Fee / 分成佣金 / 净利润等 `PAYMENT` 交易。

**没有单独的 `domain_list` 表。** 列表数据 = `owner` + 关联的 `company` / `groups`。

---

## 2. 相关代码与文件

| 层级 | 路径 | 职责 |
|------|------|------|
| 列表页 | `frontend/src/pages/domain/DomainPage.jsx` | 列表、搜索、删、开 Price/Form/到期弹窗 |
| 工具函数 | `frontend/src/pages/domain/domainHelpers.js` | 日期、周期、Share、价表、payload 映射 |
| 主表单 | `frontend/src/pages/domain/components/DomainFormModal.jsx` | 创建/编辑 Owner + companies/groups，Confirm 提交 |
| Company/Group 设置 | `…/CompanySettingsModal.jsx`、`GroupSettingsModal.jsx` | 周期、权限、Share%、收费开关 |
| Price 弹窗 | `…/DomainFeeModal.jsx` | 分周期 Company/Group 默认价 |
| 到期只读弹窗 | `…/CompanyExpirationModal.jsx`、`GroupExpirationModal.jsx` | 列表 chip 点开 |
| 确认/通知 | `…/DomainConfirmModal.jsx`、`DomainNotification.jsx`、`DomainModalPortal.jsx` | 删除确认、Toast、Portal |
| 文案 | `frontend/src/translateFile/pages/domainTranslate.js` | 中英文 |
| 样式 | `frontend/public/css/domain.css` | Domain UI |
| 后端主 API | `api/domain/domain_api.php` | 几乎全部 Domain CRUD + 收费 |
| Group 持久化 | `api/domain/domain_groups_helpers.php` | groups 表读写 |
| C168 权限 | `api/c168/c168_domain_access.php` | 角色 + C168 上下文 |
| FE 权限 | `frontend/src/utils/company/loginScope.js` → `canAccessC168DomainPages` | 侧栏/进页门禁 |
| 路由 | `frontend/src/utils/routing/pageRoutes.js`、`App.jsx` | `/domain`、`/domain-report` |
| 价表迁移 | `database/migrations/20260607_domain_list_fee_settings.sql` | 分周期价列 |
| Auto Renew 复用价表 | `api/includes/auto_renew.php` | `auto_renew_resolve_price_for_period` |
| Domain Report | `frontend/src/pages/report/domain/*`、`api/reports/domain_report_api.php` | 独立报表（非 Domain Fee 台账） |

---

## 3. 名词与数据模型

```text
┌─ Owner（域名主账号，列表一行）─────────────────────────┐
│  owner_code / name / email / password …                │
│                                                         │
│  ┌─ Company 租户 ──────────────┐  ┌─ Group 租户 ─────┐ │
│  │ company_id (如 JJS)         │  │ group_code       │ │
│  │ expiration_date             │  │ expiration_date  │ │
│  │ permissions[]（分类）        │  │ （无分类权限 UI） │ │
│  │ fee_share_allocations       │  │ fee_share_…      │ │
│  │ group_id?（可归属某 Group）  │  │                  │ │
│  └─────────────────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────┘

全局（与具体 Owner 无关）：
  domain_list_fee_settings (id=1)
    ├── company_period_prices  { 7days, 1month, 3months, 6months, 1year }
    ├── group_period_prices    { 同上 }
    ├── company_price / group_price / price   ← 兼容旧逻辑，同步自 6months
```

| 名词 | 含义 |
|------|------|
| Owner / Domain 行 | `owner` 表记录；列表搜索、删除的主体 |
| Company | 公司租户；收费用 **Company Price** |
| Group | 分组租户；收费用 **Group Price**；与 Company 代码互斥 |
| C168 | 平台公司；所有 Domain Fee 交易记在 C168 名下 |
| Period | `7days` / `1month` / `3months` / `6months` / `1year` |
| 收费开关 | UI「On/Off」→ 字段 `apply_commission_payments_on_domain_save` |
| Share % | Profit / Sales / Cs / It 按账号分配比例 |
| Domain Fee | 第一笔：客户侧 → Profit 池，`PAY DOMAIN FEE` |
| Commission | 第二笔：池 → Sales/CS/IT 账号 |
| Net Profit | 第三笔：fee − commission 留在 Profit |

---

## 4. 访问权限与路由

### 4.1 路由

| 页面 | SPA 路径 | 旧 PHP | 组件 |
|------|----------|--------|------|
| Domain List | `/domain` | `/domain.php` | `DomainPage.jsx` |
| Domain Report | `/domain-report` | `/domain_report.php` | `DomainReportPage.jsx` |

### 4.2 何时能进 Domain List

前端 `canAccessC168DomainPages(me)`（`loginScope.js`）：

1. 非「仅 Group 仪表盘」模式；
2. 非 Group Ledger 模式；
3. **当前活动公司必须是 C168**；
4. 角色在允许列表，或 `me.has_c168_domain_page_access === true`。

进页后若仍不通过 → `navigate(dashboard, { replace: true })`。

侧栏「Domain」链接同样依赖该判断。

### 4.3 后端门禁

`domain_api.php` + `c168_domain_access.php`：

- 需登录；
- `$hasC168Context`：会话公司上下文为 C168；
- `$canUseC168DomainActions`：角色允许操作 Domain API。

无权限的 create/update/fee 等返回 403 / Forbidden。

### 4.4 页面启动顺序（DomainPage）

```text
sessionReady + me
  → canAccessC168DomainPages？
      否 → 尝试 fetchOwnerCompaniesAll 再判一次
      仍否 → 回 dashboard
  → POST { action: "list" } 拉列表
  → refreshFeeSummary() → get_domain_fee_settings（工具栏价芯片）
```

---

## 5. 列表页 UI 与操作

### 5.1 工具栏

**左侧**

| 控件 | 行为 |
|------|------|
| Add Domain | 打开 `DomainFormModal`（创建） |
| Search | 仅 A–Z / 0–9，自动大写（`forceSearchValue`）；匹配 Owner Code / Name / Email / Group / Company |
| Price 按钮 | 打开 `DomainFeeModal` |
| 价芯片 `C 6M/1Y: …` / `G 6M/1Y: …` | 只展示 **6 个月 / 1 年** 摘要；点击也可开 Price |

**右侧**

| 控件 | 行为 |
|------|------|
| Delete | 删除勾选的 Owner；无勾选时禁用 |

### 5.2 表格

- 分页：每页 `ROWS_PER_PAGE = 20`
- 列：No、Owner Code、Name、Email、Group chips、Company chips、Created By、Action
- Chip 最多显示 `MAX_VISIBLE_CHIPS = 3`，超出 `+N` 进到期弹窗
- 点 Group chip → `GroupExpirationModal`；点 Company chip → `CompanyExpirationModal`
- Edit → `DomainFormModal`（编辑）
- 若某 Owner 下存在 `company_id = C168`：**隐藏删除勾选**（受保护）

### 5.3 删除规则

1. 仍挂有 Company 的 Owner **不可删**（前端跳过并提示；后端也会拦）；
2. 用户确认 → 对每个可删 Owner 并行 `action: "delete"`；
3. 删除会级联清理相关账号权限 / 交易等（见后端 delete 分支）。

---

## 6. 创建 / 编辑 Domain（主弹窗 Confirm）

### 6.1 主流程

```text
打开 DomainFormModal
  → 填 Owner（code / name / email / password…）
  → 增删 Company / Group 行
  → 点某行「Set」→ CompanySettingsModal / GroupSettingsModal
       （把 period、permissions、Share%、收费开关写回内存中的 temp 对象）
  → 点主弹窗底部 Confirm
       → 前端校验（邮箱、Group/Company 代码互斥）
       → POST create 或 update
       → 后端落库 Owner + companies + groups
       → 对标记了收费的行执行收费流水线
       → 成功回调刷新列表 / session
```

### 6.2 提交字段（核心）

| 字段 | 说明 |
|------|------|
| `action` | `create` / `update` |
| `owner_code` / `name` / `email` | Owner 基本信息 |
| `password` / `secondary_password` | 创建或改密时 |
| `id` | 更新时 Owner 主键 |
| `companies` | **JSON 字符串**（数组经 `companyToDomainPayloadEntry`） |
| `groups` | **JSON 字符串**（数组经 `groupToDomainPayloadEntry`） |

前端：`DomainFormModal` → `buildCompaniesPayload` / `buildGroupsPayload`。

### 6.3 后端 Confirm 后关键步骤

1. 校验代码唯一性、Company↔Group 互斥、二级密码规则等；
2. 写入 / 更新 `owner`、`company`、`groups`；
3. 调用：
   - `domainApiApplyDomainListFeePaymentsFromPayload(...)`
   - `domainApiApplyGroupDomainListFeePaymentsFromPayload(...)`
4. 仅处理 `apply_commission_payments_on_domain_save === true` 的行。

### 6.4 重要：收费发生在 Confirm，不在「保存 Share」

Company Settings 保存 Share 时走 `save_company_share_settings`，**不会**写 Domain Fee 交易（响应里 `domain_fee_payment_created` 恒为 `false`）。

UI 文案 `feePostsHint`：

- EN: *Fee posts when you Confirm the domain (main modal).*
- ZH: *在主弹窗点击「确认域名」后会记账。*

---

## 7. Company Settings

组件：`CompanySettingsModal.jsx`（`tenantType` 默认 company）。

### 7.1 左侧：公司信息

| 字段 | 说明 |
|------|------|
| Company ID | 可改名（带 rename 字段回传） |
| Start Date | 计算到期日的基准日 |
| Period | 下拉：7 Days / 1 Month / 3 Months / 6 Months / 1 Year |
| Expiration Date | 由 `calculateExpirationDate(period, startDate)` 算出，只读展示 |
| Permissions | Games / Bank / Loan / Rate / Money；**单选**（`SINGLE_CATEGORY_MODE = true`） |

### 7.2 右侧：Share %

- 角色折叠：Profit / Sales / Cs / It
- 每行：账号下拉 + 百分比 + 金额预览（金额 = 周期价 × %）
- 顶部 **收费开关** On/Off → `chargeOnSave`

预览价：

```js
effectiveFeePrice = resolveDomainFeePriceForPeriod(
  domainPeriodPrices,
  period,          // 或 commissionOnly 时的 sharePricePeriod
  "company"
)
totals = computeShareTotals(fsa, effectiveFeePrice)
```

### 7.3 Save 时做了什么（从 Domain 表单打开，默认路径）

并行请求：

1. `update_company_permissions`（含 `expiration_date`）
2. `save_company_share_settings`（含 `apply_commission_payments: chargeOnSave`，**但后端不据此记账**）

同时 `onSave` 把内存对象更新为：

- `expiration_date`、`selectedPeriod`、`permissions`、`fee_share_allocations`
- `apply_commission_payments_on_domain_save: chargeOnSave`

等主弹窗 Confirm 时，这些字段进入 `companies` payload，才真正收费。

### 7.4 Auto Renew 复用

Auto Renew 可用同一模态框，并传 `commissionOnly`：

- 只改 Share，不展示/不触发 Domain Confirm 收费 UI；
- 续费记账走 Auto Renew 自己的路径（见第 19 节）。

---

## 8. Group Settings

`GroupSettingsModal.jsx` 是薄封装：把 `group` 映射成 `company_id = group_code`，`tenantType="group"`，仍复用 `CompanySettingsModal`。

与 Company 的差异：

| 项 | Group |
|------|------|
| Permissions | 无（固定 `[]`） |
| 预览价 | `resolveDomainFeePriceForPeriod(..., "group")` |
| 从 Domain 表单 Save | 多数情况只写回 temp；提示「保存域名后生效」 |
| `persistImmediately` | 若为 true → `save_group_tenant_settings`，**可立刻收费**（见下） |

### 8.1 `save_group_tenant_settings`（立刻收费路径）

请求可带：

- `group_code`、`expiration_date`、`fee_share_allocations`
- `selectedPeriod`
- `apply_commission_payments: true`

后端若 `apply_commission_payments` 为真，会马上调用 `domainApiApplyGroupDomainListFeePaymentsFromPayload`。

**Domain 主表单默认路径不设 `persistImmediately`**，因此日常仍是「Confirm 域名时收费」。

---

## 9. Price（Domain Fee）定价

### 9.1 UI（DomainFeeModal）

左右两列：

| Duration | Company Price | Group Price |
|----------|---------------|-------------|
| 7 Days | … | … |
| 1 Month | … | … |
| 3 Months | … | … |
| 6 Months | … | … |
| 1 Year | … | … |

说明文案大意：分别为 Company / Group 设置默认金额；各周期最多 2 位小数。

### 9.2 保存 payload

```js
{
  action: "save_domain_fee_settings",
  company_period_prices: { "7days":…, "1month":…, …, "1year":… },
  group_period_prices:   { … },
  period_prices: companyPeriodPrices,          // 兼容旧读者
  company_price: companyPeriodPrices["6months"], // 强制同步 6 个月
  group_price:   groupPeriodPrices["6months"],
}
```

### 9.3 读取时同步

`fetchDomainListFeeSettingsRow`：

- 解码 JSON 周期价；
- 再把 `company_price` / `price` **强制设为** `company_period_prices['6months']`；
- `group_price` ← `group_period_prices['6months']`。

因此：**旧字段 `company_price` 永远代表「6 个月公司价」**，不能当作「当前选中周期价」。

### 9.4 工具栏芯片

`formatDomainFeeToolbarChip` 只拼 6M / 1Y，例如：`6M/1Y: 1200.00/2400.00`。

---

## 10. 收费（收费开关）完整流水线

### 10.1 触发条件

对某一 Company 或 Group 行，同时满足：

1. Settings 里收费开关为 **On**（`apply_commission_payments_on_domain_save = true`）；
2. 用户在 **Domain 主弹窗点了 Confirm**（create/update）；  
   （或 Group 走了 `save_group_tenant_settings` + `apply_commission_payments`）
3. 操作者有 C168 Domain 权限；
4. 租户代码不是 `C168` 自身。

### 10.2 后端处理顺序（每个打了标记的租户）

```text
domainApiApply…FromPayload
  │
  ├─ 1) 解析 Share%：若 DB 已有非空 allocations，优先用 DB，否则用 payload
  ├─ 2) period = domainApiExtractFeePeriodFromRow(row)
  │        selectedPeriod / selected_period / period / fee_period
  │        若无 → domainApiInferFeePeriodFromExpiration(expiration_date)
  │
  ├─ 3) createDomainListFeePayment(..., tenantKind, period)
  │        金额 = getDomainFeePriceForTenant(pdo, tenantKind, period)
  │        From = 客户侧账号（C168 下以公司代码命名的付款账户等）
  │        To   = Share% Profit 池账号（无则回退 C168 profit 角色账号）
  │        description = "Pay Domain Fee" 或 "Pay Domain Fee (Group)"
  │        sms = [DOMAIN_LIST_FEE|CODE] 或 [DOMAIN_LIST_FEE|GROUP|CODE]
  │
  ├─ 4) createDomainShareCommissionPayments(..., period)
  │        金额基数仍是同一 period 价
  │        仅 Sales / CS / IT（Profit 不算佣金）
  │        池 → 各 staff/agent 账号
  │        sms 含 ROLE + account id
  │
  └─ 5) createDomainNetProfitPayment
           amount = fee - commission_total
           若 ≤ 0 则跳过
           To = Profit 账号；from_account_id 为空
           sms = [DOMAIN_NET_PROFIT|…]
```

任一步若因「已存在 SMS 标记」判重，则跳过该笔（见第 15 节）。

收费成功后会清理 transaction search 缓存：`domainApiClearTransactionSearchCache()`。

### 10.3 资金直觉（Company 例）

假设 1 Year Company Price = **2400**，Profit 100% 到 C168，无 Sales/CS/IT：

| 顺序 | 类型 | 金额 | 含义 |
|------|------|------|------|
| 1 | Domain Fee | 2400 | 客户付域名费进 Profit 池 |
| 2 | Commission | 0 | 无分成行则无 |
| 3 | Net Profit | 2400 | fee − 0；展示上可能单独记一笔净利 |

若 Sales 20%：佣金 480，净利 1920（具体是否落第三笔看实现与去重）。

### 10.4 Payment History 上怎么看

在 C168（或对应客户）Payment History 中常见：

- `ID PRODUCT = PAYMENT`
- `DESCRIPTION = PAY DOMAIN FEE`
- `CR/DR` 为负数金额（支出侧展示习惯）
- `CREATER` 为操作者

金额必须等于 **该租户所选周期对应价**，不是工具栏「随便一个数」，也不是一律 6 个月价。

### 10.5 各 API 是否记账

| API / 操作 | 是否写 Domain Fee |
|------------|-------------------|
| Domain `create` / `update` Confirm | ✅ 若行上 flag=true |
| `save_company_share_settings` | ❌ |
| `save_group_share_settings` | ❌ |
| `save_group_tenant_settings` + `apply_commission_payments` | ✅（Group 即时路径） |
| Auto Renew 续费 | 走 Auto Renew 自己的写账，不走 Domain Confirm 流水线 |

---

## 11. 按周期取价（Period-aware Pricing）

### 11.1 历史问题（已修）

曾出现：

- Settings 选 **1 Year**，预览 TOTAL = **2400**（按 `1year`）；
- Confirm 收费却读 flat `company_price`（= **6months = 1200**）；
- Payment History 进账 **1200**。

根因：UI / Auto Renew 已按周期，收费 API 仍只用 6 个月兼容列。

### 11.2 现行规则

**前端预览**

```js
resolveDomainFeePriceForPeriod(feeSettings, period, "company"|"group")
```

**后端收费**

```php
getDomainFeePriceForTenant($pdo, $tenantKind, $period)
  → resolveDomainFeePriceForPeriod(...)   // 优先
  → 否则 getDomainFeePrice / getGroupDomainFeePrice  // 旧 flat（6months）
```

**周期从哪来**

1. payload `selectedPeriod`（Confirm 时 `companyToDomainPayloadEntry` / `groupToDomainPayloadEntry` 会带上）；
2. 否则按 `expiration_date` 相对今天推断（与前端 `getPeriodFromDate` 对齐）；
3. 再否则回退 6 个月 flat。

### 11.3 对照表

| 场景 | 取价 |
|------|------|
| Period=1year，Company 1Y=2400，6M=1200 | **2400** |
| Period=6months | **1200** |
| 无 selectedPeriod，到期约 365 天后 | 推断 `1year` → 2400 |
| 无 period 且无法推断 | flat `company_price`（6M） |

---

## 12. Share % 分成计算

### 12.1 数据结构

```js
fee_share_allocations = {
  profit: [{ account_id, percentage? }],
  sales:  [{ account_id, percentage }],
  cs:     [{ account_id, percentage }],
  it:     [{ account_id, percentage }],
}
```

存于：

- `company.fee_share_allocations`
- `groups.fee_share_allocations`

### 12.2 前端预览算法（`computeShareTotals`）

1. `salesSum + csSum + itSum = otherSum`；
2. `profitPool = max(0, 100 - otherSum)`；
3. Profit 行：把 `profitPool` **均分**给已选账号（最后一行吃尾差）；
4. 各行金额 = `price * percentage / 100`。

注意：Profit 行的 percentage 在 UI 上是「剩余池均分」的结果，不是用户手填的独立总利润率字段。

### 12.3 后端校验

`feeShareAllocationsTargetsValid`：

- Profit 目标：C168 下 **profit** 角色账号；
- Sales/CS/IT：C168 下 **staff / agent** 等（非 profit）；
- 非 C168 公司账号会被排除出选择器。

默认 Profit 账号倾向：代码 `C168` / `PROFIT`（`DEFAULT_PROFIT_ACCOUNT_CODES`）。

### 12.4 佣金记账范围

`createDomainShareCommissionPayments` **只**为 sales / cs / it 建佣金单；Profit 表示利润归属，不抽佣。

---

## 13. Permissions（分类权限）

| 项 | 说明 |
|------|------|
| 枚举 | Games（界面可能显示 Gambling）、Bank、Loan、Rate、Money |
| 模式 | `SINGLE_CATEGORY_MODE = true` → 公司必须且只能选 **1** 个 |
| 用途 | 控制 Process List / Data Capture 等可见分类 |
| API | `get_company_permissions` / `update_company_permissions` |
| Group | 不设分类（空数组） |

---

## 14. 到期日 / 倒计时 / 延期

### 14.1 计算

```js
calculateExpirationDate(period, startDate)
// 7days / 1month / 3months / 6months / 1year
// startDate 空则用今天
```

### 14.2 倒计时展示

`calculateCountdown` + `expirationStatusFromDays`：

| 剩余天数 | 状态 class |
|----------|------------|
| &lt; 0 | `expired` |
| ≤ 7 | `exp-critical` |
| ≤ 15 | `exp-orange` |
| ≤ 30 | `exp-yellow` |
| &gt; 30 | `normal` |

### 14.3 反推周期

`getPeriodFromDate(expirationDate)`：按距今天数/月数落回某一 period（用于 UI 回填；收费侧后端有对齐的推断函数）。

### 14.4 延期标记

Settings 内可出现 `isExtending` / `originalExpirationDate`，用于区分「首次设定」与「在原到期上延长」。

---

## 15. SMS 去重与再收费

### 15.1 标记格式

`domainFeeSmsMarker($type, $code, $tenantKind)`：

| 租户 | 示例 |
|------|------|
| Company | `[DOMAIN_LIST_FEE\|JJS]` |
| Group | `[DOMAIN_LIST_FEE\|GROUP\|JJS]` |

同类还有：

- `[DOMAIN_SHARE_COMMISSION|…|ROLE:…|AID:…]`
- `[DOMAIN_NET_PROFIT|…]`

Group 带 `GROUP|` 前缀，避免与同名 Company 代码冲突。

### 15.2 去重规则

在 `transactions` 中查 C168 公司下：

- `transaction_type = 'PAYMENT'`
- `sms` 等于标记，或 `sms LIKE 标记|%`

已存在 → `skipped_duplicate`，**不再写入第二笔同类型费**。

### 15.3 如何重新收费

1. 删除（或作废）对应 Domain Fee / Commission / Net Profit 交易；或
2. 换一个从未收过费的新 Company/Group 代码测试。

仅改 Price 或再次 Confirm **不会**覆盖已有 SMS 去重记录。

---

## 16. API Action 一览

入口：`POST api/domain/domain_api.php`（JSON body，需登录 + 相应 C168 权限）。

| action | 作用 | 是否可能写 Fee |
|--------|------|----------------|
| `list` | Owner 列表 + companies_full / groups_full | 否 |
| `create` | 创建 Owner + 租户，并尝试收费 | ✅ |
| `update` | 更新 Owner + 租户，并尝试收费 | ✅ |
| `delete` | 删除无公司的 Owner | 否 |
| `validate_domain_code` | 校验代码可用 | 否 |
| `get_companies` | 某 Owner 下公司 | 否 |
| `get_groups` | 某 Owner 下 Group | 否 |
| `get_company_permissions` | 读权限 | 否 |
| `update_company_permissions` | 写权限 + 可选 expiration | 否 |
| `get_company_share_settings` | Share% + 账号选择器 | 否 |
| `save_company_share_settings` | 只存 Share% | ❌ |
| `save_group_share_settings` | 只存 Group Share% | ❌ |
| `save_group_tenant_settings` | Group 到期 + Share；可选立刻收费 | ✅ 可选 |
| `get_domain_fee_settings` | 读价表 | 否 |
| `save_domain_fee_settings` | 写价表 | 否 |

---

## 17. Payload 形状

### 17.1 Company（`companyToDomainPayloadEntry`）

```js
{
  company_id: "JJS",
  expiration_date: "2027-07-25",
  permissions: ["Games"],
  group_id: null,                    // 或归属的 group_code
  fee_share_allocations: {
    profit: [{ account_id: 123, percentage: … }],
    sales: [],
    cs: [],
    it: [],
  },
  apply_commission_payments_on_domain_save: true,
  selectedPeriod: "1year",           // 有效周期才带
  previous_company_id: "OLD",        // 仅改名时
}
```

### 17.2 Group（`groupToDomainPayloadEntry`）

```js
{
  group_code: "G1",
  expiration_date: "2027-07-25",
  permissions: [],
  fee_share_allocations: { … },
  apply_commission_payments_on_domain_save: true,
  selectedPeriod: "1year",
  previous_group_code: "OLD",        // 仅改名时
}
```

### 17.3 线上传输

DomainForm 把数组 `JSON.stringify` 后放进 `companies` / `groups` 字段。  
后端：`domainApiNormalizeCompaniesPayload` / `domainApiNormalizeGroupsPayload` 再解回数组。

---

## 18. 数据库表

| 表 | 用途 |
|------|------|
| `owner` | Domain 列表行 |
| `company` | 公司租户：`company_id`、`owner_id`、`expiration_date`、`permissions`、`group_id`、`fee_share_allocations` |
| `groups` | Group 租户：`group_code`、`owner_id`、`expiration_date`、`fee_share_allocations` 等 |
| `domain_list_fee_settings` | 全局价表单例（`id=1`） |
| `transactions` | Domain Fee / 佣金 / 净利 `PAYMENT`（`company_id` = C168 主键） |
| `account` / `account_company` / … | 付款方、Profit 池、佣金目标账号 |
| `user_company_permissions` | 删域/建账时关联清理或白名单 |
| `company_auto_renew_request` | Auto Renew；删 Group 等时清理孤儿请求 |

价表关键列见迁移 `20260607_domain_list_fee_settings.sql`。

---

## 19. 与 Auto Renew 的关系

| 共享 | 不共享 |
|------|--------|
| `domain_list_fee_settings` 价表 | Domain Confirm 的 `createDomainListFeePayment` 流水线 |
| 周期键与 `resolve…ForPeriod` 思路 | SMS 标记体系（Domain 专用 `DOMAIN_LIST_FEE` 等） |
| FE 模态 / `domain.css` / helpers | 续费写账在 `auto_renew.php` |
| C168 上下文门禁（Auto Renew 角色更严） | — |

Auto Renew 取价：`auto_renew_resolve_price_for_period($pdo, $period, $entityType)`。  
Domain 删改租户时，可能触发 `auto_renew_purge_detached_domain_requests` 清理孤儿续费请求。

---

## 20. Domain Report（独立功能）

路径：`/domain-report`。

- 前端：`frontend/src/pages/report/domain/`
- 后端：`api/reports/domain_report_api.php`
- 内容：按 Process 汇总 Turnover / Win / Lose 等（Games 侧报表）
- **不是** Domain List 的收费台账；收费请看 Transaction → Payment History。

侧栏 Report 下的 Domain Report 门禁与 List 的 C168 Domain 门禁不完全相同（Report 菜单更宽）。

---

## 21. 完整端到端示例

**设定**

- Price：Company 6 Months = 1200，Company 1 Year = 2400；Group 1 Year = 1200
- 新建 Owner，下属 Company `JJS`
- Company Settings：Period = **1 Year**，Start = 2026-07-25 → Expiration = 2027-07-25
- Share：Profit 100% → 账号 C168；Sales/CS/IT 空
- 收费开关：**On**
- 主弹窗 Confirm

**期望**

1. `companies` payload 含 `selectedPeriod: "1year"`、`apply_commission_payments_on_domain_save: true`
2. 后端取价 `company_period_prices['1year']` = **2400**
3. 写入 Domain Fee `PAYMENT`，金额 **2400**，描述 Pay Domain Fee
4. 无佣金行 → 佣金合计 0；净利逻辑按实现写入 2400 或等价留存
5. Payment History 显示 **-2,400.00**（展示习惯），而不是 1200

**若误用旧逻辑（未修前）**

- 读 `company_price`（6M）→ 进账 1200 ← 与 Settings TOTAL 不一致

---

## 22. 易误解点汇总

1. **Settings 里 TOTAL ≠ 一定等于已入账金额** — 入账发生在 Confirm；且受 SMS 去重影响。
2. **`company_price` 不是「当前价」** — 它是 6 个月兼容价；当前价看 `selectedPeriod` + `company_period_prices`。
3. **收费开关保存在 Share 接口时不会记账** — 只打标记，等 Confirm。
4. **1200 不一定是「2400÷2」** — 常见是误用了 6 个月价，或碰巧等于 Group 1 年价。
5. **Group 与 Company 同名代码** — SMS 用 `GROUP|` 隔离，但业务上代码仍应避免混乱。
6. **再 Confirm 不会重复扣** — 除非删掉旧 Fee 交易。
7. **Profit % 开关 Off** — 指 Share 区块 UI 开关（若存在），与「收费 On/Off」不是同一控件；收费看 charge toggle。
8. **Domain Report ≠ Domain Fee 历史**。
9. **`docs/agents/domain.md` ≠ 本说明书**。
10. **C168 自己不能作为收费客户**；含 C168 公司的 Owner 不能从列表勾选删除。

---

## 23. 回归检查清单

- [ ] C168 上下文外无法打开 `/domain`
- [ ] Price 保存后芯片显示正确的 6M/1Y
- [ ] Company 选 1 Year、Company 1Y=2400、打开收费、Confirm → History **-2400**
- [ ] Company 选 6 Months、6M=1200 → History **-1200**
- [ ] Group 收费用 **Group** 周期价，不是 Company 价
- [ ] 关闭收费开关再 Confirm → 无新 Domain Fee
- [ ] 同一公司第二次 Confirm → 因 SMS 去重跳过
- [ ] 删除 Domain Fee 后再 Confirm → 可按**当前**周期价重新入账
- [ ] Share 含 Sales% 时佣金金额 = fee × %
- [ ] 仅 Save Company Share、不 Confirm → 无新 Fee
- [ ] Auto Renew 改 Share / 续费不影响 Domain Confirm 去重标记语义

---

## 附录 A — 关键函数速查

| 位置 | 函数 | 作用 |
|------|------|------|
| FE helpers | `resolveDomainFeePriceForPeriod` | UI 预览取价 |
| FE helpers | `companyToDomainPayloadEntry` / `groupToDomainPayloadEntry` | Confirm payload |
| FE helpers | `computeShareTotals` | Share 金额预览 |
| FE helpers | `calculateExpirationDate` / `getPeriodFromDate` | 到期与反推 |
| BE | `getDomainFeePriceForTenant` | 收费取价（含 period） |
| BE | `resolveDomainFeePriceForPeriod` | 周期 JSON 取价 |
| BE | `domainApiExtractFeePeriodFromRow` | 从 payload/到期取 period |
| BE | `createDomainListFeePayment` | 第一笔 Fee |
| BE | `createDomainShareCommissionPayments` | 第二笔佣金 |
| BE | `createDomainNetProfitPayment` | 第三笔净利 |
| BE | `domainApiApplyDomainListFeePaymentsFromPayload` | Company 收费批处理 |
| BE | `domainApiApplyGroupDomainListFeePaymentsFromPayload` | Group 收费批处理 |
| BE | `domainFeeSmsMarker` | 去重 SMS |
| Auto Renew | `auto_renew_resolve_price_for_period` | 续费取价 |

---

## 附录 B — 用户操作路径简图

```text
侧栏 Domain（需 C168）
  │
  ├─ Price ──► 设各周期 Company/Group 默认价 ──► save_domain_fee_settings
  │
  ├─ Add / Edit Domain
  │     ├─ Set Company ──► Period + Permissions + Share% + 收费 On/Off
  │     │                    （Share 立即存库；收费只打标）
  │     ├─ Set Group   ──► Period + Share% + 收费 On/Off
  │     └─ Confirm     ──► create/update
  │                          └─ 收费流水线（Fee → Commission → Net）
  │                                └─ Payment History 可见
  │
  └─ Report → Domain Report（独立：游戏/过程汇总，非 Fee 台账）
```

---

*文档对应代码版本：含 Domain 收费按 `selectedPeriod` 取价的修复（避免一律使用 6 个月 `company_price`）。若后续 API 行为变更，请同步更新第 10–11、16、22 节。*
