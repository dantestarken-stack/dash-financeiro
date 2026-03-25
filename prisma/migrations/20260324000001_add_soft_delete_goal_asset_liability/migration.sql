-- AddColumn: deletedAt para Goal, Asset e Liability (soft delete)
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Liability" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
