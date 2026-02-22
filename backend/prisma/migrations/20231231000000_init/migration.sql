-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('READ_KEY', 'WRITE_KEY', 'DELETE_KEY', 'MANAGE_CONNECTION', 'MANAGE_USERS');

-- CreateEnum
CREATE TYPE "ConnectionMode" AS ENUM ('STANDALONE', 'SENTINEL', 'CLUSTER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'CREATE_CONNECTION', 'UPDATE_CONNECTION', 'DELETE_CONNECTION', 'READ_KEY', 'WRITE_KEY', 'DELETE_KEY', 'EXECUTE_CLI', 'INVITE_USER', 'UPDATE_USER_ROLE', 'DELETE_USER', 'EXPORT_CONNECTIONS', 'IMPORT_CONNECTIONS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "RedisConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 6379,
    "passwordEnc" TEXT,
    "username" TEXT,
    "useTLS" BOOLEAN NOT NULL DEFAULT false,
    "mode" "ConnectionMode" NOT NULL DEFAULT 'STANDALONE',
    "sentinelMaster" TEXT,
    "tags" TEXT[],
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedisConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedisConnection_ownerId_idx" ON "RedisConnection"("ownerId");

-- AddForeignKey
ALTER TABLE "RedisConnection" ADD CONSTRAINT "RedisConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UserConnectionRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissions" "Permission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConnectionRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserConnectionRole_userId_connectionId_key" ON "UserConnectionRole"("userId", "connectionId");

-- CreateIndex
CREATE INDEX "UserConnectionRole_userId_idx" ON "UserConnectionRole"("userId");

-- CreateIndex
CREATE INDEX "UserConnectionRole_connectionId_idx" ON "UserConnectionRole"("connectionId");

-- AddForeignKey
ALTER TABLE "UserConnectionRole" ADD CONSTRAINT "UserConnectionRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnectionRole" ADD CONSTRAINT "UserConnectionRole_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedisConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resourceKey" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_connectionId_idx" ON "AuditLog"("connectionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedisConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
