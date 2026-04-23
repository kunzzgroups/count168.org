-- 每笔 Bank process 入账交易单独记录 period_type，使同一天 monthly / inactive / partial_first_month 分开显示
-- 执行前请备份数据库。若使用 transactions_backup 触发器，需先给 transactions_backup 表加同名列并更新触发器。

ALTER TABLE `transactions`
  ADD COLUMN `source_bank_process_period_type` VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'Bank 入账类型：monthly / partial_first_month / manual_inactive'
  AFTER `source_bank_process_id`;

-- 可选：若存在 transactions_backup 表且需备份此列，可执行：
-- ALTER TABLE `transactions_backup`
--   ADD COLUMN `source_bank_process_period_type` VARCHAR(32) NULL DEFAULT NULL
--   COMMENT 'Bank 入账类型：monthly / partial_first_month / manual_inactive'
--   AFTER `source_bank_process_id`;
-- 并修改 trg_transactions_backup_insert / trg_transactions_backup_update 触发器，在 INSERT 列表中加入 source_bank_process_period_type。
