# Account Company ID 移除总结

## 已完成的修改

### 1. 核心 API 文件
- ✅ **account_company_api.php** - 移除主公司检查逻辑，允许移除任何公司关联（类似 user）
- ✅ **addaccountapi.php** - 移除 INSERT 中的 company_id，创建账户后通过 account_company 表关联
- ✅ **updateaccountapi.php** - 移除所有 company_id 检查，只使用 account_company 表验证权限
- ✅ **getaccountapi.php** - 移除所有 company_id 检查，只使用 account_company 表查询
- ✅ **toggleaccountstatusapi.php** - 移除所有 company_id 检查，只使用 account_company 表
- ✅ **accountlistapi.php** - 移除所有 company_id 检查，只使用 account_company 表查询账户列表
- ✅ **account-list.php** - 修改删除逻辑，只使用 account_company 表
- ✅ **account_currency_api.php** - 移除所有 company_id 检查，只使用 account_company 表验证

### 2. 主要改动点

#### account_company_api.php
- 移除了"不能移除主公司关联"的检查
- 添加了 `will_lose_access` 标志，当移除当前公司关联时提示用户

#### addaccountapi.php
- INSERT 语句不再包含 `company_id` 字段
- 创建账户后，必须至少添加一个 `account_company` 关联
- 如果没有提供 `company_ids`，默认使用当前 `company_id`

#### updateaccountapi.php, getaccountapi.php, toggleaccountstatusapi.php
- 所有查询都改为使用 `INNER JOIN account_company` 而不是 `LEFT JOIN` 和 `OR a.company_id = ?`
- 移除了向后兼容的 `account.company_id` 检查

#### account-list.php
- 删除账户时，先删除 `account_company` 关联
- 如果账户还有其他公司关联，只删除关联，不删除账户本身
- 如果账户没有其他公司关联了，才删除账户本身

## 还需要修改的文件

### Transaction 相关文件（api/transactions/）
- ⏳ **submit_api.php** - 需要移除所有 `account.company_id` 检查
- ⏳ **get_accounts_api.php** - 需要移除所有 `account.company_id` 检查
- ⏳ **search_api.php** - 可能需要检查

### 其他可能使用 account.company_id 的文件
- ⏳ **api/formula_maintenance/update_api.php** - 第 90 行使用了 `account.company_id`
- ⏳ **api/datacapture_summary/summary_api.php** - 第 1614 行使用了 `account.company_id`
- ⏳ **其他报表和查询文件** - 需要全面检查

## SQL 迁移脚本

已创建 `remove_account_company_id_column.sql`，包含：
1. 数据迁移：将 `account.company_id` 迁移到 `account_company` 表
2. 验证迁移结果
3. 检查孤立账户
4. 删除外键约束和索引
5. 删除 `company_id` 列

## 注意事项

1. **执行 SQL 脚本前必须备份数据库**
2. **确保所有账户都有至少一个 `account_company` 关联**
3. **测试所有功能，特别是：**
   - 创建账户
   - 更新账户
   - 删除账户
   - 切换账户公司关联
   - 交易相关功能
   - 报表功能

## 下一步

1. 继续修改 transaction 相关文件
2. 检查并修改其他使用 `account.company_id` 的文件
3. 在测试环境执行 SQL 脚本
4. 全面测试所有功能
5. 在生产环境执行迁移

