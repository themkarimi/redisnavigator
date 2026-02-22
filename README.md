# RedisGUI

> A full-stack Redis management GUI — an open-source RedisInsight alternative

## Features
- Multi-connection support (Standalone, Sentinel, Cluster)
- Key browser with all data type editors (String, Hash, List, Set, ZSet, Stream)
- Embedded Redis CLI with command history
- Real-time Pub/Sub monitor
- Live metrics dashboard with charts
- Role-based access control (SuperAdmin, Admin, Operator, Viewer)
- JWT authentication with refresh tokens
- Connection credentials encrypted at rest (AES-256)
- Audit logging

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
git clone <repo-url>
cd redis-gui

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
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_ACCESS_SECRET` | Access token signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | - |
| `ENCRYPTION_KEY` | 32-char AES-256 key for credentials | - |
| `REDIS_BLACKLIST_URL` | Redis URL for token blacklist | - |
| `PORT` | Backend port | 4000 |

## RBAC Roles
| Role | Permissions |
|------|-------------|
| SuperAdmin | Full access: manage users, connections, all data |
| Admin | Manage own connections, invite users, view/edit data |
| Operator | Read and write keys on assigned connections |
| Viewer | Read-only access on assigned connections |

## Running Tests
```bash
cd backend
npm test
```

## License
MIT
