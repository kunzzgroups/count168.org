-- deleted_logs: 统一删除审计 + 恢复元数据（新环境执行本文件即可）

CREATE TABLE IF NOT EXISTS `deleted_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user` VARCHAR(100) NULL,
  `company_id` VARCHAR(50) NULL,
  `page` VARCHAR(100) NULL,
  `table_name` VARCHAR(100) NOT NULL,
  `record_id` VARCHAR(100) NULL,
  `action_type` VARCHAR(50) NOT NULL DEFAULT 'DELETE',
  `ip_address` VARCHAR(45) NULL,
  `deleted_data` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_deleted_logs_company_created` (`company_id`, `created_at`),
  KEY `idx_deleted_logs_table` (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 若线上已有旧版 deleted_logs 表且缺少下列列，请手工执行（列已存在则跳过对应行）:
--
-- ALTER TABLE deleted_logs ADD COLUMN user VARCHAR(100);
-- ALTER TABLE deleted_logs ADD COLUMN company_id VARCHAR(50);
-- ALTER TABLE deleted_logs ADD COLUMN page VARCHAR(100);
-- ALTER TABLE deleted_logs ADD COLUMN table_name VARCHAR(100);
-- ALTER TABLE deleted_logs ADD COLUMN record_id VARCHAR(100);
-- ALTER TABLE deleted_logs ADD COLUMN action_type VARCHAR(50) DEFAULT 'DELETE';
-- ALTER TABLE deleted_logs ADD COLUMN ip_address VARCHAR(45);
-- ALTER TABLE deleted_logs ADD COLUMN deleted_data JSON;
-- ALTER TABLE deleted_logs ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
