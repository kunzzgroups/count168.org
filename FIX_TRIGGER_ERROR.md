# 修复账户货币触发器错误

## 问题描述

错误信息：
```
SQLSTATE[HY000]: General error: 1442 Can't update table 'account_currency' 
in stored function/trigger because it is already used by statement which 
invoked this stored function/trigger
```

## 问题原因

MySQL/MariaDB **不允许在触发器中更新触发器所在的同一个表**。这会导致递归更新错误。

在我们的 `account_currency` 表中，触发器尝试更新同一个表，这是不允许的操作。

## 解决方法

### 步骤 1: 执行修复脚本

在 phpMyAdmin 或 MySQL 客户端中执行以下 SQL 脚本：

```sql
-- 删除所有有问题的触发器
DROP TRIGGER IF EXISTS before_account_currency_insert;
DROP TRIGGER IF EXISTS before_account_currency_update;
DROP TRIGGER IF EXISTS after_account_currency_insert;
DROP TRIGGER IF EXISTS after_account_currency_update;
```

或者直接执行文件：`remove_account_currency_triggers.sql`

### 步骤 2: 验证修复

执行脚本后，所有的默认货币管理逻辑将由 **应用层代码**（`account_currency_api.php`）处理：

- ✅ 添加货币时自动检查并设置默认货币
- ✅ 移除货币时如果删除的是默认货币，自动设置另一个为默认
- ✅ 设置默认货币时自动取消其他默认货币
- ✅ 确保每个账户至少有一个默认货币

### 步骤 3: 测试功能

1. 尝试编辑账户
2. 添加货币到账户
3. 移除货币
4. 设置默认货币

所有功能应该正常工作，不会再出现触发器错误。

## 技术说明

### 为什么删除触发器？

触发器中的 UPDATE 操作试图修改 `account_currency` 表本身，这在 MySQL/MariaDB 中是不允许的，因为：

1. 可能导致无限递归
2. 可能导致死锁
3. 违反了数据库的约束规则

### 为什么应用层处理更好？

1. **更灵活**：可以处理复杂的业务逻辑
2. **更可控**：错误处理更容易
3. **更易调试**：可以记录日志
4. **更安全**：不会导致数据库级别的错误

## 文件说明

- `remove_account_currency_triggers.sql` - 删除所有触发器的SQL脚本
- `fix_account_currency_triggers.sql` - 修复触发器的SQL脚本（已废弃）
- `account_currency_api.php` - 处理所有货币关联逻辑的API

