-- Seed / update IT users for maintenance bypass
USE `u857194726_c168site`;
SET NAMES utf8mb4;
START TRANSACTION;

SET @hash_it_jk = '$argon2id$v=19$m=65536,t=4,p=1$Vk0yZXAzUXpwYzJ0THhzcw$N1RvElxOmvMFvG3KONiSkPYvRX0I58kM4Yb2I8wrC0g';
SET @hash_it_js = '$argon2id$v=19$m=65536,t=4,p=1$NHp0QXlzWEhSNGtFN1pyZQ$nQxBA3RjQ72f7Ng+s0IpNu4RT9nJhNEe2oen/foKnyg';
SET @hash_it_ms = '$argon2id$v=19$m=65536,t=4,p=1$Z09RODVKdkd4cVBWN09vdA$B6R/5qdqkClG/3isPzdJ8p6XCo4UETM/PLaap+qbUzw';

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_JK', 'IT_JK', @hash_it_jk, 'it_jk@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_JK' LIMIT 1
);

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_JS', 'IT_JS', @hash_it_js, 'it_js@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_JS' LIMIT 1
);

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_MS', 'IT_MS', @hash_it_ms, 'it_ms@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_MS' LIMIT 1
);

UPDATE `user`
SET
  `password` = @hash_it_jk,
  `status` = 'active',
  `role` = 'admin',
  `read_only` = 0,
  `remember_token` = NULL,
  `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_JK';

UPDATE `user`
SET
  `password` = @hash_it_js,
  `status` = 'active',
  `role` = 'admin',
  `read_only` = 0,
  `remember_token` = NULL,
  `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_JS';

UPDATE `user`
SET
  `password` = @hash_it_ms,
  `status` = 'active',
  `role` = 'admin',
  `read_only` = 0,
  `remember_token` = NULL,
  `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_MS';

INSERT IGNORE INTO `user_company_map` (`user_id`, `company_id`)
SELECT u.id, c.id
FROM `user` u
JOIN `company` c ON 1 = 1
WHERE UPPER(TRIM(u.`login_id`)) IN ('IT_JK', 'IT_JS', 'IT_MS');

INSERT IGNORE INTO `user_company_permissions` (
  `user_id`, `company_id`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`
)
SELECT u.id, c.id, NULL, NULL, NOW(), NOW()
FROM `user` u
JOIN `company` c ON 1 = 1
WHERE UPPER(TRIM(u.`login_id`)) IN ('IT_JK', 'IT_JS', 'IT_MS');

UPDATE `user_company_permissions` ucp
JOIN `user` u ON u.id = ucp.user_id
SET
  ucp.`account_permissions` = NULL,
  ucp.`process_permissions` = NULL,
  ucp.`updated_at` = NOW()
WHERE UPPER(TRIM(u.`login_id`)) IN ('IT_JK', 'IT_JS', 'IT_MS');

COMMIT;
