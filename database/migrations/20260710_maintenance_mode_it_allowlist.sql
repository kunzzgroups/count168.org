-- Global maintenance mode + IT allowlist tables
USE `u857194726_c168site`;
SET NAMES utf8mb4;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `system_runtime_flags` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `maintenance_mode_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `maintenance_message_id` INT NULL,
  `updated_by` VARCHAR(50) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_runtime_flags` (
  `id`, `maintenance_mode_enabled`, `maintenance_message_id`, `updated_by`
) VALUES (
  1, 0, NULL, 'system-init'
);

CREATE TABLE IF NOT EXISTS `system_it_allowlist` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `login_id` VARCHAR(50) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `remark` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_system_it_allowlist_login_id` (`login_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_it_allowlist` (`login_id`, `enabled`, `remark`)
VALUES
  ('IT_JK', 1, 'maintenance IT allowlist'),
  ('IT_JS', 1, 'maintenance IT allowlist'),
  ('IT_MS', 1, 'maintenance IT allowlist');

UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_JK';
UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_JS';
UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_MS';

COMMIT;
