-- ===============================================
-- company_selected_countries: 每个公司在下拉中显示的已选 Country 列表（持久化，登出/换设备/隔几小时后仍保持）
-- ===============================================
-- Run: mysql -u <user> -p <database> < database/company_selected_countries.sql

CREATE TABLE IF NOT EXISTS company_selected_countries (
    company_id INT UNSIGNED NOT NULL,
    country VARCHAR(100) NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, country),
    INDEX idx_company_selected_countries_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
