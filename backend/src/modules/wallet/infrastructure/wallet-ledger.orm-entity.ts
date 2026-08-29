import { Entity, PrimaryKey, Property, Unique, Check, Index } from "@mikro-orm/core";

@Entity({ tableName: "wallet_ledger_entries" })
@Unique({ properties: ["transactionId"], name: "wallet_ledger_entries_transaction_unique" })
@Check({
  name: "wallet_ledger_amount_positive",
  expression: "amount > 0",
})
@Check({
  name: "wallet_ledger_arithmetic",
  expression: `(
    (direction = 'CREDIT' AND balance_after = balance_before + amount) OR
    (direction = 'DEBIT' AND balance_after = balance_before - amount)
  )`,
})
@Index({ properties: ["walletId", "createdAt", "id"], name: "wallet_ledger_cursor_idx" })
export class WalletLedgerOrmEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid", fieldName: "wallet_id" })
  walletId!: string;

  @Property({ type: "uuid", fieldName: "transaction_id" })
  transactionId!: string;

  @Property({ type: "string", length: 8 })
  direction!: string;

  @Property({ type: "decimal", precision: 20, scale: 2 })
  amount!: string;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "decimal", precision: 20, scale: 2, fieldName: "balance_before" })
  balanceBefore!: string;

  @Property({ type: "decimal", precision: 20, scale: 2, fieldName: "balance_after" })
  balanceAfter!: string;

  @Property({ type: "timestamptz", fieldName: "created_at" })
  createdAt!: Date;
}
