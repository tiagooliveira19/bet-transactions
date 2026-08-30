# bet-transactions

Distributed financial service for wagering operations. The system stays correct when messages are duplicated, reordered, or processed by several instances.

## Stack

- Bun 1.x (runtime, package manager, `bun test`)
- TypeScript strict + NestJS
- MikroORM + PostgreSQL
- AWS SQS via MiniStack
- Keycloak (OIDC)
- Docker Compose

## Setup

```bash
cp .env.example .env
docker compose up -d postgres ministack keycloak
cd backend
bun install
bun run migration:up
bun run start:dev
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/health/live and `/health/ready`
- Keycloak: http://localhost:8080

## Commands

```bash
cd backend
bun run lint
bun run format
bun run test:unit
bun run test:integration    # requires Compose
bun run test:concurrency    # requires Compose
bun run test:e2e            # requires Compose + Keycloak
bun run migration:up
bun run migration:down
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [docs/DOMAIN.md](docs/DOMAIN.md)
- [docs/OPERATIONS.md](docs/OPERATIONS.md)
