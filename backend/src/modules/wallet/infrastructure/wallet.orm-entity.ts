import { Entity, PrimaryKey, Property, Unique, Check } from "@mikro-orm/core";

@Entity({ tableName: "wallets" })
@Unique({ properties: ["playerId", "currency"], name: "wallets_player_currency_unique" })
@Check({ name: "wallets_balance_non_negative", expression: "balance_amount >= 0" })
@Check({ name: "wallets_version_positive", expression: "version >= 1" })
export class WalletOrmEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid", fieldName: "player_id" })
  playerId!: string;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "decimal", precision: 20, scale: 2, fieldName: "balance_amount" })
  balanceAmount!: string;

  @Property({ type: "int" })
  version!: number;

  @Property({ type: "timestamptz", fieldName: "created_at" })
  createdAt!: Date;

  @Property({ type: "timestamptz", fieldName: "updated_at" })
  updatedAt!: Date;
}
