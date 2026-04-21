-- Add sop column to bank_process so SOP and Remark can be stored separately (run once; skip if column already exists)
ALTER TABLE bank_process
  ADD COLUMN sop TEXT NULL AFTER insurance;
