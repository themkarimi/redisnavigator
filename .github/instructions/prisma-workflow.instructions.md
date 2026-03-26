---
description: "Use when changing Prisma schema, database models, migrations, seed data, or backend persistence. Covers RedisNavigator migration safety and required follow-up steps."
name: "Prisma Workflow"
applyTo: "backend/prisma/**"
---
# Prisma Workflow

- Make schema changes in `backend/prisma/schema.prisma`.
- Create a new migration with `cd backend && npx prisma migrate dev --name <name>`.
- Do not edit existing migration folders unless the task is explicitly migration repair or migration surgery.
- Run `cd backend && npm run prisma:generate` after schema changes and before build or test commands.
- Treat `prisma db push` as an exception path. Prefer migrations for normal feature work.
- Update the affected backend routes, services, tests, and types after model changes instead of leaving the change isolated to Prisma.
- If startup behavior may change, check `backend/docker-entrypoint.sh` because container startup runs `prisma migrate deploy` and the seed script.
- Keep Prisma changes minimal and review whether `backend/prisma/seed.ts` needs to stay compatible with the new schema.