# RedisNavigator - Agent Guide

## Project Overview

**RedisNavigator** is a full-stack Redis management GUI and open-source alternative to RedisInsight. It provides comprehensive Redis connection management, key browsing, real-time monitoring, and role-based access control.

## Repository Structure

```
redisnavigator/
├── backend/                   # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── __tests__/         # Jest test files (9 test suites)
│   │   ├── config/            # env, logger, prisma client setup
│   │   ├── middleware/        # auth, rbac, audit, configAsCode
│   │   ├── routes/            # Express route handlers
│   │   ├── services/          # config-loader (YAML provisioning)
│   │   ├── sockets/           # Socket.IO pubsub + metrics namespaces
│   │   ├── types/             # Shared TypeScript type definitions
│   │   ├── utils/             # encryption, jwt, rolePermissions, maskKey
│   │   └── index.ts           # App entry point
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── migrations/        # Prisma migration files
│   │   └── seed.ts            # Seeds default admin user
│   ├── .env.example           # Backend environment template
│   ├── config.example.yaml    # Configuration-as-code template
│   └── package.json
├── frontend/                  # React 18 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── features/      # Feature-specific components
│   │   │   ├── layout/        # AppLayout, PrivateRoute, sidebar
│   │   │   └── ui/            # shadcn/ui primitives (Radix UI based)
│   │   ├── hooks/             # Custom React hooks (useConnections, useKeys, …)
│   │   ├── pages/             # Top-level route page components
│   │   ├── services/          # axios API client (api.ts)
│   │   ├── store/             # Zustand stores
│   │   ├── types/             # Shared TypeScript types
│   │   └── utils/             # Utility helpers
│   ├── .env.example
│   └── package.json
├── nginx/                     # Nginx reverse proxy config
├── helm/                      # Kubernetes Helm chart
│   └── redis-navigator/
├── docker-compose.yaml        # Full dev environment (Postgres, Redis, backend, frontend, nginx)
├── seed_redis.py              # Python script to seed a Redis instance with sample data
└── README.md
```

## Technology Stack

### Backend
- **Runtime**: Node.js 20 with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Redis Client**: ioredis
- **Authentication**: JWT (access 15 min / refresh 7 d) + bcrypt + HttpOnly cookies
- **Real-time**: Socket.IO
- **Security**: helmet, express-rate-limit, AES-256 encryption (crypto-js)
- **Logging**: winston
- **Config-as-code**: js-yaml
- **Testing**: Jest + ts-jest

### Frontend
- **Framework**: React 18 (lazy-loaded routes)
- **Build Tool**: Vite 5
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS + tailwindcss-animate
- **UI Components**: shadcn/ui (built on Radix UI)
- **State Management**: Zustand
- **Routing**: react-router-dom v6
- **Data Fetching**: @tanstack/react-query v5
- **Forms**: react-hook-form + zod validation
- **Charts**: recharts
- **Real-time**: socket.io-client
- **Icons**: lucide-react

## Build & Development Commands

### Backend
```bash
cd backend
npm install                     # Install dependencies
npm run dev                     # Start dev server (ts-node-dev --respawn)
npm run build                   # Compile TypeScript → dist/
npm start                       # Run compiled production build
npm test                        # Run Jest test suites
npm run test:watch              # Run Jest in watch mode
npm run prisma:generate         # Regenerate Prisma client after schema changes
npm run prisma:migrate          # Apply migrations (dev)
npm run prisma:push             # Push schema changes without a migration file
npm run prisma:seed             # Seed default admin user
npm run prisma:studio           # Open Prisma Studio GUI
```

### Frontend
```bash
cd frontend
npm install                     # Install dependencies
npm run dev                     # Start Vite dev server (port 3000)
npm run build                   # Type-check + bundle for production
npm run preview                 # Preview production build locally
npm run lint                    # Run ESLint (src/**/*.{ts,tsx})
```

### Docker
```bash
docker-compose up -d            # Start all services
docker-compose down             # Stop all services
docker-compose logs -f backend  # Tail backend logs
```

## Environment Configuration

### Backend (`backend/.env`)

**Required:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | JWT access token signing secret |
| `JWT_REFRESH_SECRET` | JWT refresh token signing secret |
| `ENCRYPTION_KEY` | 32-character AES-256 key for encrypting Redis credentials |

