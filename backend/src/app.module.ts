import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { LoggerModule } from "nestjs-pino";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { ObservabilityModule } from "./modules/observability/observability.module";
import { PersistenceModule } from "./modules/persistence/persistence.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { WageringModule } from "./modules/wagering/wagering.module";
import { WalletOrmEntity } from "./modules/wallet/infrastructure/wallet.orm-entity";
import { WalletLedgerOrmEntity } from "./modules/wallet/infrastructure/wallet-ledger.orm-entity";
import { WagerTransactionOrmEntity } from "./modules/wagering/infrastructure/wager-transaction.orm-entity";
import { InboxOrmEntity } from "./modules/messaging/infrastructure/inbox.orm-entity";
import { OutboxOrmEntity } from "./modules/messaging/infrastructure/outbox.orm-entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../.env", ".env"] }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: ["req.headers.authorization", "money", "payload", "initialBalance"],
        autoLogging: true,
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              correlationId: req.headers["x-correlation-id"],
            };
          },
        },
      },
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        host: config.get("DATABASE_HOST") ?? "localhost",
        port: Number(config.get("DATABASE_PORT") ?? 5432),
        user: config.get("DATABASE_USER") ?? "bet",
        password: config.get("DATABASE_PASSWORD") ?? "bet",
        dbName: config.get("DATABASE_NAME") ?? "bet_transactions",
        entities: [
          WalletOrmEntity,
          WalletLedgerOrmEntity,
          WagerTransactionOrmEntity,
          InboxOrmEntity,
          OutboxOrmEntity,
        ],
        allowGlobalContext: true,
      }),
    }),
    ObservabilityModule,
    PersistenceModule,
    IdentityModule,
    WalletModule,
    WageringModule,
    MessagingModule,
    HealthModule,
  ],
})
export class AppModule {}
