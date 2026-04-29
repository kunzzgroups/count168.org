# Owner 提交记录支持

## 概述

此更新为系统添加了对 owner 账号提交数据记录的支持。现在数据库可以区分是 owner 还是 user 提交的数据。

## 数据库修改

### 1. `submitted_processes` 表

**修改文件**: `add_owner_support_to_submitted_processes.sql`

**更改内容**:
- 添加 `user_type` 字段 (ENUM('user', 'owner')) 来区分提交者类型
- 删除 `user_id` 字段的外键约束（因为 owner 不在 user 表中）
- 添加索引 `idx_user_type_id` 以优化查询
- 更新现有数据，将所有现有记录标记为 'user' 类型

**执行步骤**:
```sql
-- 运行 SQL 脚本
source add_owner_support_to_submitted_processes.sql;
```

### 2. `data_captures` 表

**修改文件**: `add_owner_support_to_data_captures.sql`

**更改内容**:
- 添加 `user_type` 字段 (ENUM('user', 'owner')) 来区分提交者类型
- 添加索引 `idx_user_type_created_by` 以优化查询
- 更新现有数据，将所有现有记录标记为 'user' 类型

**执行步骤**:
```sql
-- 运行 SQL 脚本
source add_owner_support_to_data_captures.sql;
```

## 代码修改

### 1. `api/processes/submitted_processes_api.php`

**主要更改**:

1. **`saveSubmission()` 函数**:
   - 检查 session 中的 `user_type` 来确定是 owner 还是 user
   - 在插入 `submitted_processes` 时包含 `user_type` 字段

2. **查询函数** (`getWeekSubmissions`, `getSubmissionsByDate`):
   - 使用 `COALESCE(u.login_id, o.owner_code)` 来获取提交者名称
   - 通过 LEFT JOIN 同时关联 `user` 和 `owner` 表
   - 根据 `user_type` 字段选择正确的表进行关联

3. **权限检查**:
   - Owner 类型用户不需要权限限制（可以访问所有数据）
   - User 类型用户仍然使用 `process_permissions` 进行权限过滤

### 2. `api/datacapture_summary/summary_api.php`

**主要更改**:

1. **`submit` 操作**:
   - 检查 session 中的 `user_type` 来确定是 owner 还是 user
   - 在插入 `data_captures` 时包含 `user_type` 字段

## 使用说明

### 数据库迁移步骤

1. **备份数据库**（重要！）
   ```bash
   mysqldump -u username -p database_name > backup.sql
   ```

2. **执行 SQL 脚本**:
   ```bash
   mysql -u username -p database_name < add_owner_support_to_submitted_processes.sql
   mysql -u username -p database_name < add_owner_support_to_data_captures.sql
   ```

3. **验证修改**:
   ```sql
   -- 检查 submitted_processes 表结构
   DESCRIBE submitted_processes;
   
   -- 检查 data_captures 表结构
   DESCRIBE data_captures;
   
   -- 检查现有数据
   SELECT user_type, COUNT(*) FROM submitted_processes GROUP BY user_type;
   SELECT user_type, COUNT(*) FROM data_captures GROUP BY user_type;
   ```

### 功能验证

1. **Owner 提交测试**:
   - 使用 owner 账号登录
   - 在 `datacapture.php` 提交数据
   - 在 `datacapturesummary.php` 提交数据
   - 检查数据库中 `user_type` 字段是否为 'owner'

2. **User 提交测试**:
   - 使用 user 账号登录
   - 提交数据
   - 检查数据库中 `user_type` 字段是否为 'user'

3. **查询测试**:
   - 检查 `submitted_processes` 列表是否正确显示 owner 和 user 的提交记录
   - 验证 `submitted_by` 字段是否正确显示 owner_code 或 login_id

## 注意事项

1. **外键约束**: `submitted_processes` 表的外键约束已被移除，因为 owner 的 id 不在 `user` 表中。数据完整性现在通过应用层的 `user_type` 字段来保证。

2. **向后兼容**: 所有现有数据都被标记为 'user' 类型，确保向后兼容。

3. **Session 要求**: 代码依赖于 session 中的 `user_type` 字段。确保登录流程正确设置了此字段（在 `login_process.php` 中已设置）。

4. **权限处理**: Owner 类型用户不受 `process_permissions` 限制，可以访问所有数据。User 类型用户仍然受权限限制。

## 故障排除

### 问题：Owner 提交后数据未保存

**可能原因**:
- Session 中缺少 `user_type` 字段
- 数据库表未正确更新

**解决方法**:
1. 检查 session 数据：
   ```php
   var_dump($_SESSION);
   ```
2. 确认 `user_type` 在登录时已设置
3. 检查数据库表结构是否正确

### 问题：查询时显示 NULL 提交者

**可能原因**:
- LEFT JOIN 条件不正确
- Owner 或 User 表中缺少对应记录

**解决方法**:
1. 检查 SQL 查询中的 JOIN 条件
2. 验证 owner 和 user 表中是否存在对应的记录

## 相关文件

- `add_owner_support_to_submitted_processes.sql` - submitted_processes 表修改脚本
- `add_owner_support_to_data_captures.sql` - data_captures 表修改脚本
- `api/processes/submitted_processes_api.php` - 提交记录 API
- `api/datacapture_summary/summary_api.php` - 数据捕获摘要 API
- `login_process.php` - 登录处理（设置 user_type）

