-- =============================================================================
-- DBeaver: Summary submit idempotency + rate_expression
-- 选中目标库（生产 live，与 count168.site 相同的那个）后：
--   每次只选中下面 ONE 条语句（含分号），Ctrl+Enter 单独执行。
-- 不要整文件 Execute Script（PREPARE 块在部分 DBeaver 会拆乱）。
-- 若报 Duplicate column / Duplicate key name → 已存在，跳过即可。
-- =============================================================================

-- 1) idempotency key
ALTER TABLE `data_captures`
  ADD COLUMN `submit_request_id` VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Client submit idempotency key (UUID)' AFTER `remark`;

-- 2) preserve *3 / /3 text
ALTER TABLE `data_capture_details`
  ADD COLUMN `rate_expression` VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Original rate text e.g. *3 /3 3' AFTER `rate`;

-- 3) company-scope unique (通常需要)
ALTER TABLE `data_captures`
  ADD UNIQUE KEY `uk_dc_submit_request_company`
  (`company_id`, `process_id`, `capture_date`, `currency_id`, `submit_request_id`);

-- 4) 仅当 data_captures 已有 scope_type / scope_id 时再执行；否则跳过
--    可先跑：SHOW COLUMNS FROM data_captures LIKE 'scope_type';
ALTER TABLE `data_captures`
  ADD UNIQUE KEY `uk_dc_submit_request`
  (`scope_type`, `scope_id`, `process_id`, `capture_date`, `currency_id`, `submit_request_id`);

-- 5) 校验（整段可一次执行）
SELECT
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'data_captures' AND column_name = 'submit_request_id') AS has_submit_request_id,
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'data_capture_details' AND column_name = 'rate_expression') AS has_rate_expression;
