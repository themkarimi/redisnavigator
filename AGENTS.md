# RedisNavigator Workspace Instructions

See README.md for product overview, deployment options, and end-user setup. This file is only for agent defaults that should apply across the repo.

## Architecture

- `backend/` is a Node.js + Express + TypeScript API with Prisma, Socket.IO, and Jest.
- `frontend/` is a React + Vite + TypeScript SPA using Tailwind, Zustand, and React Query.
- `nginx/` proxies `/api` and `/socket.io` to the backend and serves the frontend in containerized setups.
- `helm/redis-navigator/` contains the Kubernetes chart. Treat it as deployment config, not app source.

## Build And Test

- Backend install and dev: `cd backend && npm install && npm run prisma:generate && npm run dev`
- Backend build: `cd backend && npm run build`
- Backend tests: `cd backend && npm test`
- Frontend install and dev: `cd frontend && npm install && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npm run lint`
- Full stack with containers: `docker-compose up -d`

## Conventions

- Keep changes scoped to the relevant app. Most tasks are either backend-only or frontend-only.
- Backend uses Prisma Client and Zod-heavy route validation. Prefer extending existing route, middleware, and service patterns over introducing new abstractions.
- Frontend uses React Query for server state and Zustand for app state. Prefer adding or updating hooks in `frontend/src/hooks/` instead of fetching directly inside pages.
- Frontend imports use the `@/` alias. Backend uses relative imports.
- Route additions usually require changes in both `backend/src/index.ts` and `frontend/src/services/api.ts` or the corresponding frontend hook.
- New pages should follow the existing lazy-route pattern in `frontend/src/App.tsx`.

## Prisma Workflow

- Schema changes belong in `backend/prisma/schema.prisma`.
- Create a new migration with `cd backend && npx prisma migrate dev --name <name>`; do not edit old migration folders unless the user explicitly asks for migration surgery.
- After schema changes, run `cd backend && npm run prisma:generate` before building or testing.
- `backend/docker-entrypoint.sh` runs `prisma migrate deploy` and the seed script on container startup. If a containerized change affects startup, check that flow.

## Safety Notes

- Do not edit generated or build output such as `backend/dist/`, `frontend/dist/`, or `node_modules/`.
- `DATABASE_URL` must be valid for backend work. `ENCRYPTION_KEY` must be exactly 32 characters for the AES setup in `backend/src/config/env.ts`.
- Backend env defaults include fallback JWT and encryption secrets for development only. Do not normalize those into production-facing code or docs.
- When `CONFIG_FILE` is set, config-as-code mode is active and write operations for connections and groups are intentionally blocked by middleware. Respect that behavior in backend and frontend changes.

## Editing Guidance

- Prefer fixing behavior at the source layer that owns it: routes and services in the backend, hooks and pages/components in the frontend.
- Preserve strict TypeScript compatibility in both apps.
- For backend permission-sensitive work, check existing middleware and role logic before changing route behavior.
- For frontend data mutations, invalidate the existing React Query keys instead of adding ad hoc refresh logic.

## Useful Files

- `backend/src/index.ts`: backend route registration and Socket.IO setup
- `backend/src/config/env.ts`: environment defaults and feature flags
- `backend/src/services/config-loader.ts`: config-as-code behavior
- `backend/src/utils/rolePermissions.ts`: RBAC defaults
- `frontend/src/App.tsx`: route topology and lazy loading
- `frontend/src/services/api.ts`: axios client and auth refresh handling
- `frontend/src/hooks/`: established data-fetching and mutation patterns

## Suggested Next Split

- If agent work starts concentrating on Prisma or backend auth, add `backend/AGENTS.md` with migration and testing specifics.
- If agent work starts concentrating on UI work, add `frontend/AGENTS.md` with component, hook, and store conventions.
