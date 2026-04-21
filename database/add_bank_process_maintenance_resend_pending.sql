-- 首次在 Maintenance 删除 Bank process 入账交易时会自动建表；也可手动执行本脚本。
CREATE TABLE IF NOT EXISTS bank_process_maintenance_resend_pending (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    bank_process_id INT NOT NULL,
    process_accounting_posted_id INT NULL,
    period_type VARCHAR(64) NOT NULL DEFAULT 'monthly',
    transaction_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bmp_resend_pap (process_accounting_posted_id),
    UNIQUE KEY uq_bmp_resend_fallback (company_id, bank_process_id, period_type, transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
