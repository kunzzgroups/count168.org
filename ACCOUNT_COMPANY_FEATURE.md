# Account-Company 多对多关联功能说明

## 功能概述

本功能实现了以下两个主要特性：

1. **一个 Account 可以关联多个 Company**：类似 admin 角色，一个账户可以访问多个公司
2. **自动创建 Currency**：如果某个 currency 不存在于某个 company，系统会自动创建该 currency 到该公司

## 数据库变更

### 1. 创建 account_company 关联表

执行以下 SQL 文件创建关联表：

```sql
-- 执行文件：create_account_company_table.sql
```

该表结构：
- `id`: 主键
- `account_id`: 账户ID（外键到 account.id）
- `company_id`: 公司ID（外键到 company.id）
- `created_at`: 创建时间
- `updated_at`: 更新时间
- 唯一约束：`(account_id, company_id)` - 确保一个账户不会重复关联同一个公司

### 2. 数据迁移（可选）

如果需要将现有的 account 表中的 company_id 数据迁移到 account_company 表，可以执行 SQL 文件中的迁移语句（已注释）。

## 功能实现

### 1. Account 关联多个 Company

#### 验证逻辑

系统现在支持两种方式验证 account 是否属于某个 company：

1. **传统方式**：通过 `account.company_id` 字段
2. **新方式**：通过 `account_company` 关联表

验证时会同时检查这两种方式，如果任一方式匹配，则认为 account 属于该 company。

#### 修改的文件

- `api/transactions/submit_api.php`：验证 To Account、From Account、Rate 相关账户时支持 account_company 表
- `api/transactions/get_accounts_api.php`：获取账户列表时支持 account_company 表

### 2. 自动创建 Currency

#### 功能说明

在以下场景中，如果指定的 currency 不存在于当前 company，系统会自动创建：

1. **普通交易**：提交交易时指定的 currency
2. **RATE 交易**：
   - Rate From Currency
   - Rate To Currency
   - Rate Transfer Currency
   - Rate Middleman Currency

#### 实现逻辑

```php
// 检查 currency 是否存在
$stmt = $pdo->prepare("SELECT id FROM currency WHERE code = ? AND company_id = ?");
$stmt->execute([$currency, $company_id]);
$currency_id = $stmt->fetchColumn();

// 如果不存在，自动创建
if (!$currency_id) {
    $currencyCode = strtoupper(trim($currency));
    if (strlen($currencyCode) > 10) {
        throw new Exception('Currency code 长度不能超过 10 个字符');
    }
    $stmt = $pdo->prepare("INSERT INTO currency (code, company_id) VALUES (?, ?)");
    $stmt->execute([$currencyCode, $company_id]);
    $currency_id = $pdo->lastInsertId();
}
```

#### 修改的文件

- `api/transactions/submit_api.php`：所有 currency 验证的地方都添加了自动创建逻辑

## 使用示例

### 1. 为 Account 关联多个 Company

```sql
-- 将 account_id=1 的账户关联到 company_id=5 的公司
INSERT INTO account_company (account_id, company_id) 
VALUES (1, 5);

-- 将同一个账户关联到另一个公司
INSERT INTO account_company (account_id, company_id) 
VALUES (1, 31);
```

### 2. 自动创建 Currency

当提交交易时，如果指定的 currency（如 "USD"）不存在于当前 company，系统会自动创建：

```php
// 提交交易时指定 currency = "USD"
// 如果该公司没有 USD，系统会自动创建
POST /api/transactions/submit_api.php
{
    "transaction_type": "WIN",
    "account_id": 1,
    "amount": 1000,
    "currency": "USD",  // 如果不存在，会自动创建
    ...
}
```

## 向后兼容性

所有修改都保持了向后兼容性：

1. 如果 `account_company` 表不存在，系统会回退到只检查 `account.company_id`
2. 现有的 account 数据仍然可以通过 `company_id` 字段正常工作
3. 可以逐步迁移到新的 account_company 关联方式

## 注意事项

1. **Currency 自动创建**：
   - Currency code 会被自动转换为大写
   - Currency code 长度限制为 10 个字符
   - 如果超过长度限制，会抛出异常

2. **Account 验证**：
   - 系统会优先检查 account_company 表（如果存在）
   - 同时也会检查 account.company_id（向后兼容）
   - 只要任一方式匹配，验证就会通过

3. **性能考虑**：
   - 每次验证都会检查 account_company 表是否存在
   - 如果表不存在，会回退到传统方式
   - 建议在生产环境中确保表已创建，避免重复检查

## 测试建议

1. 测试 account 关联多个 company 的功能
2. 测试 currency 自动创建功能
3. 测试向后兼容性（不创建 account_company 表的情况）
4. 测试各种交易类型（WIN, LOSE, PAYMENT, RECEIVE, CONTRA, CLAIM, RATE）

