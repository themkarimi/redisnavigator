-- AlterTable: make password nullable and add oidcSub
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "oidcSub" TEXT;
CREATE UNIQUE INDEX "User_oidcSub_key" ON "User"("oidcSub");
