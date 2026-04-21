-- Resend 弹窗日程：仅在 accounting_resend_relax_created_floor=1 期间参与 Inbox/入账；入账成功后与 relax 一并清空。
-- 若线上已由 PHP bmp_ensureBankProcessAccountingResendScheduleColumns 自动添加，可跳过本脚本。

ALTER TABLE bank_process
    ADD COLUMN accounting_resend_schedule_day_start DATE NULL COMMENT 'Resend 弹窗 day_start，仅 relax 期间',
    ADD COLUMN accounting_resend_schedule_day_end DATE NULL COMMENT 'Resend 弹窗 day_end，仅 relax 期间',
    ADD COLUMN accounting_resend_schedule_frequency VARCHAR(40) NULL COMMENT 'monthly 或 1st_of_every_month，仅 relax 期间';
