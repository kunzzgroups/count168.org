-- Ensure maintenance_marquee.prefix exists (c168_org may lack it after restore)
SET NAMES utf8mb4;

SET @has_prefix := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'maintenance_marquee'
    AND COLUMN_NAME = 'prefix'
);

SET @sql := IF(
  @has_prefix = 0,
  'ALTER TABLE `maintenance_marquee` ADD COLUMN `prefix` VARCHAR(100) NULL DEFAULT NULL COMMENT ''Marquee label prefix'' AFTER `content`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
