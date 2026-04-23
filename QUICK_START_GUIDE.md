# Transaction Payment 快速开始指南

## 🚀 第一次使用

### 步骤 1: 初始化数据

首次使用前，需要初始化 `account_balance_summary` 表的数据。

#### 选项 A: 初始化所有历史数据（推荐）
```bash
php initialize_all_captures.php
```

这会自动处理所有 data_captures 的数据，按时间顺序计算每期的 B/F 和 Balance。

**输出示例：**
```
🚀 批量初始化所有 Captures
========================================

📊 找到 15 个 Captures

[1/15] 处理 Capture ID: 1 (日期: 2024-01-01)
   ✓ 完成 25 个账户

[2/15] 处理 Capture ID: 2 (日期: 2024-01-08)
   ✓ 完成 25 个账户

...

✅ 全部完成！
   - 总 Captures: 15
   - 总账户记录: 375
```

#### 选项 B: 只初始化特定 Capture
```bash
# 初始化 Capture ID 为 10 的数据
php initialize_account_balance.php 10

# 或者初始化最新的 Capture
php initialize_account_balance.php
```

### 步骤 2: 访问页面

打开浏览器访问：
```
http://your-domain/transaction.php
```

### 步骤 3: 测试搜索

1. **选择日期范围**
   - 开始日期: 2024-01-01
   - 结束日期: 2024-01-31

2. **点击 Search**
   - 应该看到左右两个表格
   - 左表显示 Balance ≥ 0 的账户
   - 右表显示 Balance < 0 的账户

3. **验证数据**
   - 检查 B/F、Win/Loss、Cr/Dr、Balance 列
   - 底部应显示合计数据

## 🧪 测试交易功能

### 测试 1: WIN (赢钱)

```
Type: WIN
Account: 选择任意账户（例如：ACC001）
Amount: 100
Description: 测试WIN
勾选 "Confirm Submit" → 点击 Submit
```

**预期结果：**
- 显示"提交成功"
- 重新搜索，该账户的 Win/Loss 增加 100
- Balance 也增加 100

### 测试 2: LOSE (输钱)

```
Type: LOSE
Account: 同一账户
Amount: 50
Description: 测试LOSE
勾选 "Confirm Submit" → 点击 Submit
```

**预期结果：**
- Win/Loss 减少 50（总共 +50）
- Balance 减少 50

### 测试 3: PAYMENT (付款)

```
Type: PAYMENT
Account: 同一账户
Amount: 200
Description: 测试PAYMENT
勾选 "Confirm Submit" → 点击 Submit
```

**预期结果：**
- Cr/Dr 减少 200
- Balance 减少 200
- Win/Loss 保持不变

### 测试 4: RECEIVE (收款)

```
Type: RECEIVE
Account: 同一账户
Amount: 150
Description: 测试RECEIVE
勾选 "Confirm Submit" → 点击 Submit
```

**预期结果：**
- Cr/Dr 增加 150（总共 -50）
- Balance 增加 150

### 测试 5: CONTRA (转账)

```
Type: CONTRA
Account: ACC001 (To)
From: ACC002 (From)
Amount: 300
Description: 测试CONTRA
勾选 "Confirm Submit" → 点击 Submit
```

**预期结果：**
- ACC001 的 Cr/Dr 增加 300
- ACC002 的 Cr/Dr 减少 300
- 两个账户的 Balance 同步变化

## 📊 验证计算

### 公式验证

```
B/F = 上期 Balance + 本期 Processed Amount
Balance = B/F + Win/Loss + Cr/Dr
```

**示例计算：**
```
假设初始状态:
B/F = 1000
Win/Loss = 0
Cr/Dr = 0
Balance = 1000

提交 WIN 100:
Win/Loss = 100
Balance = 1000 + 100 + 0 = 1100 ✓

提交 PAYMENT 200:
Cr/Dr = -200
Balance = 1000 + 100 + (-200) = 900 ✓
```

## 🔍 查看历史记录

1. **点击任意账户行**
   - 会弹出历史记录窗口

2. **检查历史数据**
   - 应该看到刚才提交的所有交易
   - 包含日期、币种、金额、描述等信息

