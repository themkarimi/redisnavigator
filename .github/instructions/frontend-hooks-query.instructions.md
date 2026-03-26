---
description: "Use when changing frontend data fetching, React Query hooks, API mutations, or page-level server state in the RedisNavigator frontend. Covers hooks-first data access and query invalidation patterns."
name: "Frontend Hooks And Query"
applyTo: "frontend/src/{hooks,pages,services}/**/*.{ts,tsx}"
---
# Frontend Hooks And Query

- Put server reads and writes behind hooks in `frontend/src/hooks/` instead of fetching directly inside pages.
- Reuse the shared axios client in `frontend/src/services/api.ts` for authenticated requests.
- Use React Query `useQuery` and `useMutation` for server state. Keep query keys stable and scoped by resource, as in `['connections']`, `['keys', connectionId, params]`, and `['key', connectionId, key]`.
- After mutations, invalidate the existing React Query keys that own the stale data instead of adding manual refresh state.
- Keep pages focused on rendering, navigation, and local UI state. Move API orchestration into hooks.
- When a hook also updates Zustand state, follow the existing pattern of syncing derived data from the query result rather than replacing React Query with store-managed fetching.
- Use the frontend `@/` import alias where the file already follows that convention.
- If a backend route is added or changed, update the relevant frontend hook or API call path instead of scattering raw endpoint strings across multiple pages.