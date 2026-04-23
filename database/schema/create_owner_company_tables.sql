-- ===============================================
-- Schema additions for owner / company hierarchy
-- ===============================================
-- Run this script against your MySQL/MariaDB database:
--   mysql -u <user> -p <database> < database/schema/create_owner_company_tables.sql
--
-- The design enforces:
--   * Each owner can be linked to many companies.
--   * Each company references exactly one owner (via FK constraint).


-- 1) Owner table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_code VARCHAR(50) NOT NULL COMMENT 'Business identifier for the owner',
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NULL UNIQUE,
    phone VARCHAR(50) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_by VARCHAR(50) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_owner_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2) Company table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS company (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(50) NOT NULL UNIQUE COMMENT 'External/business identifier for the company',
    owner_id INT UNSIGNED NOT NULL COMMENT 'FK to owner.id',
    name VARCHAR(150) NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_by VARCHAR(50) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_company_owner
        FOREIGN KEY (owner_id) REFERENCES owner(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    INDEX idx_company_owner (owner_id),
    INDEX idx_company_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Optional helper view tying owners to their companies ----------------------
-- DROP VIEW IF EXISTS view_owner_companies;
-- CREATE VIEW view_owner_companies AS
-- SELECT
--     o.id            AS owner_pk,
--     o.owner_code    AS owner_code,
--     o.name          AS owner_name,
--     o.email         AS owner_email,
--     c.id            AS company_pk,
--     c.company_id    AS company_code,
--     c.name          AS company_name,
--     c.status        AS company_status
-- FROM owner o
-- JOIN company c ON c.owner_id = o.id;


