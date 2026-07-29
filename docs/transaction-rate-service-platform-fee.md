# RATE — Service Fee / Platform Fee 逻辑说明（现行）

> 范围：Transaction Payment（桌面 `/transaction` + mobile 同 API）在 **Type = RATE** 时，**Service Fee** 与 **Platform Fee** 的计算、提交、落库、Payment History 展示。
>
> 日期：2026-07-29  
> 状态：与当前代码一致（已去掉独立 `RATE_FEE` 分录；`RATE_PLATFORM_FEE` 已生效，需跑 migration）。
>
> 完整 RATE 手册仍见 `docs/transaction-rate-manual-logic.md`；其中 §18「Platform Fee 仅 UI」**已过时**，以本文为准。

---

## 金额入库精度（现行）

| 类型 | 入库 | 展示 |
|------|------|------|
| 非 RATE | 最多 **6** 位小数（截断，不做 round-2） | 页面 round 2 仅供查看 |
| RATE | 最多 **8** 位小数（截断，不做 round-2） | 页面 round 2 仅供查看 |

实现：`submitStoreAmount` + 前端 `formatAmountForStore`；RATE 不再调用旧的 `submitRateRound2` round-2。

---

## 1. 产品规则（现行）

| 项目 | 规则 |
|------|------|
| **Service Fee**（表单 Fee 输入） | **不**再写入独立 `RATE_FEE` 分录。金额视为已含在第二币种 transfer / 兑换腿金额中；只在主单 `sms` 上写 remark，历史里挂在第二币种 **From** 腿（`RATE_TRANSFER_TO`）的 **Remark**。 |
| **Platform Fee** | **单独**写一条 `transaction_entry`，类型 `RATE_PLATFORM_FEE`，挂在第二币种 **From** 账户，Product 显示为 **Fee**，计入 Cr/Dr。 |
| **Middle-Man Amount（只读）** | `Rate-Mul 佣金 + (Service Fee − Platform Fee)`，进 Middle-Man 账户的 `RATE_MIDDLEMAN`（Win/Loss）。 |
| **前提** | 第二组账户（Transfer To / From）都选了，才会写 transfer 腿、Middle-Man、Platform Fee。 |

**为何去掉 `RATE_FEE`：**  
若第一笔 RATE 腿金额已含 Service Fee（例如 From 侧已是 3010），再插一条 +10 的 Fee，会在 Payment History 上**双计手续费**。现行做法：第一笔保留金额 + Remark，不再插 Service Fee 行。

---

## 2. 表单字段（Middle-Man 行）

```text
账户 | Rate-Mul | Fee (Service Fee) | Platform Fee | Amount(只读利润)
```

| UI | State / POST 相关 | 说明 |
|----|-------------------|------|
| Rate-Mul | `rateMiddlemanRate` / `rate_middleman_rate` | 乘数；佣金 = 第一币种金额 × 乘数 |
| Fee | `rateMiddlemanInputAmount` / `rate_middleman_input_amount` | Service Fee 面值（第二币种，不乘汇率） |
| Platform Fee | `rateMiddlemanPlatformFee` / `rate_middleman_platform_fee` | Platform Fee 面值（第二币种） |
| Amount | `rateMiddlemanAmount` / `rate_middleman_amount` | 只读：Middle-Man 利润 |

---

## 3. 前端即时计算

**文件：** `frontend/src/pages/transaction/hooks/useTransactionForm.js`  
**助手：** `frontend/src/pages/transaction/lib/transactionSubmitHelpers.js`  
（mobile：`c168_mobile/frontend/src/lib/transactionSubmitHelpers.js` 同逻辑）

### 3.1 Middle-Man 利润

```text
rateMulCommission = fromAmount × middlemanRate   （>0 才算）
middlemanProfit   = rateMulCommission + (serviceFee − platformFee)
```

`computeRateMiddlemanProfit(...)`：Fee / Platform Fee **不做 FX 换算**，按用户输入面值加减。

