# Operations

## Local stack

```bash
cp .env.example .env
docker compose up -d postgres ministack keycloak stackport jaeger
cd backend
bun install
bun run migration:up
bun run start:dev
```

Keycloak: http://localhost:8080 (`admin` / `admin`), realm `bet-transactions`, client `bet-transactions-api`.

StackPort: http://localhost:8081 (SQS against MiniStack). Jaeger: http://localhost:16686 (OTLP on `localhost:4318`).

OIDC client `bet-transactions-api` (client credentials and password grant). Test user: `provider-a` / `provider-a-secret`.

## Queues

Created on application bootstrap (and optionally by `infra/ministack/init`):

- `wager-transactions.fifo` — inbound operations
- `wager-transactions-dlq.fifo` — after 5 receives
- `wallet-events.fifo` — published integration events

Inbound message envelope: `WagerTransactionRequested` with `data` matching the HTTP submit contract plus `idempotencyKey`.

The consumer reuses `SubmitWagerUseCase`, writes the inbox, acks only after commit, acks terminal domain errors, and leaves transient errors visible for retry. `SIGTERM` stops the poll loop and returns visibility on messages that were received but not started.

## Workers

- **SQS consumer** — disable with `SQS_CONSUMER_ENABLED=false`
- **Outbox publisher** — disable with `OUTBOX_PUBLISHER_ENABLED=false`
- **PENDING_REFERENCE worker** — disable with `PENDING_REF_WORKER_ENABLED=false`

Multiple application replicas are supported (`docker compose --profile app up --scale app=3`). They share PostgreSQL and MiniStack; wallet locks and `SKIP LOCKED` keep them correct.

## Reconciliation

`POST /wallets/:walletId/reconciliation` is the operational check. A `false` result is an incident, not a silent repair.

## Logs

JSON logs include `correlationId`, `messageId`, `transactionId`, `walletId`, `providerId` when present. Authorization headers and monetary payloads are redacted.

## Metrics

`GET /metrics`: transactions by status, duplicates, retries, DLQ, lock conflicts, outbox lag, processing latency, reconciliation divergences.

## Tracing

`OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` enable the Node SDK. Local traces go to Jaeger at http://localhost:16686 (service `bet-transactions`).

## Migrations

```bash
bun run migration:up
bun run migration:down
```

They are versioned and reversible (`Migration20260829120000`).
