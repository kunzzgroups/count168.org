# Data Capture Templates Process ID 迁移指南

## 概述
将 `data_capture_templates` 表的 `process_id` 字段从 `VARCHAR(50)`（存储 `process.process_id` 字符串）改为 `INT(11)`（存储 `process.id` 整数）。

## 迁移步骤

### 1. 执行 SQL 迁移脚本
运行 `migrate_data_capture_templates_process_id_to_int.sql` 脚本：

```bash
mysql -u username -p database_name < migrate_data_capture_templates_process_id_to_int.sql
```

或者在 phpMyAdmin 中执行脚本内容。

### 2. 代码更改说明

#### 已修改的文件：

1. **api/datacapture_summary/summary_api.php**
   - 移除了将 `process_id` 转换为 `VARCHAR(50)` 的代码
   - 修改了 `saveTemplateRow()` 函数，确保接收和存储的是 `process.id`（整数）
   - 添加了向后兼容性：如果接收到字符串类型的 `process_id`，会尝试查找对应的 `process.id`
   - 修改了 `fetchTemplates()` 函数的参数类型从 `?string` 改为 `?int`

2. **formula_maintenance_search_api.php**
   - 已经正确使用 `process.id`（整数）进行查询
   - 无需修改

### 3. 数据迁移说明

迁移脚本会：
1. 添加临时列 `process_id_new`
2. 通过 `JOIN process` 表，将现有的 `process_id`（varchar，如 'KKKAB'）转换为 `process.id`（int，如 273）
3. 删除旧的 `process_id` 列
4. 重命名 `process_id_new` 为 `process_id`
5. 重新创建索引和外键约束

### 4. 注意事项

- **备份数据**：在执行迁移前，请务必备份 `data_capture_templates` 表
- **测试环境**：建议先在测试环境执行迁移，验证无误后再在生产环境执行
- **数据完整性**：如果某些 `process_id`（varchar）在 `process` 表中找不到对应的记录，这些记录的 `process_id` 将被设置为 `NULL`
- **向后兼容**：代码中添加了向后兼容性处理，如果接收到字符串类型的 `process_id`，会尝试查找对应的 `process.id`

### 5. 验证迁移

迁移完成后，可以执行以下查询验证：

```sql
-- 检查 process_id 类型是否为 INT
SHOW COLUMNS FROM data_capture_templates LIKE 'process_id';

-- 检查数据是否正确迁移
SELECT dct.id, dct.process_id, p.process_id as process_name
FROM data_capture_templates dct
LEFT JOIN process p ON dct.process_id = p.id
LIMIT 10;

-- 检查是否有 process_id 为 NULL 的记录（这些可能是迁移时找不到对应 process 的记录）
SELECT COUNT(*) as null_count
FROM data_capture_templates
WHERE process_id IS NULL;
```

### 6. 回滚方案（如果需要）

如果需要回滚，可以执行以下步骤：

```sql
-- 1. 添加临时列存储字符串类型的 process_id
ALTER TABLE `data_capture_templates` 
ADD COLUMN `process_id_varchar` VARCHAR(50) DEFAULT NULL AFTER `process_id`;

-- 2. 将 process.id 转换回 process.process_id
UPDATE `data_capture_templates` dct
INNER JOIN `process` p ON dct.`process_id` = p.`id` 
SET dct.`process_id_varchar` = p.`process_id`
WHERE dct.`process_id` IS NOT NULL;

-- 3. 删除 INT 类型的 process_id
ALTER TABLE `data_capture_templates` DROP COLUMN `process_id`;

-- 4. 重命名回 VARCHAR
ALTER TABLE `data_capture_templates` CHANGE COLUMN `process_id_varchar` `process_id` VARCHAR(50) DEFAULT NULL;

-- 5. 重新创建索引
ALTER TABLE `data_capture_templates` DROP INDEX IF EXISTS `template_unique`;
ALTER TABLE `data_capture_templates` 
ADD UNIQUE KEY `template_unique` (`process_id`, `product_type`, `template_key`, `data_capture_id`);
```

## 完成

迁移完成后，`data_capture_templates.process_id` 将存储 `process.id`（整数）而不是 `process.process_id`（字符串）。