### 3.2 第二币种金额预览

```text
gross     = fromAmount × exchangeRate     （写入后端的毛额 / transfer 基数）
displayTo = gross − middlemanProfit       （表单右侧只读预览，可因 Platform 减小扣减而变大）
```

注意：预览变大 **不等于**「把 Platform Fee 加进毛额」。毛额仍是兑换结果；Platform 只影响「少扣多少 Middle 利润」。

### 3.3 Transfer 金额（有第二组账户时）

```text
transfer To 侧金额   = gross
transfer From 侧金额 = gross − rateMulCommission   （仅扣 Rate-Mul 佣金，不扣 Fee/Platform）
```

Service Fee / Platform Fee **不**再从 transfer 金额里扣减；Platform 另写分录。

---

## 4. 提交 Payload（要点）

**函数：** `buildRatePayload`

| 字段 | 用途 |
|------|------|
| `sms` | 有 Service Fee 时：`charge {第二币种} {金额} Service Fees`（或等价大小写），否则用户 remark |
| `rate_middleman_input_amount` | Service Fee 原值（后端只用来生成/校验 sms，**不写 RATE_FEE**） |
| `rate_middleman_platform_fee` | Platform Fee 原值（fallback） |
| `rate_platform_fee_amount` / `rate_platform_fee_description` | 有 Platform Fee 且有 transfer 时发送 |
| ~~`rate_service_fee_amount`~~ | **已不再发送**（避免再落 `RATE_FEE`） |

`rate_to_amount` / transfer 金额使用 **gross**（`toGrossStr`）。

---

## 5. 后端落库流程

**文件：** `api/transactions/submit_api.php`

```text
POST RATE
  ├─ 写 transactions 主单（含 sms = Service Fee remark，若有）
  ├─ 写 RATE 扩展 / rate_group_id
  └─ 写 transaction_entry（同一 header）
        ├─ RATE_FIRST_*          第一币种腿
        ├─ RATE_TRANSFER_FROM    第二币种 To（有 transfer 时）
        ├─ RATE_TRANSFER_TO      第二币种 From（有 transfer 时）
        ├─ RATE_MIDDLEMAN        可选（利润 > 0）
        ├─ RATE_PLATFORM_FEE     可选（Platform Fee > 0，挂 second From）
        └─ （不再写 RATE_FEE）
```

### Service Fee

1. 若 `rate_middleman_input_amount > 0` → 设置主单  
   `sms = 'charge {RATE_TO币种} {金额} Service Fees'`
2. **不** `INSERT` `entry_type = 'RATE_FEE'`

### Platform Fee

1. 金额优先 `rate_platform_fee_amount`，否则 `rate_middleman_platform_fee`
2. 描述默认：`charge {币种} {金额} PlatForm Fee`
3. 条件：存在 transfer 且 `secondFromAccountId = rate_transfer_to_account_id > 0` 且金额 > 0
4. `INSERT`：`entry_type = 'RATE_PLATFORM_FEE'`，账户 = 第二币种 From，金额为正（Cr/Dr）

---

## 6. Payment History 展示

**文件：** `api/transactions/history_api.php`

| entry_type | Product | Cr/Dr / WinLoss | Remark |
|------------|---------|-----------------|--------|
| `RATE_TRANSFER_TO` 等兑换腿 | RATE / EXCH… | 符号按既有 RATE 规则翻号 | 仅 **TRANSFER_TO**：用主单 `sms` 作为 Remark（Service Fee 文案） |
| `RATE_MIDDLEMAN` | MARKUP 等 | Win/Loss | — |
| `RATE_PLATFORM_FEE` | **Fee** | Cr/Dr（保持正数语义） | Description 为 PlatForm Fee 文案 |
| `RATE_FEE`（旧数据） | Fee | 同左 | 历史兼容；**新单不再产生** |