3. **关闭窗口**
   - 点击右上角的 ×

## ✅ 功能检查清单

### 基础功能
- [ ] 日期范围搜索正常
- [ ] 数据左右分表显示
- [ ] Company/Currency 筛选正常
- [ ] 合计数据正确

### 交易功能
- [ ] WIN 交易成功，Win/Loss 增加
- [ ] LOSE 交易成功，Win/Loss 减少
- [ ] PAYMENT 交易成功，Cr/Dr 减少
- [ ] RECEIVE 交易成功，Cr/Dr 增加
- [ ] CONTRA 交易成功，两个账户同步变化

### 计算验证
- [ ] B/F = 上期 Balance + Processed Amount
- [ ] Balance = B/F + Win/Loss + Cr/Dr
- [ ] 多次交易累加正确
- [ ] 合计数字准确

### 界面功能
- [ ] Alert 账户红色高亮
- [ ] 历史记录弹窗正常
- [ ] Show Name 选项正常
- [ ] Hide 0 balance 选项正常

## 🐛 常见问题

### 问题 1: 搜索没有数据

**原因**: 可能没有初始化 account_balance_summary

**解决**:
```bash
php initialize_all_captures.php
```

### 问题 2: Balance 计算不对

**原因**: 可能触发器没有正常工作

**检查**:
```sql
SELECT * FROM payment WHERE account_id = 'ACC001' ORDER BY created_at DESC;
SELECT * FROM account_balance_summary WHERE account_id = 'ACC001';
```

**手动重新计算**:
```bash
php initialize_account_balance.php [capture_id]
```

### 问题 3: CONTRA 只记录了一个账户

**原因**: 代码逻辑错误

**检查**:
```sql
SELECT * FROM payment WHERE transaction_type = 'CONTRA' ORDER BY created_at DESC LIMIT 10;
```

应该看到两条记录（一正一负）。

### 问题 4: 提交交易失败

**可能原因**:
1. capture_id 无效
2. account_id 不存在
3. 金额为负数或0
4. CONTRA 缺少 from_account_id

**检查浏览器控制台**查看具体错误信息。

## 📝 数据库检查命令

### 检查 payment 表
```sql
-- 查看最近的交易
SELECT * FROM payment ORDER BY created_at DESC LIMIT 20;

-- 按账户统计
SELECT account_id, transaction_type, COUNT(*), SUM(amount)
FROM payment 
GROUP BY account_id, transaction_type;
```

### 检查 account_balance_summary 表
```sql
-- 查看所有账户余额
SELECT * FROM account_balance_summary 
WHERE capture_id = [最新的capture_id]
ORDER BY balance DESC;

-- 检查特定账户
SELECT * FROM account_balance_summary 
WHERE account_id = 'ACC001'
ORDER BY capture_id DESC;
```

### 检查触发器是否工作
```sql
-- 提交一笔交易后立即检查
INSERT INTO payment (capture_id, account_id, currency_id, transaction_type, amount, win_loss, cr_dr, created_by)
VALUES (1, 'ACC001', 'MYR', 'WIN', 100, 100, 0, 1);

-- 检查 account_balance_summary 是否自动更新
SELECT * FROM account_balance_summary 
WHERE capture_id = 1 AND account_id = 'ACC001';
```

## 🔄 重新初始化

如果数据混乱，可以重新初始化：

```sql
-- 清空交易和汇总数据（谨慎操作！）
TRUNCATE TABLE payment;
TRUNCATE TABLE account_balance_summary;
```

然后重新运行：
```bash
php initialize_all_captures.php
```

## 📞 技术支持

如果遇到问题：

1. 查看浏览器控制台的错误信息
2. 检查 PHP 错误日志
3. 验证数据库表结构是否正确
4. 确认触发器和存储过程已创建
5. 查看 `TRANSACTION_SYSTEM_OVERVIEW.md` 了解系统设计

## 🎯 下一步

测试成功后：

1. ✅ 在生产环境部署
2. ✅ 培训用户使用
3. ✅ 设置定期备份
4. ✅ 监控系统运行状态

