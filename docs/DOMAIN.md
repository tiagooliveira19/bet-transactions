# Domain

## Aggregates

- `Money` — immutable decimal string, scale 2, ISO-4217 currency. `from` rejects negatives, scientific notation, empty values and extra fractional digits. Cross-currency arithmetic throws.
- `Wallet` — one per `(playerId, currency)`. Balance never negative. `version` starts at 1 and increments only when the balance changes.
- `WagerTransaction` — public factory `create` starts in `PENDING`. `OPENING` is internal (`createOpening`). `rehydrate` does not re-run transition rules.
- `WalletLedgerEntry` — structurally immutable. `create` checks `balanceBefore ± money === balanceAfter`. At most one entry per transaction. `LOSS` and `REJECTED` write none.
- `InboxMessage` / `OutboxMessage` — participate in the same SQL transaction as the financial write.

## Status transitions

```
PENDING → PENDING_REFERENCE | PROCESSED | REJECTED | FAILED
PENDING_REFERENCE → PROCESSED | REJECTED | FAILED | PENDING_REFERENCE
PROCESSED | REJECTED | FAILED → (terminal; further transitions throw InvalidTransactionStateError)
```

## Operations

| Kind | Balance | Ledger | Rule |
|---|---|---|---|
| BET | debit | 1 `DEBIT` | reject if insufficient (`INSUFFICIENT_BALANCE`) |
| WIN | credit | 1 `CREDIT` | may reference the round's BET |
| LOSS | none | none | records the result only |
| REFUND | credit | 1 `CREDIT` | only a `PROCESSED` BET, once, same amount and scope |
| ROLLBACK | inverse of the reference | 1 inverted entry | `BET` / `WIN` / `REFUND`, once |

REFUND and ROLLBACK require `referenceExternalTransactionId`. The reference is resolved by `(providerId, referenceExternalTransactionId)` and must share provider, player, wallet, currency and round.

A reversal that would make the balance negative is rejected with `REVERSAL_WOULD_MAKE_NEGATIVE` — not `INSUFFICIENT_BALANCE`.

Out-of-order references stay `PENDING_REFERENCE` and are retried by a worker with exponential backoff (1s, 2s, … capped at 60s). After 10 attempts (~15 minutes of spaced retries) the transaction is `REJECTED` with `REFERENCE_NOT_FOUND`. The limit is finite so a never-arriving reference cannot occupy the worker forever, and it is long enough for at-least-once, out-of-order delivery.

## Failure codes

| Code | Meaning | Typical client action |
|---|---|---|
| `INSUFFICIENT_BALANCE` | BET would go negative | do not replay the same stake |
| `REVERSAL_WOULD_MAKE_NEGATIVE` | ROLLBACK/REFUND debit cannot be applied | operational, not a missing BET |
| `IDEMPOTENCY_PAYLOAD_CONFLICT` | same key, different business payload | fix the payload or use a new key |
| `WALLET_NOT_FOUND` | unknown wallet | correct the id |
| `WALLET_CURRENCY_MISMATCH` | operation currency ≠ wallet | correct currency |
| `DUPLICATE_WALLET` | `(playerId, currency)` exists | GET the existing wallet |
| `INVALID_MONEY` | amount/currency contract violated | fix the amount |
| `INVALID_KIND` | unsupported kind | fix the kind |
| `OPENING_NOT_ALLOWED` | OPENING via API/queue | do not send OPENING |
| `REFERENCE_REQUIRED` | REFUND/ROLLBACK without reference | send the reference |
| `REFERENCE_NOT_FOUND` | retries exhausted | send the referenced operation or give up |
| `REFERENCE_SCOPE_MISMATCH` | provider/player/wallet/round/currency differ | correct the reference |
| `INVALID_REFERENCE_KIND` | REFUND not a BET, ROLLBACK not BET/WIN/REFUND | correct the kind |
| `ALREADY_REVERSED` | same reversal kind already active | do not send again |
| `AMOUNT_MISMATCH` | reversal amount ≠ reference | full reversal only |
| `PLAYER_WALLET_MISMATCH` | player does not own the wallet | correct ids |
| `INVALID_PAYLOAD` | HTTP validation | fix the request |
| `TRANSIENT_INFRASTRUCTURE` | retryable I/O | retry with backoff |

## Schema invariants

Uniqueness, immutability and non-negativity are enforced in PostgreSQL: unique wallets, unique idempotency keys, unique provider+external id, one active reversal per kind, ledger arithmetic `CHECK`, `BEFORE UPDATE OR DELETE` trigger on the ledger, `balance_amount >= 0`.