期望新单在 **第二币种 From** 账户上看到：

1. 一笔 **RATE**（金额为 transfer/兑换腿，Remark 可含 Service Fee）  
2. 若有 Platform Fee：一笔 **Fee**（Platform Fee）  
3. **没有** 单独的 Service Fee 行  

---

## 7. 数据库要求

`transaction_entry.entry_type` / `transaction_entry_backup.entry_type` 必须包含：

`RATE_PLATFORM_FEE`

**Migration（幂等）：**  
`database/migrations/20260729_transaction_entry_rate_platform_fee.sql`

未执行前：PHP 会尝试插入 `RATE_PLATFORM_FEE`，MySQL enum 拒绝后被 catch 吞掉 → 历史里看不到 Platform Fee。

Schema 已同步：`easycount_schema.sql` / `banks_schema.sql` / `easycount_fresh_install.sql`。

---

## 8. 数字示例（与产品预期一致）

假设：

- SGD From 金额 `1003.333`，汇率 `3` → **gross = 3010**
- Service Fee `10`，Platform Fee `1.50`，无 Rate-Mul（或佣金为 0）
- 第二组账户已选；From 账户为第二币种侧付款方

| 步骤 | 结果 |
|------|------|
| Middle 利润 | `0 + (10 − 1.50) = 8.50` → `RATE_MIDDLEMAN`（若选了 Middle 账户） |
| 表单右侧预览 | `3010 − 8.50 = 3001.50` |
| Transfer / RATE 腿金额 | 以 gross **3010** 为基数（Rate-Mul 为 0 则两侧同为 3010） |
| 主单 sms / Remark | `charge MYR 10 Service Fees`（展示大小写以库内为准） |
| **不写** | `RATE_FEE` +10 |
| **写** | `RATE_PLATFORM_FEE` +1.50 |

From 账户余额增量（简化）：`3010 + 1.50`（+ Middle 账户另计），**不会**再 `+10` Service Fee 分录。

---

## 9. 端到端流程（简图）

```text
用户填 Fee / Platform Fee
        │
        ▼
前端：算 middlemanProfit、gross、displayTo；组装 payload
        │  sms ← Service Fee
        │  rate_platform_fee_* ← Platform Fee（有 transfer）
        ▼
submit_api.php
        │  主单 sms
        │  entries: FIRST / TRANSFER / MIDDLEMAN / PLATFORM_FEE
        ▼
history_api.php
        │  TRANSFER_TO.remark ← sms
        │  PLATFORM_FEE → Product=Fee
        ▼
Payment History（第二币种 From）
```

---

## 10. 相关文件清单

| 层级 | 路径 |
|------|------|
| 桌面 payload / 利润 | `frontend/src/pages/transaction/lib/transactionSubmitHelpers.js` |
| 桌面表单计算 | `frontend/src/pages/transaction/hooks/useTransactionForm.js` |
| 桌面 UI | `frontend/src/pages/transaction/components/TransactionAddSection.jsx` |
| Mobile payload | `c168_mobile/frontend/src/lib/transactionSubmitHelpers.js` |
| 提交 API | `api/transactions/submit_api.php` |
| 历史 API | `api/transactions/history_api.php` |
| 搜索兼容旧 `RATE_FEE` | `api/transactions/type_*_lib.php` 等（只读兼容，新单不写） |
| DB migration | `database/migrations/20260729_transaction_entry_rate_platform_fee.sql` |

---

## 11. 本次变更摘要（相对旧行为）

1. **启用 Platform Fee 落库**：`RATE_PLATFORM_FEE` + enum migration。  
2. **停写 Service Fee 独立分录**：不再 `INSERT RATE_FEE`；前端也不再发 `rate_service_fee_*`。  
3. **Service Fee 仅 Remark**：主单 `sms` → 第二币种 From 腿 Remark。  
4. **旧 `RATE_FEE` 行**：历史/搜索仍识别，仅兼容存量数据。
