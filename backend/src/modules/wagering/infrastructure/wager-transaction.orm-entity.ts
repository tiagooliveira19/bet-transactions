import { Entity, PrimaryKey, Property, Unique, Index } from "@mikro-orm/core";

@Entity({ tableName: "wager_transactions" })
@Unique({ properties: ["idempotencyKey"], name: "wager_transactions_idempotency_unique" })
@Unique({
  properties: ["providerId", "externalTransactionId"],
  name: "wager_transactions_provider_external_unique",
})
@Index({
  properties: ["status", "nextReferenceAttemptAt"],
  name: "wager_transactions_pending_ref_idx",
})
export class WagerTransactionOrmEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", fieldName: "provider_id" })
  providerId!: string;

  @Property({ type: "string", fieldName: "external_transaction_id" })
  externalTransactionId!: string;

  @Property({ type: "string", fieldName: "idempotency_key" })
  idempotencyKey!: string;

  @Property({ type: "string", fieldName: "payload_hash" })
  payloadHash!: string;

  @Property({ type: "uuid", fieldName: "wallet_id" })
  walletId!: string;

  @Property({ type: "uuid", fieldName: "player_id" })
  playerId!: string;

  @Property({ type: "string", fieldName: "round_id" })
  roundId!: string;

  @Property({ type: "string", fieldName: "game_id" })
  gameId!: string;

  @Property({ type: "string", length: 16 })
  kind!: string;

  @Property({ type: "decimal", precision: 20, scale: 2 })
  amount!: string;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "string", nullable: true, fieldName: "reference_external_transaction_id" })
  referenceExternalTransactionId?: string;

  @Property({ type: "timestamptz", fieldName: "created_at" })
  createdAt!: Date;

  @Property({ type: "string", length: 32 })
  status!: string;

  @Property({ type: "uuid", nullable: true, fieldName: "reference_transaction_id" })
  referenceTransactionId?: string;

  @Property({ type: "string", nullable: true, fieldName: "failure_code" })
  failureCode?: string;

  @Property({ type: "timestamptz", nullable: true, fieldName: "processed_at" })
  processedAt?: Date;

  @Property({
    type: "decimal",
    precision: 20,
    scale: 2,
    nullable: true,
    fieldName: "observed_balance_amount",
  })
  observedBalanceAmount?: string;

  @Property({ type: "string", length: 3, nullable: true, fieldName: "observed_balance_currency" })
  observedBalanceCurrency?: string;

  @Property({ type: "int", fieldName: "reference_retry_count" })
  referenceRetryCount = 0;

  @Property({ type: "timestamptz", nullable: true, fieldName: "next_reference_attempt_at" })
  nextReferenceAttemptAt?: Date;
}
