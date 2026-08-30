import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { MikroORM } from "@mikro-orm/core";
import { AppModule } from "../../src/app.module";
import { DomainExceptionFilter } from "../../src/shared/http/http-exception.filter";
import { applyTestEnv } from "./env";
import { OpenWalletUseCase } from "../../src/modules/wallet/application/open-wallet.use-case";
import { SubmitWagerUseCase } from "../../src/modules/wagering/application/submit-wager.use-case";
import { ReconcileWalletUseCase } from "../../src/modules/wallet/application/reconcile-wallet.use-case";
import { createUuidV7 } from "../../src/shared/domain/create-id";
import { WagerTransactionKind } from "../../src/modules/wagering/domain/wager-transaction";
import { OutboxPublisher } from "../../src/modules/messaging/infrastructure/outbox.publisher";
import { PendingReferenceWorker } from "../../src/modules/messaging/infrastructure/pending-reference.worker";

applyTestEnv();

export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  const swagger = new DocumentBuilder().setTitle("Bet Transactions").setVersion("1.0.0").build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));
  await app.init();
  const orm = app.get(MikroORM);
  await orm.getMigrator().up();
  return app;
}

export async function assertLedgerMatchesBalance(
  app: INestApplication,
  walletId: string,
): Promise<void> {
  const result = await app.get(ReconcileWalletUseCase).execute(walletId);
  if (!result.consistent) {
    throw new Error(
      `ledger/balance mismatch stored=${result.storedBalance.amount} calculated=${result.calculatedBalance.amount}`,
    );
  }
}

export async function openWallet(
  app: INestApplication,
  amount = "100.00",
  playerId = createUuidV7(),
) {
  return app.get(OpenWalletUseCase).execute({
    playerId,
    initialBalance: { amount, currency: "BRL" },
  });
}

export async function submitBet(
  app: INestApplication,
  wallet: { id: string; playerId: string },
  amount: string,
  extras: {
    externalTransactionId?: string;
    idempotencyKey?: string;
    kind?: WagerTransactionKind;
    referenceExternalTransactionId?: string;
    inbox?: { messageId: string; consumerName: string };
  } = {},
) {
  const externalTransactionId = extras.externalTransactionId ?? createUuidV7();
  return app.get(SubmitWagerUseCase).execute({
    providerId: "provider-a",
    externalTransactionId,
    idempotencyKey: extras.idempotencyKey ?? `provider-a:${externalTransactionId}`,
    playerId: wallet.playerId,
    walletId: wallet.id,
    roundId: "round-1",
    gameId: "fortune-chimp",
    kind: extras.kind ?? WagerTransactionKind.Bet,
    money: { amount, currency: "BRL" },
    referenceExternalTransactionId: extras.referenceExternalTransactionId,
    inbox: extras.inbox,
  });
}

export function publisher(app: INestApplication): OutboxPublisher {
  return app.get(OutboxPublisher);
}

export function pendingRefWorker(app: INestApplication): PendingReferenceWorker {
  return app.get(PendingReferenceWorker);
}
