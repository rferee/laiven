# Laiven — Claude Code Instructions

Laiven is a self-hosted conlang (constructed language) management platform.

## Architecture

```
laiven/
├── server/          # Fastify + TypeScript + Drizzle ORM + PostgreSQL + Redis
├── client/          # Vite + React + TypeScript + Mantine v7 + React Flow
├── docker-compose.yml         # Dev: PostgreSQL + Redis
├── docker-compose.deploy.yml  # Deployment example
└── .gitlab-ci.yml             # CI pipeline
```

**Backend** runs on port 3001. **Frontend** dev server on 5173, production build served via Nginx/Caddy.

## Getting started (dev)

```bash
sudo docker compose up -d

cd server && npm install
npx drizzle-kit push --force
npm run db:seed                
npm run dev                    

cd client && npm install
npm run dev
```

Seed credentials: `admin@laiven.local` / `admin123!`

## Testing

```bash
cd server && npm test
cd client && npm test
```

Tests use real PostgreSQL + Redis (backend) and jsdom + mocks (frontend). The backend seeds before each run. Rate limiter is mocked in tests.

## Deployment

- `docker-compose.deploy.yml` — example for production deployment
- `.gitlab-ci.yml` — builds Docker images and optionally deploys
- Server listens on `0.0.0.0:3001`; client builds to `client/dist/` served by Nginx
- Environment variables in `.env` (see `.env.example`)