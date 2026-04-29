-- Add ADJUSTMENT to transaction_type columns only when the column is an ENUM.
-- If transaction_type is already VARCHAR or already contains ADJUSTMENT, this migration is a no-op.

DROP PROCEDURE IF EXISTS add_adjustment_transaction_type;

DELIMITER //
CREATE PROCEDURE add_adjustment_transaction_type()
BEGIN
    DECLARE v_column_type TEXT;
    DECLARE v_is_nullable VARCHAR(3);
    DECLARE v_default_value TEXT;
    DECLARE v_sql TEXT;

    SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      INTO v_column_type, v_is_nullable, v_default_value
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'transactions'
       AND COLUMN_NAME = 'transaction_type'
     LIMIT 1;

    IF v_column_type IS NOT NULL
       AND LOWER(v_column_type) LIKE 'enum(%'
       AND v_column_type NOT LIKE '%''ADJUSTMENT''%' THEN
        SET v_column_type = CONCAT(LEFT(v_column_type, CHAR_LENGTH(v_column_type) - 1), ',''ADJUSTMENT'')');
        SET v_sql = CONCAT(
            'ALTER TABLE `transactions` MODIFY COLUMN `transaction_type` ',
            v_column_type,
            IF(v_is_nullable = 'NO', ' NOT NULL', ' NULL'),
            IF(v_default_value IS NULL, '', CONCAT(' DEFAULT ', QUOTE(v_default_value)))
        );
        SET @stmt = v_sql;
        PREPARE stmt FROM @stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//
DELIMITER ;

CALL add_adjustment_transaction_type();

DROP PROCEDURE IF EXISTS add_adjustment_transaction_type;

DROP PROCEDURE IF EXISTS add_adjustment_deleted_transaction_type;

DROP PROCEDURE IF EXISTS add_adjustment_backup_transaction_type;

DELIMITER //
CREATE PROCEDURE add_adjustment_backup_transaction_type()
BEGIN
    DECLARE v_column_type TEXT;
    DECLARE v_is_nullable VARCHAR(3);
    DECLARE v_default_value TEXT;
    DECLARE v_sql TEXT;

    SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      INTO v_column_type, v_is_nullable, v_default_value
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'transactions_backup'
       AND COLUMN_NAME = 'transaction_type'
     LIMIT 1;

    IF v_column_type IS NOT NULL
       AND LOWER(v_column_type) LIKE 'enum(%'
       AND v_column_type NOT LIKE '%''ADJUSTMENT''%' THEN
        SET v_column_type = CONCAT(LEFT(v_column_type, CHAR_LENGTH(v_column_type) - 1), ',''ADJUSTMENT'')');
        SET v_sql = CONCAT(
            'ALTER TABLE `transactions_backup` MODIFY COLUMN `transaction_type` ',
            v_column_type,
            IF(v_is_nullable = 'NO', ' NOT NULL', ' NULL'),
            IF(v_default_value IS NULL, '', CONCAT(' DEFAULT ', QUOTE(v_default_value)))
        );
        SET @stmt = v_sql;
        PREPARE stmt FROM @stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//
DELIMITER ;

CALL add_adjustment_backup_transaction_type();

DROP PROCEDURE IF EXISTS add_adjustment_backup_transaction_type;

DELIMITER //
CREATE PROCEDURE add_adjustment_deleted_transaction_type()
BEGIN
    DECLARE v_column_type TEXT;
    DECLARE v_is_nullable VARCHAR(3);
    DECLARE v_default_value TEXT;
    DECLARE v_sql TEXT;

    SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      INTO v_column_type, v_is_nullable, v_default_value
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'transactions_deleted'
       AND COLUMN_NAME = 'transaction_type'
     LIMIT 1;

    IF v_column_type IS NOT NULL
       AND LOWER(v_column_type) LIKE 'enum(%'
       AND v_column_type NOT LIKE '%''ADJUSTMENT''%' THEN
        SET v_column_type = CONCAT(LEFT(v_column_type, CHAR_LENGTH(v_column_type) - 1), ',''ADJUSTMENT'')');
        SET v_sql = CONCAT(
            'ALTER TABLE `transactions_deleted` MODIFY COLUMN `transaction_type` ',
            v_column_type,
            IF(v_is_nullable = 'NO', ' NOT NULL', ' NULL'),
            IF(v_default_value IS NULL, '', CONCAT(' DEFAULT ', QUOTE(v_default_value)))
        );
        SET @stmt = v_sql;
        PREPARE stmt FROM @stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//
DELIMITER ;

CALL add_adjustment_deleted_transaction_type();

DROP PROCEDURE IF EXISTS add_adjustment_deleted_transaction_type;
