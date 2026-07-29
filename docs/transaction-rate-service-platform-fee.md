# RATE — Service Fee / Platform Fee 逻辑说明（现行）

> 范围：Transaction Payment（桌面 `/transaction` + mobile 同 API）在 **Type = RATE** 时，**Service Fee** 与 **Platform Fee** 的计算、提交、落库、Payment History 展示。
>
> 日期：2026-07-29  
> 状态：与当前代码一致（桌面：独立 `RATE_FEE`；正 PT-Fee 只扣 From、不进 Middle；负 PT-Fee Remark-only；Mobile Service Fee 仍为 sms Remark）。
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
| **Service Fee**（表单 Fee 输入） | **桌面**：独立 `RATE_FEE` 挂 Select From；From 腿扣 Fee；To 腿 = **全额 gross**（不扣 Fee）。**Mobile（暂未改）**：仍 sms Remark；To 仍可能为 gross − Fee。 |
| **Platform Fee > 0** | **实时**从第二币种金额预览与 **From** 腿扣减；Middle-Man Amount = **仅 Fee**（+ Rate-Mul），**不加** PT；**不**写 `RATE_PLATFORM_FEE` 行。 |
| **Platform Fee < 0** | From / To 金额**不变**；Middle-Man Amount = `Fee − abs(PT-Fee)`；**不**写独立 Fee 行，Remark 挂在 `RATE_MIDDLEMAN`（如 `charge MYR 1.5 PlatForm Fee`）。 |
| **前提** | 第二组账户（Transfer To / From）都选了，才会写 transfer 腿、Middle-Man（及负 PT 的 Remark / fallback）。 |

**为何桌面拆出 `RATE_FEE`：**  
把 Service Fee 与正常 RATE 兑换行分开展示；From 腿先扣掉 Fee 再写 `RATE_FEE`，净额不变、不双计。Mobile 仍走旧 Remark 路径（尚未同步）。

> 旧说明「为何去掉 RATE_FEE」已由桌面新路径取代；存量仅-sms Remark 的单仍可展示。

---

## 2. 表单字段（Middle-Man 行）

```text
账户 | Rate-Mul | Fee (Service Fee) | Platform Fee | Amount(只读利润)
```

| UI | State / POST 相关 | 说明 |
|----|-------------------|------|
| Rate-Mul | `rateMiddlemanRate` / `rate_middleman_rate` | 乘数；佣金 = 第一币种金额 × 乘数 |
| Fee | `rateMiddlemanInputAmount` / `rate_middleman_input_amount` | Service Fee 面值（第二币种，不乘汇率） |
| Platform Fee | `rateMiddlemanPlatformFee` / `rate_middleman_platform_fee` | Platform Fee 面值（第二币种，可正可负） |
| Amount | `rateMiddlemanAmount` / `rate_middleman_amount` | 只读：Middle-Man 利润 |

---

## 3. 前端即时计算

**文件：** `frontend/src/pages/transaction/hooks/useTransactionForm.js`  
**助手：** `frontend/src/pages/transaction/lib/transactionSubmitHelpers.js`  
（mobile：`c168_mobile/frontend/src/lib/transactionSubmitHelpers.js` 同逻辑）

### 3.1 Middle-Man 利润

```text
rateMulCommission = fromAmount × middlemanRate   （>0 才算）
PT > 0 : middlemanProfit = rateMulCommission + serviceFee     （正 PT 不进 Middle）
PT < 0 : middlemanProfit = rateMulCommission + (serviceFee − abs(PT))
PT = 0 : middlemanProfit = rateMulCommission + serviceFee
```

`computeRateMiddlemanProfit(...)`：Fee / Platform Fee **不做 FX 换算**。正 PT 只影响 From 扣减。

### 3.2 第二币种金额预览

```text
gross      = fromAmount × exchangeRate     （写入后端的毛额 / transfer 基数）
displayAmt = gross − (Rate-Mul 佣金 + Service Fee) − max(PT, 0)
```

- **正 PT-Fee**：右侧金额实时变为 From 口径（例：`300 − 1.5 = 298.5`）。
- **负 PT-Fee**：不扣预览金额（仍为 `gross − Rate-Mul − Service Fee`）。

To 腿入库 = **全额 gross**（不扣 Service Fee / 正 PT）。正 PT 只改 From。表单右侧预览仍可按 From 口径显示（扣 Fee + 正 PT）。

### 3.3 Transfer 金额（有第二组账户时）

