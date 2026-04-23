-- ===============================================
-- company_selected_banks: 每个公司每个 Country 在下拉中显示的已选 Bank 列表（持久化，登出/换设备/隔几小时后仍保持）
-- ===============================================
-- Run: mysql -u <user> -p <database> < database/company_selected_banks.sql

CREATE TABLE IF NOT EXISTS company_selected_banks (
    company_id INT UNSIGNED NOT NULL,
    country VARCHAR(100) NOT NULL,
    bank VARCHAR(200) NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, country, bank),
    INDEX idx_company_selected_banks_company (company_id),
    INDEX idx_company_selected_banks_country (company_id, country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
