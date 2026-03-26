---
description: "Use when adding or changing Express routes, backend API handlers, request validation, RBAC checks, or route registration in RedisNavigator. Covers route structure, middleware order, and frontend wiring expectations."
name: "Backend Route Workflow"
applyTo: "backend/src/routes/**/*.ts"
---
# Backend Route Workflow

- Follow the existing Express route-module pattern: import `Router`, define Zod schemas near the top, apply shared middleware, then export the router.
- Protect routes with the existing auth and RBAC middleware instead of open-coding permission checks inside handlers.
- Use `requireRole(...)` for role-gated routes and `requirePermission(...)` for connection-scoped capability checks.
- Respect config-as-code behavior. For writes to connections or groups, include `requireConfigEditable` where the existing routes do.
- Use `auditLog(...)` on mutating routes when the action should be recorded in `AuditLog`.
- Parse request bodies with Zod and return `400` with validation details on `ZodError`, matching the existing route style.
- Keep handlers focused on orchestration and persistence. Reuse services and utilities such as encryption or Redis connection helpers instead of duplicating that logic in the route.
- If you add a new route module, register it in `backend/src/index.ts`.
- Route changes that affect the UI usually require a matching update in `frontend/src/services/api.ts` or the corresponding hook in `frontend/src/hooks/`.