-- AlterTable: add connectionName to AuditLog for human-readable connection identification
ALTER TABLE "AuditLog" ADD COLUMN "connectionName" TEXT;
