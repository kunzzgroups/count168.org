-- Financial-grade money precision migration.
-- Run once before relying on string amount APIs and decimal.js/BC Math calculations.

ALTER TABLE transactions
    MODIFY COLUMN amount DECIMAL(25,8) NOT NULL;

ALTER TABLE transactions_deleted
    MODIFY COLUMN amount DECIMAL(25,8) NOT NULL;

ALTER TABLE transaction_entry
    MODIFY COLUMN amount DECIMAL(25,8) NOT NULL;

ALTER TABLE data_capture_details
    MODIFY COLUMN processed_amount DECIMAL(25,8) NULL,
    MODIFY COLUMN rate DECIMAL(25,8) NULL;

ALTER TABLE data_capture_templates
    MODIFY COLUMN last_processed_amount DECIMAL(25,8) NULL;

ALTER TABLE bank_process
    MODIFY COLUMN insurance DECIMAL(25,8) NULL,
    MODIFY COLUMN cost DECIMAL(25,8) NULL,
    MODIFY COLUMN price DECIMAL(25,8) NULL,
    MODIFY COLUMN profit DECIMAL(25,8) NULL;

ALTER TABLE account
    MODIFY COLUMN alert_amount DECIMAL(25,8) NULL;

ALTER TABLE domain_list_fee_settings
    MODIFY COLUMN price DECIMAL(25,8) NULL;
