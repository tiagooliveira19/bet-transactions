# API

Swagger UI: `GET /docs`.

Business routes require a Keycloak bearer token when `AUTH_ENABLED=true`. Health does not.

## Status mapping

The same mapping is used on every endpoint.

| Situation | HTTP | Body |
|---|---|---|
| Invalid payload / money / missing `Idempotency-Key` | 400 | `error: INVALID_PAYLOAD` or `INVALID_MONEY` |
| Missing or invalid JWT | 401 | `error: UNAUTHORIZED` |
| Duplicate wallet or idempotency key with a different payload | 409 | `DUPLICATE_WALLET` / `IDEMPOTENCY_PAYLOAD_CONFLICT` |
| Business rejection persisted on the transaction | 422 | `status: REJECTED`, `failureCode` |
| Accepted, still waiting (`PENDING` / `PENDING_REFERENCE`) | 202 | transaction view |
| Success (`PROCESSED`) or identical replay | 200 / 201 | `idempotentReplay` on submit |
| Missing resource | 404 | `WALLET_NOT_FOUND` / `NOT_FOUND` |
| Transient infrastructure | 503 | `TRANSIENT_INFRASTRUCTURE` |

## Endpoints

### `POST /wallets`

Opens a wallet. A positive `initialBalance` writes an internal `OPENING` transaction and a `CREDIT` ledger entry in the same SQL transaction.

Duplicate `(playerId, currency)` → 409.

### `GET /wallets/:walletId`

Current materialized balance and `version`.

### `GET /wallets/:walletId/ledger?cursor=&limit=50`

Opaque cursor (`base64url` of `{ t, id }`), ordered by `(created_at DESC, id DESC)`.

### `POST /wallets/:walletId/reconciliation`

Compares stored balance with `SUM(CREDIT) - SUM(DEBIT)`. Divergences are **not** repaired: they are logged, counted in `wallet_reconciliation_divergences_total` and returned with `consistent: false`.

### `POST /wagering/transactions`

Header `Idempotency-Key` is mandatory and is the source of truth. Recommended value: `{providerId}:{externalTransactionId}`.

`payloadHash` = SHA-256 of canonical JSON (sorted keys) of the business fields only:

`providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money`, `referenceExternalTransactionId`.

Transport headers are not hashed. Same key + same hash → original result and `idempotentReplay: true`, including the balance observed at process time. Same key + different hash → 409.

### `GET /wagering/transactions/:transactionId`

### `GET /providers/:providerId/wagering/transactions/:externalTransactionId`

### `GET /health/live` — process up

### `GET /health/ready` — PostgreSQL `SELECT 1` and SQS `GetQueueUrl`

### `GET /metrics` — Prometheus text
