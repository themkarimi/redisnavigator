---
description: "Implement a RedisNavigator full-stack feature that may touch backend routes, frontend hooks/pages, and optionally Prisma schema or migrations."
name: "Full-Stack Feature"
argument-hint: "Describe the feature, affected user flow, API behavior, and any schema or permission changes"
agent: "agent"
---
Implement the requested RedisNavigator feature end to end: $ARGUMENTS

Follow the workspace defaults in [AGENTS.md](../../AGENTS.md).

Use these scoped instructions when relevant:
- [backend-routes.instructions.md](../instructions/backend-routes.instructions.md) for Express route handlers, validation, RBAC, audit logging, and route registration.
- [frontend-hooks-query.instructions.md](../instructions/frontend-hooks-query.instructions.md) for frontend data fetching, hooks, mutations, and query invalidation.
- [prisma-workflow.instructions.md](../instructions/prisma-workflow.instructions.md) if the feature changes schema, models, migrations, or seed compatibility.

Execution requirements:
- Identify whether the work is backend-only, frontend-only, or full-stack before editing.
- Reuse existing patterns before introducing new abstractions.
- If the feature adds or changes an API endpoint, update both the backend route wiring and the matching frontend hook or API call path.
- If the feature changes persisted data, update Prisma-related code and follow the migration workflow.
- Keep changes scoped and avoid touching generated output or unrelated files.

Implementation checklist:
- Find the closest existing feature pattern in the backend routes, frontend hooks, and relevant pages.
- Implement backend changes first when the frontend depends on new API behavior.
- Register new backend routes in `backend/src/index.ts` if needed.
- Add or update frontend hooks under `frontend/src/hooks/` rather than fetching directly inside pages.
- Update the page or component that consumes the feature and keep query invalidation aligned with the changed data.
- Update tests or add focused coverage when backend behavior changes.
- Run the smallest relevant validation commands for the files you changed and report what was or was not verified.

Response requirements:
- Make the code changes instead of only describing them.
- Summarize the implemented behavior, the files changed, and any validation performed.
- Call out follow-up risks or gaps if a part of the feature could not be verified locally.