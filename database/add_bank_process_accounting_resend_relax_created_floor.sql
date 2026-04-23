-- Resend → Accounting Due：放宽「旧数据不拿」创建日门槛（与 day_start 取 min），入账成功后清零。
ALTER TABLE bank_process
    ADD COLUMN accounting_resend_relax_created_floor TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=最近一次 Maintenance+Resend 后 Inbox 用 min(创建日,day_start) 作门槛';