**Optional (with defaults):**

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `4000` | Backend HTTP port |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin for CORS |
| `SESSION_TIMEOUT_HOURS` | `168` (7 days) | Non-rolling session lifetime in hours |
| `OIDC_ENABLED` | `false` | Enable OIDC/SSO login |
| `OIDC_ISSUER_URL` | – | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | – | OIDC application client ID |
| `OIDC_CLIENT_SECRET` | – | OIDC application client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:4000/api/auth/oidc/callback` | OIDC callback URL |
| `CONFIG_FILE` | – | Path to configuration-as-code YAML file |
| `DISABLED_COMMANDS` | – | Comma-separated Redis commands to block (e.g. `FLUSHDB,FLUSHALL`) |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_OIDC_ENABLED` | `false` | Show OIDC login button in the UI |

## API Routes

All routes are prefixed with `/api`. Authentication via HttpOnly cookie (`accessToken`).

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check (no auth required) |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/logout` | Logout (revoke refresh token) |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/oidc` | Initiate OIDC login flow |
| GET | `/api/auth/oidc/callback` | OIDC callback handler |
| GET/POST/PUT/DELETE | `/api/users` | User management (SUPERADMIN/ADMIN) |
| GET/POST/PUT/DELETE | `/api/groups` | Group management |
| GET/POST/PUT/DELETE | `/api/connections` | Redis connection management |
| GET/POST/PUT/DELETE | `/api/connections/:id/keys` | Key browser CRUD |
| POST | `/api/connections/:id/cli` | Execute Redis CLI command |
| GET | `/api/connections/:id/stats` | Connection stats / server info |
| GET | `/api/features` | Feature flags (`configAsCode`, `disabledCommands`) |

### Socket.IO Namespaces
- `/pubsub` – Real-time Pub/Sub message monitoring
- `/metrics` – Live metrics streaming (memory, CPU, keyspace, etc.)

## Frontend Routes

| Path | Page | Auth Required |
|---|---|---|
| `/login` | `LoginPage` | No |
| `/oidc/callback` | `OidcCallbackPage` | No |
| `/connections` | `ConnectionsPage` | Yes |
| `/connections/:id/keys` | `KeyBrowserPage` | Yes |
| `/connections/:id/cli` | `CLIPage` | Yes |
| `/connections/:id/pubsub` | `PubSubPage` | Yes |
| `/connections/:id/metrics` | `MetricsPage` | Yes |
| `/settings` | `SettingsPage` | Yes |
| `/users` | `UsersPage` | Yes (ADMIN+) |
| `/groups` | `GroupsPage` | Yes (ADMIN+) |

## RBAC Roles & Permissions

| Role | READ_KEY | WRITE_KEY | DELETE_KEY | MANAGE_CONNECTION | MANAGE_USERS |
|---|---|---|---|---|---|
| SUPERADMIN | ✓ | ✓ | ✓ | ✓ | ✓ |
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ |
| OPERATOR | ✓ | ✓ | ✓ | – | – |
| VIEWER | ✓ | – | – | – | – |

Default permissions are defined in `backend/src/utils/rolePermissions.ts` (`ROLE_PERMISSIONS`).

## Key Features

1. **Multi-connection Support**: Standalone, Sentinel, Cluster
2. **Key Browser**: Full CRUD for all Redis data types (String, Hash, List, Set, ZSet, Stream)
3. **Embedded Redis CLI**: Command execution with history
4. **Pub/Sub Monitor**: Real-time message monitoring
5. **Metrics Dashboard**: Live charts and statistics
6. **RBAC**: SuperAdmin, Admin, Operator, Viewer roles with fine-grained permissions
7. **Security**: JWT authentication, AES-256 encrypted credentials, command blocklist
8. **Configuration-as-Code**: YAML-based connection and group provisioning
9. **Audit Logging**: Track all user actions (see `AuditAction` enum in schema)
10. **OIDC/SSO Support**: Enterprise authentication via openid-client

## Default Credentials
- **Username**: `admin@redisnavigator.local`
- **Password**: `Admin123!`

⚠️ Change these credentials immediately after first login.

## Database

- **ORM**: Prisma
- **Schema**: `backend/prisma/schema.prisma`
- **Migrations**: `backend/prisma/migrations/`
- **Seed**: `backend/prisma/seed.ts` (creates default SUPERADMIN user)

Key Prisma models: `User`, `RedisConnection`, `UserConnectionRole`, `Group`, `GroupMember`, `GroupConnectionRole`, `AuditLog`, `RefreshToken`.

To create a new migration:
```bash
cd backend
npx prisma migrate dev --name <migration_name>
```

## Zustand Stores (`frontend/src/store/`)

