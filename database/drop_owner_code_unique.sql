-- 允许 owner 表存在多个相同 owner_code（Domain 可创建重复 Owner Code）
-- 执行一次即可。若索引不存在会报错，可忽略。
-- 执行方式：mysql -u 用户名 -p 数据库名 < database/drop_owner_code_unique.sql

ALTER TABLE owner DROP INDEX owner_code;
