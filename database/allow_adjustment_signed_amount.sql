-- Allow ADJUSTMENT to carry a signed amount while keeping other transaction types positive.
-- This replaces legacy transactions BEFORE INSERT/UPDATE validation triggers that reject every amount <= 0.

DROP PROCEDURE IF EXISTS drop_transactions_before_validation_triggers;

DELIMITER //

CREATE PROCEDURE drop_transactions_before_validation_triggers()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_trigger_name VARCHAR(255);
    DECLARE cur CURSOR FOR
        SELECT TRIGGER_NAME
          FROM INFORMATION_SCHEMA.TRIGGERS
         WHERE TRIGGER_SCHEMA = DATABASE()
           AND EVENT_OBJECT_TABLE = 'transactions'
           AND ACTION_TIMING = 'BEFORE'
           AND EVENT_MANIPULATION IN ('INSERT', 'UPDATE');
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_trigger_name;
        IF done = 1 THEN
            LEAVE read_loop;
        END IF;
        SET @drop_sql = CONCAT('DROP TRIGGER IF EXISTS `', REPLACE(v_trigger_name, '`', '``'), '`');
        PREPARE stmt FROM @drop_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END LOOP;
    CLOSE cur;
END//

DELIMITER ;

CALL drop_transactions_before_validation_triggers();

DROP PROCEDURE IF EXISTS drop_transactions_before_validation_triggers;

DELIMITER //

CREATE TRIGGER before_transaction_insert
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT amount cannot be 0';
        END IF;

        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '金额必须大于 0';
        END IF;
    END IF;

    IF NEW.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'CLEAR') THEN
        IF NEW.from_account_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR 交易必须有 From Account';
        END IF;

        IF NEW.from_account_id = NEW.account_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'From Account 和 To Account 不能相同';
        END IF;
    END IF;
END//

CREATE TRIGGER before_transaction_update
BEFORE UPDATE ON transactions
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT amount cannot be 0';
        END IF;

        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '金额必须大于 0';
        END IF;
    END IF;

    IF NEW.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'CLEAR') THEN
        IF NEW.from_account_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR 交易必须有 From Account';
        END IF;

        IF NEW.from_account_id = NEW.account_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'From Account 和 To Account 不能相同';
        END IF;
    END IF;
END//

DELIMITER ;
