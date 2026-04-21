# Account Company ID 迁移指南

## 当前设计

目前系统支持两种方式关联账户和公司：

1. **传统方式**：`account.company_id` - 账户的主/默认公司
2. **新方式**：`account_company` 表 - 支持一个账户关联多个公司

## 是否删除 account.company_id？

### 方案 A：保留 company_id（推荐）⭐

**优点：**
- ✅ 向后兼容，无需大量代码修改
- ✅ `company_id` 可以作为账户的"主公司"或"默认公司"
- ✅ `account_company` 表用于额外的公司关联
- ✅ 查询性能更好（单列索引 vs 关联表查询）
- ✅ 数据迁移简单

**设计逻辑：**
- 每个账户必须有一个主公司（`account.company_id`）
- 账户可以额外关联其他公司（通过 `account_company` 表）
- 查询时同时检查两种方式

**适用场景：**
- 大多数账户只属于一个公司
- 少数账户需要跨公司访问
- 希望保持系统稳定性和向后兼容

### 方案 B：删除 company_id（完全迁移）

**优点：**
- ✅ 数据模型更统一，所有关联都在 `account_company` 表
- ✅ 更灵活，账户可以没有主公司概念

**缺点：**
- ❌ 需要修改大量代码（23个文件，124处使用）
- ❌ 需要数据迁移
- ❌ 查询性能可能略差（需要 JOIN）
- ❌ 风险较高，可能影响现有功能

**适用场景：**
- 所有账户都需要支持多公司关联
- 没有"主公司"的概念
- 愿意投入时间进行完整迁移和测试

## 推荐方案：保留 company_id

基于以下原因，**强烈建议保留 `account.company_id` 列**：

1. **向后兼容**：现有代码可以继续工作
2. **性能考虑**：单列查询比 JOIN 更快
3. **数据完整性**：每个账户都有明确的主公司
4. **渐进式迁移**：可以逐步迁移到新系统

## 如果选择删除 company_id

如果确实需要删除 `company_id` 列，请按以下步骤操作：

### 1. 数据迁移

执行 `migrate_account_company_id_to_table.sql` 脚本：

```sql
-- 将现有数据迁移到 account_company 表
INSERT INTO account_company (account_id, company_id)
SELECT a.id, a.company_id
FROM account a
WHERE a.company_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 
      FROM account_company ac 
      WHERE ac.account_id = a.id 
        AND ac.company_id = a.company_id
  );
```

### 2. 代码修改清单

需要修改以下文件：

#### 核心文件
- [ ] `addaccountapi.php` - 移除 INSERT 中的 company_id
- [ ] `updateaccountapi.php` - 修改 WHERE 子句，使用 account_company 表验证
- [ ] `toggleaccountstatusapi.php` - 修改 WHERE 子句
- [ ] `accountlistapi.php` - 已修改，但需要移除 company_id 检查
- [ ] `account-list.php` - 已修改，但需要移除 company_id 检查

#### API 文件
- [ ] `api/transactions/submit_api.php` - 已修改，但需要移除 company_id 检查
- [ ] `api/transactions/get_accounts_api.php` - 已修改，但需要移除 company_id 检查
- [ ] `api/transactions/search_api.php` - 需要修改
- [ ] `api/transactions/history_api.php` - 需要修改
- [ ] `getaccountapi.php` - 需要修改（根目录）
- [ ] `api/accounts/account_currency_api.php` - 需要修改
- [ ] `api/datacapture_summary/summary_api.php` - 需要修改
- [ ] `api/formula_maintenance/update_api.php` - 需要修改
- [ ] `api/payment_maintenance/update_api.php` - 需要修改
- [ ] `api/accounts/delete_currency_api.php` - 需要修改
- [ ] `domainapi.php` - 需要修改
- [ ] `useraccessapi.php` - 需要修改
- [ ] `customer_report_api.php` - 需要修改

#### 其他文件
- [ ] `login_process.php` - 可能需要修改
- [ ] `useraccess.php` - 需要修改

### 3. 修改模式

#### 修改前（使用 company_id）：
```php
// INSERT
INSERT INTO account (account_id, name, company_id, ...) VALUES (?, ?, ?, ...)

// UPDATE WHERE
UPDATE account SET ... WHERE id = ? AND company_id = ?

// SELECT WHERE
SELECT * FROM account WHERE company_id = ?
```

#### 修改后（使用 account_company）：
```php
// INSERT（需要先插入 account，再插入 account_company）
INSERT INTO account (account_id, name, ...) VALUES (?, ?, ...)
INSERT INTO account_company (account_id, company_id) VALUES (?, ?)

// UPDATE WHERE
UPDATE account a
INNER JOIN account_company ac ON a.id = ac.account_id
SET ...
WHERE a.id = ? AND ac.company_id = ?

// SELECT WHERE
SELECT DISTINCT a.* 
FROM account a
INNER JOIN account_company ac ON a.id = ac.account_id
WHERE ac.company_id = ?
```

### 4. 测试清单

- [ ] 创建账户功能
- [ ] 更新账户功能
- [ ] 删除账户功能
- [ ] 切换账户状态
- [ ] 账户列表查询
- [ ] 交易提交（所有类型）
- [ ] 交易查询
- [ ] 报表功能
- [ ] 权限验证
- [ ] 多公司切换

### 5. 执行删除

确认所有测试通过后，执行：

```sql
-- 删除外键约束
ALTER TABLE account DROP FOREIGN KEY fk_account_company;

-- 删除索引
ALTER TABLE account DROP INDEX idx_account_company;

-- 删除列
ALTER TABLE account DROP COLUMN company_id;
```

## 建议

**强烈建议采用方案 A（保留 company_id）**，因为：

1. 当前实现已经支持多公司关联
2. 保留 `company_id` 不会影响功能
3. 可以避免大量代码修改和测试工作
4. 系统更稳定，风险更低

如果未来确实需要完全迁移，可以在系统稳定运行一段时间后再考虑。

