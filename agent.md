# RedisNavigator - Agent Guide

## Project Overview

**RedisNavigator** is a full-stack Redis management GUI and open-source alternative to RedisInsight. It provides comprehensive Redis connection management, key browsing, real-time monitoring, and role-based access control.

## Repository Structure

```
redisnavigator/
├── backend/          # Node.js + Express + TypeScript backend
│   ├── src/         # TypeScript source code
│   ├── prisma/      # Prisma ORM schema and migrations
│   ├── .env.example # Backend environment template
│   ├── config.example.yaml  # Configuration-as-code template
│   └── package.json
├── frontend/         # React 18 + TypeScript + Vite frontend
│   ├── src/
│   │   ├── pages/   # Main application pages
│   │   ├── components/
│   │   │   └── ui/  # shadcn/ui components (Radix UI primitives)
│   │   └── ...
│   ├── .env.example
│   └── package.json
├── nginx/            # Nginx reverse proxy configuration
├── helm/             # Kubernetes Helm chart for deployment
│   └── redis-navigator/
├── docker-compose.yaml  # Development environment orchestration
└── README.md
```

## Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Redis Client**: ioredis
- **Authentication**: JWT + bcrypt + HttpOnly cookies
- **Real-time**: Socket.IO
- **Security**: helmet, express-rate-limit, AES-256 encryption
- **Logging**: winston
- **Testing**: Jest

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (built on Radix UI)
- **State Management**: Zustand
- **Routing**: react-router-dom
- **Data Fetching**: @tanstack/react-query (React Query)
- **Forms**: react-hook-form + zod validation
- **Charts**: recharts
- **Real-time**: socket.io-client
- **Icons**: lucide-react

## Build & Development Commands

### Backend
```bash
cd backend
npm install                    # Install dependencies
npm run dev                    # Start development server (ts-node-dev)
npm run build                  # Compile TypeScript to dist/
npm start                      # Run production build
npm test                       # Run Jest tests
npm run prisma:generate        # Generate Prisma client
npm run prisma:migrate         # Run database migrations
npm run prisma:studio          # Open Prisma Studio GUI
```

### Frontend
```bash
cd frontend
npm install                    # Install dependencies
npm run dev                    # Start Vite dev server
npm run build                  # Build for production (tsc + vite build)
npm run preview                # Preview production build
npm run lint                   # Run ESLint
```

### Docker
```bash
docker-compose up -d           # Start all services (Postgres, Redis sample, backend, frontend, nginx)
docker-compose down            # Stop all services
docker-compose logs -f backend # View backend logs
```

## Important Conventions

### Code Style
- **TypeScript**: Strict mode enabled in both backend and frontend
- **React Components**: Functional components with TypeScript interfaces
- **shadcn/ui Pattern**: UI components in `frontend/src/components/ui/` follow shadcn conventions
- **State Management**: Zustand stores for global state
- **API Communication**: React Query for data fetching with axios

### Backend Patterns
- **Prisma ORM**: All database operations through Prisma Client
- **Security**: Credentials encrypted at rest using AES-256
- **Authentication**: JWT access tokens + refresh tokens in HttpOnly cookies
- **Validation**: Zod schemas for request validation
- **Logging**: Structured logging with winston

### Frontend Patterns
- **Pages**: Main route components in `frontend/src/pages/`
- **Components**: Reusable UI components following shadcn/ui patterns
- **Styling**: Tailwind utility classes with cn() helper for conditional classes
- **Forms**: react-hook-form + zod resolvers for validation
- **API Calls**: Centralized with React Query hooks

## Environment Configuration

### Backend (`backend/.env`)
Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - JWT access token signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token signing secret
- `ENCRYPTION_KEY` - 32-character AES-256 key for encrypting Redis credentials
- `FRONTEND_URL` - Frontend origin for CORS (default: http://localhost:3000)
- `PORT` - Backend port (default: 4000)

Optional:
- `OIDC_ENABLED` - Enable OIDC/SSO login
- `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` - OIDC configuration
- `CONFIG_FILE` - Path to configuration-as-code YAML file
- `DISABLED_COMMANDS` - Comma-separated Redis commands to block (e.g., `FLUSHDB,FLUSHALL`)

### Frontend (`frontend/.env.local`)
- `VITE_OIDC_ENABLED` - Show OIDC login button in UI (default: false)

## Key Features

1. **Multi-connection Support**: Standalone, Sentinel, Cluster
2. **Key Browser**: Full CRUD for all Redis data types (String, Hash, List, Set, ZSet, Stream)
3. **Embedded Redis CLI**: Command execution with history
4. **Pub/Sub Monitor**: Real-time message monitoring
5. **Metrics Dashboard**: Live charts and statistics
6. **RBAC**: SuperAdmin, Admin, Operator, Viewer roles
7. **Security**: JWT authentication, encrypted credentials, command blocklist
8. **Configuration-as-Code**: YAML-based connection and group provisioning
9. **Audit Logging**: Track user actions
10. **OIDC/SSO Support**: Enterprise authentication integration

## Default Credentials
- **Username**: `admin@redisnavigator.local`
- **Password**: `Admin123!`

⚠️ Change these credentials immediately after first login.

## Database Migrations

The backend uses Prisma for database migrations:
- Schema: `backend/prisma/schema.prisma`
- Migrations: `backend/prisma/migrations/`
- Seed script: `backend/prisma/seed.ts` (creates default admin user)

To create a new migration:
```bash
cd backend
npx prisma migrate dev --name <migration_name>
```

## Deployment

### Docker Compose (Development)
The `docker-compose.yaml` includes:
- PostgreSQL database
- Sample Redis instance (with password: `samplepassword`)
- Backend API (port 4000)
- Frontend build
- Nginx reverse proxy (port 8888)

### Kubernetes (Production)
Helm chart available in `helm/redis-navigator/`:
```bash
helm install redis-navigator ./helm/redis-navigator \
  --set backend.secret.jwtAccessSecret=<secret> \
  --set backend.secret.jwtRefreshSecret=<secret> \
  --set backend.secret.encryptionKey=<32-char-key> \
  --set externalDatabase.host=<postgres-host> \
  --set externalDatabase.password=<db-password>
```

## Configuration-as-Code

The backend supports YAML-based configuration for pre-provisioning:
- Redis connections
- User groups
- Connection assignments

See `backend/config.example.yaml` for examples. Enable by setting `CONFIG_FILE` environment variable.

## Testing

- **Backend**: Jest with ts-jest (currently configured with `--passWithNoTests`)
- **Frontend**: No test framework configured yet

## Common Workflows

### Adding a New Backend Route
1. Create route handler in `backend/src/routes/`
2. Add Zod validation schemas
3. Integrate with Prisma models
4. Update API client in frontend

### Adding a New Frontend Page
1. Create page component in `frontend/src/pages/`
2. Add route in router configuration
3. Create necessary UI components in `frontend/src/components/`
4. Add React Query hooks for data fetching
5. Update Zustand stores if needed

### Adding a UI Component
Follow shadcn/ui patterns:
1. Place in `frontend/src/components/ui/`
2. Use Radix UI primitives with Tailwind styling
3. Export with proper TypeScript types

## License
MIT
