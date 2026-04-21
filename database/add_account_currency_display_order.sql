-- 按账号永久化货币显示顺序（Member Win/Loss 页可拖拽排序）
-- 执行一次即可；若表已存在可跳过

CREATE TABLE IF NOT EXISTS `account_currency_display_order` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL COMMENT '账户ID（关联 account.id）',
  `currency_order` text DEFAULT NULL COMMENT '货币代码显示顺序，JSON 数组如 ["JPY","MYR"]',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_account` (`account_id`),
  KEY `idx_account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户货币显示顺序 - Member 页拖拽排序持久化';
