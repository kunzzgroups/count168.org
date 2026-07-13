-- Summary submit: idempotency key on data_captures + preserve rate * / semantics on details.
-- submit_request_id: frontend UUID per submit session.
-- rate_expression: raw "*3" / "/3" / "3"; rate DECIMAL kept for legacy readers.
--
-- Runtime APIs do NOT ALTER TABLE - apply this migration before deploy.

SET NAMES utf8mb4;

ALTER TABLE `data_captures`
  ADD COLUMN IF NOT EXISTS `submit_request_id` VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Client submit idempotency key (UUID)' AFTER `remark`;

ALTER TABLE `data_capture_details`
  ADD COLUMN IF NOT EXISTS `rate_expression` VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Original rate text e.g. *3 /3 3' AFTER `rate`;

-- Dual-tenant uniqueness (only when scope columns exist).
SET @has_scope := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'data_captures'
    AND column_name = 'scope_type'
);
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'data_captures'
    AND index_name = 'uk_dc_submit_request'
);
SET @sql := IF(
  @has_scope > 0 AND @idx_exists = 0,
  'ALTER TABLE `data_captures` ADD UNIQUE KEY `uk_dc_submit_request` (`scope_type`, `scope_id`, `process_id`, `capture_date`, `currency_id`, `submit_request_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Company / non-dual fallback uniqueness.
SET @idx_company_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'data_captures'
    AND index_name = 'uk_dc_submit_request_company'
);
SET @sql_company := IF(
  @idx_company_exists = 0,
  'ALTER TABLE `data_captures` ADD UNIQUE KEY `uk_dc_submit_request_company` (`company_id`, `process_id`, `capture_date`, `currency_id`, `submit_request_id`)',
  'SELECT 1'
);
PREPARE stmt_company FROM @sql_company;
EXECUTE stmt_company;
DEALLOCATE PREPARE stmt_company;
