-- Add remark column to bank_process for Add Process modal (run once; skip if column already exists)
ALTER TABLE bank_process
  ADD COLUMN remark VARCHAR(500) NULL DEFAULT NULL AFTER insurance;