```text
transfer To 侧金额   = gross                         （桌面：不扣 Service Fee）
transfer From 侧金额 = gross − rateMulCommission − Service Fee − max(PT, 0)   （桌面）
+ RATE_FEE（正数，仅桌面发 rate_service_fee_amount）挂 Select From
```

- 正 PT：只扣 From 腿；**不**进 Middle；**不**另开 `RATE_PLATFORM_FEE`。
- 负 PT：From/To 都不扣 PT；Middle = `Fee−|PT|`，Remark only。
- **Mobile**：From 仍不因 Service Fee 再扣（Fee 在金额里 + sms Remark），不发 `rate_service_fee_*`。

---

## 4. 提交 Payload（要点）

**函数：** `buildRatePayload`

| 字段 | 用途 |
|------|------|
| `sms` | 有 Service Fee 时：`charge {第二币种} {金额} Service Fees`（或等价大小写），否则用户 remark |
| `rate_middleman_input_amount` | Service Fee 原值 |
| `rate_service_fee_amount` / `rate_service_fee_description` | **桌面**：有 Service Fee 且有 transfer 时发送 → 写 `RATE_FEE` |
| `rate_middleman_platform_fee` | Platform Fee 原值（可正可负） |
| `rate_platform_fee_amount` / `rate_platform_fee_description` | **仅负 PT-Fee** 时发送（Remark / fallback） |

`rate_to_amount` / transfer 基数使用 **gross**（`toGrossStr`）。

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
        ├─ RATE_TRANSFER_TO      第二币种 From（有 transfer 时；正 PT 已扣在金额）
        ├─ RATE_FEE              桌面可选（rate_service_fee_amount；挂 Select From）
        ├─ RATE_MIDDLEMAN        可选（利润 > 0；负 PT 可带 [[PFEE_REMARK]]）
        ├─ RATE_PLATFORM_FEE     仅负 PT 且无 MIDDLEMAN 行时的 fallback
        └─ （正 PT 永不写 RATE_PLATFORM_FEE）
```

### Service Fee

1. **桌面**（`rate_service_fee_amount > 0`）：`INSERT RATE_FEE` 正数挂 Select From；**不**把 Fee 写入主单 `sms`
2. **Mobile / 未带 rate_service_fee_amount**：若 `rate_middleman_input_amount > 0` → 主单 `sms = charge … Service Fees`（Remark 路径）
3. **不**在同一单上同时走 sms Fee + `RATE_FEE`（由是否 POST `rate_service_fee_amount` 分流）

### Platform Fee

1. 金额优先 `rate_platform_fee_amount`，否则 `rate_middleman_platform_fee`
2. 描述默认使用绝对值：`charge {币种} {abs(金额)} PlatForm Fee`
3. 输入 `> 0`：**不**写 `RATE_PLATFORM_FEE`（From 金额已扣；Middle 不含正 PT）
4. 输入 `< 0`：有 `RATE_MIDDLEMAN` 时**不**写 `RATE_PLATFORM_FEE`，Remark 写入该分录（`[[PFEE_REMARK]]`）；若无 Middle-Man 行则 fallback 仍写 `RATE_PLATFORM_FEE` 挂 Middle-Man

---

## 6. Payment History 展示

**文件：** `api/transactions/history_api.php`

| entry_type | Product | Cr/Dr / WinLoss | Remark |
|------------|---------|-----------------|--------|
| `RATE_TRANSFER_TO` 等兑换腿 | RATE / EXCH… | 符号按既有 RATE 规则翻号 | 仅 **TRANSFER_TO**：用主单 `sms` 作为 Remark（Service Fee 文案） |
| `RATE_FEE` | **Fee** | Cr/Dr（桌面新单为正数） | Description = charge … Service Fees；**Remark 空** |
| `RATE_PLATFORM_FEE` | **Fee** | Cr/Dr（fallback / 旧数据） | Description 为 PlatForm Fee 文案 |
| `RATE_FEE`（仅 sms 旧路径） | — | — | Mobile/旧单：Fee 文案在 RATE 行 Remark |

正数 PT-Fee + Service Fee 的桌面新单在 **第二 form account（Select From）** 上看到：

1. 一笔 **RATE**（金额已扣 Fee 与正 PT；**无** Service Fee Remark）  
2. 一笔 **Fee**（Service Fee，独立行）  
3. Middle-Man：MARKUP = **仅 Fee**（不含正 PT）  
4. To：全额 gross（例 310） 

---

## 7. 数据库要求

`transaction_entry.entry_type` / `transaction_entry_backup.entry_type` 必须包含：

`RATE_PLATFORM_FEE`

**Migration（幂等）：**  
`database/migrations/20260729_transaction_entry_rate_platform_fee.sql`

未执行前：负 PT fallback 插入 `RATE_PLATFORM_FEE` 可能被 MySQL enum 拒绝后 catch 吞掉。

Schema 已同步：`easycount_schema.sql` / `banks_schema.sql` / `easycount_fresh_install.sql`。

---

## 8. 数字示例（与产品预期一致）

### 8.1 正 PT-Fee（桌面）

假设：gross `310`，Service Fee `10`，PT-Fee `+1.50`，无 Rate-Mul

| 步骤 | 结果 |
|------|------|
| Middle 利润 | `10`（正 PT **不**加进 Middle） |
| 表单右侧预览 | `310 − 10 − 1.50 = 298.50` |
| Transfer To 腿 | **310**（全额 gross，不扣 Fee） |
| Transfer From 腿 | **298.50**（gross − Fee − PT） |
| **写** | Select From：`RATE_FEE` **+10**（Description，无 Remark） |
| **不写** | RATE 行 Service Fee Remark；`RATE_PLATFORM_FEE`；Middle 不含 `1.50` |

From 净影响：`298.50 + 10 = 308.50`（与拆行前一致）。正 PT `1.50` 仅体现在 From 扣减。

### 8.2 负 PT-Fee

假设：gross `300`，Service Fee `10`，PT-Fee `-1.50`

| 步骤 | 结果 |
|------|------|
| Middle 利润 | `10 − 1.50 = 8.50` |
| 表单预览 / To / From | To=`290`，From=`300`（**不**因负 PT 变动） |
| MARKUP Remark | `charge MYR 1.5 PlatForm Fee` |
| **不写** | 独立 `RATE_PLATFORM_FEE`（有 Middle 行时） |

---

## 9. 端到端流程（简图）

```text
用户填 Fee / Platform Fee
        │
        ▼
