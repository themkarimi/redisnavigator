-- AlterEnum: add audit actions for Redis ACL user management
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_ACL_USER';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_ACL_USER';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_ACL_USER';
