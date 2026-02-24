# RedisNavigator

> A full-stack Redis management GUI — an open-source RedisInsight alternative

## Features
- Multi-connection support (Standalone, Sentinel, Cluster)
- Key browser with all data type editors (String, Hash, List, Set, ZSet, Stream)
- Embedded Redis CLI with command history
- Real-time Pub/Sub monitor
- Live metrics dashboard with charts
- Role-based access control (SuperAdmin, Admin, Operator, Viewer)
- JWT authentication with refresh tokens
- OIDC / SSO login support
- Connection credentials encrypted at rest (AES-256)
- Configuration-as-code (connections & groups via YAML)
- Audit logging
- Configurable command blocklist (per-instance or global)

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Cache/Queue | Redis (via ioredis) |
| Auth | JWT + bcrypt + HttpOnly cookies |
| Real-time | Socket.IO |

## Quick Start

### With Docker (recommended)

```bash
# 1. Clone and enter project
git clone https://github.com/themkarimi/redisnavigator.git
cd redisnavigator

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your secrets

# 3. Start all services
docker-compose up -d

# 4. Open the app
open http://localhost:3000
```

### Manual Setup

**Backend:**
```bash
cd backend
npm install
cp .env.example .env  # Edit with your config
npx prisma migrate dev
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Node environment | `development` |
| `PORT` | Backend port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_ACCESS_SECRET` | Access token signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | - |
| `ENCRYPTION_KEY` | 32-char AES-256 key for credentials | - |
| `REDIS_BLACKLIST_URL` | Redis URL for token blacklist | - |
| `REDIS_BLACKLIST_PASSWORD` | Redis password for token blacklist | - |
| `FRONTEND_URL` | Frontend origin (used for CORS) | `http://localhost:3000` |
| `OIDC_ENABLED` | Enable OIDC/SSO login | `false` |
| `OIDC_ISSUER_URL` | OIDC provider issuer URL | - |
| `OIDC_CLIENT_ID` | OIDC client ID | - |
| `OIDC_CLIENT_SECRET` | OIDC client secret | - |
| `OIDC_REDIRECT_URI` | OIDC callback URL | - |
| `CONFIG_FILE` | Path to config-as-code YAML file | - |
| `DISABLED_COMMANDS` | Comma-separated Redis commands to block in the CLI and key browser (e.g. `FLUSHDB,FLUSHALL`) | - |

### Frontend (`frontend/.env.local`)
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_OIDC_ENABLED` | Show OIDC login button in the UI | `false` |

## RBAC Roles
| Role | Permissions |
|------|-------------|
| SuperAdmin | Full access: manage users, connections, all data |
| Admin | Manage own connections, invite users, view/edit data |
| Operator | Read and write keys on assigned connections |
| Viewer | Read-only access on assigned connections |

## Configuration-as-Code

You can pre-provision Redis connections and user groups by pointing `CONFIG_FILE` at a YAML file. The file is read on every startup — entries are created or updated, nothing is deleted automatically.

```bash
cp backend/config.example.yaml backend/config.yaml
# Edit config.yaml, then set CONFIG_FILE in backend/.env:
CONFIG_FILE=./config.yaml
```

See [`backend/config.example.yaml`](backend/config.example.yaml) for a fully annotated example.

## Helm Deployment

A Helm chart is available under [`helm/redis-navigator`](helm/redis-navigator) for Kubernetes deployments.

```bash
# Install with default values (adjust as needed)
helm install redis-navigator ./helm/redis-navigator \
  --set backend.secret.jwtAccessSecret=<secret> \
  --set backend.secret.jwtRefreshSecret=<secret> \
  --set backend.secret.encryptionKey=<32-char-key> \
  --set externalDatabase.host=<postgres-host> \
  --set externalDatabase.password=<db-password> \
  --set redisBlacklist.url=redis://<redis-host>:6379
```

Key values in `helm/redis-navigator/values.yaml`:

| Key | Description |
|-----|-------------|
| `backend.image.repository` | Backend image (`ghcr.io/themkarimi/redis-navigator-backend`) |
| `frontend.image.repository` | Frontend image (`ghcr.io/themkarimi/redis-navigator-frontend`) |
| `ingress.enabled` | Expose via Kubernetes Ingress |
| `ingress.host` | External hostname (e.g. `redis-navigator.example.com`) |
| `oidc.enabled` | Enable OIDC/SSO |
| `configFile.enabled` | Mount a config-as-code YAML into the backend |
| `disabledCommands` | Comma-separated Redis commands to block in the CLI and key browser |

## Running Tests
```bash
cd backend
npm test
```

## License
MIT
