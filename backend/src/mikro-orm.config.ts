import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { WalletOrmEntity } from "./modules/wallet/infrastructure/wallet.orm-entity";
import { WalletLedgerOrmEntity } from "./modules/wallet/infrastructure/wallet-ledger.orm-entity";
import { WagerTransactionOrmEntity } from "./modules/wagering/infrastructure/wager-transaction.orm-entity";
import { InboxOrmEntity } from "./modules/messaging/infrastructure/inbox.orm-entity";
import { OutboxOrmEntity } from "./modules/messaging/infrastructure/outbox.orm-entity";

export default defineConfig({
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? "bet",
  password: process.env.DATABASE_PASSWORD ?? "bet",
  dbName: process.env.DATABASE_NAME ?? "bet_transactions",
  entities: [
    WalletOrmEntity,
    WalletLedgerOrmEntity,
    WagerTransactionOrmEntity,
    InboxOrmEntity,
    OutboxOrmEntity,
  ],
  extensions: [Migrator],
  migrations: {
    path: "src/migrations",
    pathTs: "src/migrations",
    transactional: true,
  },
  allowGlobalContext: true,
});