前端：算 middlemanProfit（按 PT 正负加减）、gross、displayAmt；组装 payload
        │  sms ← Service Fee
        │  From 金额 ← 扣正 PT
        │  rate_platform_fee_* ← 仅负 PT
        ▼
submit_api.php
        │  主单 sms
        │  entries: FIRST / TRANSFER / MIDDLEMAN（负 PT Remark）
        │  （正 PT 无 PLATFORM_FEE）
        ▼
history_api.php
        │  TRANSFER_TO.remark ← sms
        │  MIDDLEMAN.remark ← 负 PT PlatForm Fee
        ▼
Payment History
```

---

## 10. 相关文件清单

| 层级 | 路径 |
|------|------|
| 桌面 payload / 利润 | `frontend/src/pages/transaction/lib/transactionSubmitHelpers.js` |
| 桌面表单计算 | `frontend/src/pages/transaction/hooks/useTransactionForm.js` |
| 桌面 UI | `frontend/src/pages/transaction/components/TransactionAddSection.jsx` |
| Mobile payload | `c168_mobile/frontend/src/lib/transactionSubmitHelpers.js` |
| Mobile 表单 | `c168_mobile/frontend/src/pages/transaction/AddTransactionSheet.jsx` |
| 提交 API | `api/transactions/submit_api.php` |
| 历史 API | `api/transactions/history_api.php` |
| 搜索兼容旧 `RATE_FEE` | `api/transactions/type_*_lib.php` 等（只读兼容，新单不写） |
| DB migration | `database/migrations/20260729_transaction_entry_rate_platform_fee.sql` |

---

## 11. 本次变更摘要（相对旧行为）

1. **启用 Platform Fee 落库**：`RATE_PLATFORM_FEE` + enum migration（负 PT fallback / 旧数据）。  
2. **停写 Service Fee 独立分录**：不再 `INSERT RATE_FEE`；前端也不再发 `rate_service_fee_*`。  
3. **Service Fee 仅 Remark**：主单 `sms` → 第二币种 From 腿 Remark。  
4. **旧 `RATE_FEE` 行**：历史/搜索仍识别，仅兼容存量数据。  
5. **正 PT-Fee**：只扣 From，**不**进 Middle；**不再**写 `RATE_PLATFORM_FEE`。  
6. **负 PT-Fee**：From/To 不动；Middle=`Fee−|PT|`；Remark-only（无 Middle 行时 fallback Fee）。  
7. **桌面 Service Fee**：独立 `RATE_FEE` + From 腿扣 Fee；不走 Remark。Mobile 暂未同步。
