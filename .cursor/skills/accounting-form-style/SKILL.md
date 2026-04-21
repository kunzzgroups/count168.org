---
name: accounting-form-style
description: Generate accounting form and list UI with fixed fields (date, type, category, amount, remark), auto behaviors (default today date, amount float conversion, reset after submit, refresh list), and visual rules (income green, expense red, amount right aligned). Use when creating bookkeeping/accounting forms, income-expense CRUD pages, or transaction table UIs in React.
---

# Accounting Form Style

## 何时使用

当用户要求创建以下内容时使用本技能：
- 会计/记账表单
- 收支录入页面
- 交易流水列表
- 包含收入/支出类型的 CRUD 页面

## 必填字段（不可省略）

表单必须包含以下字段：
- `date`
- `type`（仅允许 `income` / `expense`）
- `category`
- `amount`
- `remark`

## 强制行为

1. **默认日期**：新建表单时，`date` 自动填充为今天。
2. **金额类型**：提交前将 `amount` 转为 `float`（如 `parseFloat`）。
3. **提交后重置**：成功提交后清空表单并恢复默认值（`date` 仍为今天）。
4. **自动刷新列表**：提交成功后必须重新拉取列表数据。

## UI 规则

1. `income` 显示为绿色（文本或徽标）。
2. `expense` 显示为红色（文本或徽标）。
3. 金额列右对齐（如 `text-right`）。

## 输出要求

1. 输出完整可用代码，不给伪代码。
2. 若涉及 React 页面：
   - 使用 `useState` 管理表单与列表状态
   - 使用 `useEffect` 拉取初始列表
   - 使用服务层发起 API 请求（不要把请求逻辑散落在 UI）
3. 术语保持一致：统一使用 `income` / `expense`、`amount`、`date`。

## 验证清单

在交付代码前，逐项确认：
- [ ] 表单含 `date/type/category/amount/remark`
- [ ] `date` 默认今天
- [ ] 提交前 `amount` 已转 `float`
- [ ] 提交成功后表单已重置
- [ ] 提交成功后列表已刷新
- [ ] 收入绿色、支出红色
- [ ] 金额列右对齐
