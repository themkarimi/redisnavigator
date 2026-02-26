-- AlterTable: make connectionId nullable in UserConnectionRole
-- This allows global roles (e.g. SUPERADMIN) without needing a placeholder connection.
ALTER TABLE "UserConnectionRole" ALTER COLUMN "connectionId" DROP NOT NULL;
