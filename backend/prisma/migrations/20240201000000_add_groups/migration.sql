-- AlterEnum: add group-related audit actions
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_GROUP';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_GROUP';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_GROUP';
ALTER TYPE "AuditAction" ADD VALUE 'ADD_GROUP_MEMBER';
ALTER TYPE "AuditAction" ADD VALUE 'REMOVE_GROUP_MEMBER';
ALTER TYPE "AuditAction" ADD VALUE 'ASSIGN_GROUP_CONNECTION';
ALTER TYPE "AuditAction" ADD VALUE 'REMOVE_GROUP_CONNECTION';

-- CreateTable: Group
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateTable: GroupMember
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: GroupConnectionRole
CREATE TABLE "GroupConnectionRole" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissions" "Permission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupConnectionRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupConnectionRole_groupId_connectionId_key" ON "GroupConnectionRole"("groupId", "connectionId");

-- CreateIndex
CREATE INDEX "GroupConnectionRole_groupId_idx" ON "GroupConnectionRole"("groupId");

-- CreateIndex
CREATE INDEX "GroupConnectionRole_connectionId_idx" ON "GroupConnectionRole"("connectionId");

-- AddForeignKey
ALTER TABLE "GroupConnectionRole" ADD CONSTRAINT "GroupConnectionRole_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupConnectionRole" ADD CONSTRAINT "GroupConnectionRole_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RedisConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
