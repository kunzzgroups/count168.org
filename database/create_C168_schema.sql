-- C168 database: portal / fee / notices only (from u857194726_count168_no_definer.sql structures).
-- Replace `C168` with your hosting DB name if different (e.g. u857194726_C168).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `C168` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `C168`;

-- NOTE: The dump has no table named `group_list_fee_setting`.
-- This definition mirrors `domain_list_fee_settings` so both fee configs stay aligned.
-- Adjust columns if your app expects a different shape.

CREATE TABLE `group_list_fee_setting` (
  `id` tinyint(3) UNSIGNED NOT NULL,
  `price` decimal(25,8) DEFAULT NULL,
  `maintenance_fee` decimal(14,4) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `domain_list_fee_settings` (
  `id` tinyint(3) UNSIGNED NOT NULL,
  `price` decimal(25,8) DEFAULT NULL,
  `maintenance_fee` decimal(14,4) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `announcements` (
  `id` int(11) NOT NULL,
  `title` varchar(500) NOT NULL COMMENT '公告标题',
  `content` text NOT NULL COMMENT '公告详细内容',
  `company_code` varchar(50) NOT NULL DEFAULT 'C168' COMMENT '公司代码，只有C168可见',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active' COMMENT '公告状态',
  `created_by` int(11) NOT NULL COMMENT '创建者用户ID',
  `user_type` enum('user','owner') NOT NULL DEFAULT 'user',
  `created_at` timestamp NULL DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统公告表 - 存储所有公告信息';

CREATE TABLE `maintenance_marquee` (
  `id` int(11) NOT NULL,
  `content` text NOT NULL COMMENT '维护内容文本',
  `company_code` varchar(50) NOT NULL DEFAULT 'C168' COMMENT '公司代码，只有C168可见',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active' COMMENT '维护内容状态',
  `created_by` int(11) NOT NULL COMMENT '创建者用户ID',
  `user_type` enum('user','owner') NOT NULL DEFAULT 'user' COMMENT '创建者类型：user 或 owner',
  `created_at` timestamp NULL DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统维护跑马灯表 - 存储所有维护内容信息';

ALTER TABLE `group_list_fee_setting`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `domain_list_fee_settings`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `announcements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company_code` (`company_code`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_created_by` (`created_by`),
  ADD KEY `idx_user_type_created_by` (`user_type`,`created_by`);

ALTER TABLE `maintenance_marquee`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company_code` (`company_code`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_user_type_created_by` (`user_type`,`created_by`);

ALTER TABLE `announcements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `maintenance_marquee`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

SET FOREIGN_KEY_CHECKS = 1;
