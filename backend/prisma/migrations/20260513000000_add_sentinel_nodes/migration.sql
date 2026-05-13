-- AlterTable: add sentinelNodes JSON field to RedisConnection for Sentinel cluster support
ALTER TABLE "RedisConnection" ADD COLUMN "sentinelNodes" JSONB;
