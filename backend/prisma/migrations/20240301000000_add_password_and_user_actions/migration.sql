-- AlterEnum: add password change and user creation audit actions
ALTER TYPE "AuditAction" ADD VALUE 'CHANGE_PASSWORD';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_USER';
