-- Add issue_flag column to bank_process for Process List status dropdown (run once; skip if column already exists)
ALTER TABLE bank_process
  ADD COLUMN issue_flag VARCHAR(20) NULL DEFAULT NULL AFTER status;
