-- Make dueDate optional for Income records
-- This allows incomes (especially commissions) to exist without a fixed due date

ALTER TABLE "Income" ALTER COLUMN "dueDate" DROP NOT NULL;
