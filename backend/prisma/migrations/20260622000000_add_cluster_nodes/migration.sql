-- AlterTable: add clusterNodes JSON field to RedisConnection for Redis Cluster seed nodes
ALTER TABLE "RedisConnection" ADD COLUMN "clusterNodes" JSONB;