| Store file | Purpose |
|---|---|
| `authStore.ts` | Current user, login/logout state |
| `connectionStore.ts` | Selected connection, connection list |
| `settingsStore.ts` | User preferences / settings |
| `themeStore.ts` | Dark/light theme toggle |

## Custom React Hooks (`frontend/src/hooks/`)

| Hook | Purpose |
|---|---|
| `useConnections` | Fetch + mutate Redis connections |
| `useKeys` | Key browsing, search, CRUD |
| `useServerInfo` | Server info / stats polling |
| `useFeatures` | Feature flags from `/api/features` |
| `use-toast` | Toast notification helper |

## Backend Middleware (`backend/src/middleware/`)

| File | Purpose |
|---|---|
| `auth.middleware.ts` | JWT verification, attach `req.user` |
| `rbac.middleware.ts` | Permission checking per route |
| `audit.middleware.ts` | Log user actions to `AuditLog` |
| `configAsCode.middleware.ts` | Block write operations when `CONFIG_AS_CODE` is active |

## Deployment

### Docker Compose (Development)
The `docker-compose.yaml` includes:
- PostgreSQL database
- Sample Redis instance (password: `samplepassword`)
- Backend API (port 4000)
- Frontend build served by nginx
- Nginx reverse proxy (port 8888)

### Kubernetes (Production)
Helm chart in `helm/redis-navigator/`:
```bash
helm install redis-navigator ./helm/redis-navigator \
  --set backend.secret.jwtAccessSecret=<secret> \
  --set backend.secret.jwtRefreshSecret=<secret> \
  --set backend.secret.encryptionKey=<32-char-key> \
  --set externalDatabase.host=<postgres-host> \
  --set externalDatabase.password=<db-password>
```

## Configuration-as-Code

Setting `CONFIG_FILE` enables config-as-code mode. In this mode the UI **disables** creation, editing, and deletion of connections and groups (enforced by `configAsCode.middleware.ts`).

Supported YAML sections:
- `connections` – Redis instances (host, port, password, TLS, mode, tags)
- `groups` – User groups with members and per-connection role/permission assignments

Environment variable references (`${VAR_NAME}`) are resolved at startup. See `backend/config.example.yaml` for a full example.

## Testing

### Backend
- **Framework**: Jest + ts-jest
- **Location**: `backend/src/__tests__/`
- **Test suites**: `auth.middleware`, `rbac.middleware`, `audit.middleware`, `audit.utils`, `configAsCode.middleware`, `config-loader`, `disabled-commands`, `oidc.routes`, `user-management`
- **Run**: `cd backend && npm test`
- **Watch mode**: `cd backend && npm run test:watch`

### Frontend
- No test framework configured. ESLint is the only static analysis tool available.

## Important Conventions

- **TypeScript strict mode** in both backend and frontend
- **Prisma Client** for all database access — never raw SQL
- **Redis credentials** are always AES-256 encrypted at rest (`encryption.ts`)
- **JWT tokens**: access token (15 min, in cookie) + refresh token (7 d, in HttpOnly cookie + DB)
- **cn() helper** for conditional Tailwind class merging (`clsx` + `tailwind-merge`)
- **React Query** for all remote data fetching — avoid local loading state unless necessary
- **Zod** for request validation (backend) and form validation (frontend)

## Common Workflows

### Adding a New Backend Route
1. Create route handler in `backend/src/routes/<name>.routes.ts`
2. Add Zod schemas for request body / params validation
3. Apply `authMiddleware` and `rbacMiddleware` as needed
4. Integrate with Prisma models
5. Register the router in `backend/src/index.ts`
6. Update the API client in `frontend/src/services/api.ts`

### Adding a New Frontend Page
1. Create page component in `frontend/src/pages/<Name>Page.tsx`
2. Add the route in `frontend/src/App.tsx`
3. Create feature components in `frontend/src/components/features/`
4. Add or update React Query hooks in `frontend/src/hooks/`
5. Update Zustand stores if global state changes are needed

### Adding a Prisma Model / Column
1. Edit `backend/prisma/schema.prisma`
2. Run `cd backend && npx prisma migrate dev --name <name>`
3. Run `npm run prisma:generate` if types need refreshing in the same shell
4. Update affected routes, services, and types

### Adding a shadcn/ui Component
1. Place in `frontend/src/components/ui/`
2. Use the appropriate Radix UI primitive with Tailwind styling
3. Export with a named export and proper TypeScript props interface

## License
MIT
