-- Repair tr_transactions_amount_guard_* after ensureTransactionsAllowZeroAmount()
-- incorrectly rejected negative ADJUSTMENT amounts. ADJUSTMENT matches submit_api /
-- allow_adjustment_signed_amount.sql (non-zero signed amount; from_account_id NULL).

DROP TRIGGER IF EXISTS `tr_transactions_amount_guard_bi`;
DROP TRIGGER IF EXISTS `tr_transactions_amount_guard_bu`;

DELIMITER //

CREATE TRIGGER `tr_transactions_amount_guard_bi`
BEFORE INSERT ON `transactions`
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ADJUSTMENT 金额不能为 0';
        END IF;
        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount < 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '金额不能小于 0';
        END IF;
    END IF;
END//

CREATE TRIGGER `tr_transactions_amount_guard_bu`
BEFORE UPDATE ON `transactions`
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ADJUSTMENT 金额不能为 0';
        END IF;
        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount < 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '金额不能小于 0';
        END IF;
    END IF;
END//

DELIMITER ;
