# Architecture

This service processes wagering operations (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`) from multiple game providers. Correctness under duplication, reordering, crashes and multiple instances is the design constraint — not CRUD convenience.

## Boundaries

```
HTTP / SQS
    → application use cases
        → domain aggregates (Wallet, WagerTransaction, Ledger, Inbox, Outbox)
            → persistence ports (MikroORM + PostgreSQL)
```

Domain classes have no NestJS or MikroORM decorators. Persistence entities live under `infrastructure/`. HTTP and SQS share `SubmitWagerUseCase`.

## Why MikroORM

The challenge prefers MikroORM because `EntityManager.transactional()`, the Unit of Work and `LockMode` are first-class. Prisma is out of scope. TypeORM would work, but Identity Map + explicit `LockMode.PESSIMISTIC_WRITE` / `PESSIMISTIC_PARTIAL_WRITE` (SKIP LOCKED) map directly to the wallet and outbox strategies.

`Money` is never an ORM type. It is persisted as `NUMERIC(20,2)` + `CHAR(3)` and rehydrated through `Money.rehydrate`.

## Concurrency

The unit of concurrency is `walletId`.

Inside the financial transaction the wallet row is locked with `SELECT … FOR UPDATE`. Distinct wallets proceed in parallel. There is no process-wide lock.

`version` increments only when the balance changes and is stored on the wallet as a secondary invariant. The primary race control is the pessimistic lock: two 80.00 bets against 100.00 serialize on the same row, so exactly one debit commits.

Idempotency is a unique constraint on `idempotency_key`, not a memory cache and not SQS FIFO deduplication.

## Messaging

MiniStack emulates SQS FIFO + DLQ on `localhost:4566`. No AWS account is required. FIFO `MessageGroupId` / `MessageDeduplicationId` are optimizations. The database remains the source of truth.

Inbound: `wager-transactions.fifo` → DLQ `wager-transactions-dlq.fifo` after 5 receives.

Outbound: transactional outbox → `wallet-events.fifo`. Publishers claim due rows with `FOR UPDATE SKIP LOCKED` in the same SQL transaction that marks them published. A crash after SQS send and before commit republishes the same `eventId` (safe for consumers).

Inbox `(consumer_name, message_id)` is written in the same SQL transaction as the financial mutation. Ack happens only after commit. Redelivery is a no-op.

## Authentication

Keycloak (OIDC) protects HTTP business routes. Health stays open. The queue is a trusted internal channel; `providerId` in the payload is still validated by the domain.

`AUTH_ENABLED=false` is available for isolated use-case tests. E2E covers both the unauthenticated health path and a real password-grant token.

## Test runner

Bun 1.x is the runtime, package manager and test runner (`bun test`). The assertions use the Jest-compatible API (`describe` / `it` / `expect`). There is no `jest` dependency.

Integration, concurrency and e2e tests use real PostgreSQL and MiniStack. They do not fall back to mocks if Compose is down.

## OpenTelemetry

Tracing is opt-in (`OTEL_ENABLED=true`). HTTP, SQS and database spans come from auto-instrumentation. There is no Grafana dashboard in this timebox.

## Limitations

- Single currency in fixtures (`BRL`); the model remains multi-currency.
- Partial refunds are out of scope.
- Double-entry bookkeeping is not implemented.
- Outbox publish happens inside the claim transaction (short SQS RTT). A very slow broker increases lock time on those rows only.
