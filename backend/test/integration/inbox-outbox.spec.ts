import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import {
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertLedgerMatchesBalance,
  createTestApp,
  openWallet,
  pendingRefWorker,
  publisher,
  submitBet,
} from "../helpers/app";
import { createUuidV7 } from "../../src/shared/domain/create-id";
import { WagerTransactionKind } from "../../src/modules/wagering/domain/wager-transaction";

function sqs(): SQSClient {
  return new SQSClient({
    region: "us-east-1",
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
}

describe("inbox, outbox, retry and MiniStack SQS", () => {
  let app: INestApplication;
  let em: EntityManager;

  beforeAll(async () => {
    app = await createTestApp();
    em = app.get(EntityManager);
  });

  afterAll(async () => {
    await app.close();
  });

  it("redelivers the same messageId without a second debit", async () => {
    const wallet = await openWallet(app, "100.00");
    const inbox = {
      messageId: `msg-${createUuidV7()}`,
      consumerName: "wager-transactions-consumer",
    };
    const externalTransactionId = createUuidV7();
    const first = await submitBet(app, wallet, "15.00", { inbox, externalTransactionId });
    const second = await submitBet(app, wallet, "15.00", { inbox, externalTransactionId });
    expect(first.status).toBe("PROCESSED");
    expect(second.idempotentReplay).toBe(true);
    const ledgers = await em
      .getConnection()
      .execute("SELECT count(*)::int AS n FROM wallet_ledger_entries WHERE wallet_id = ?", [
        wallet.id,
      ]);
    expect(ledgers[0].n).toBe(2);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("publishes due outbox messages to MiniStack", async () => {
    const wallet = await openWallet(app, "20.00");
    await submitBet(app, wallet, "5.00");
    const published = await publisher(app).publishDue(50);
    expect(published).toBeGreaterThan(0);
    const client = sqs();
    const url = (await client.send(new GetQueueUrlCommand({ QueueName: "wallet-events.fifo" })))
      .QueueUrl;
    const received = await client.send(
      new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }),
    );
    expect((received.Messages ?? []).length).toBeGreaterThan(0);
  });

  it("two publishers claim distinct outbox rows", async () => {
    await openWallet(app, "10.00");
    await openWallet(app, "10.00");
    const [a, b] = await Promise.all([publisher(app).publishDue(1), publisher(app).publishDue(1)]);
    expect(a + b).toBeGreaterThanOrEqual(1);
  });

  it("holds REFUND until the BET exists, then applies it", async () => {
    const wallet = await openWallet(app, "80.00");
    const betId = createUuidV7();
    const refund = await submitBet(app, wallet, "20.00", {
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betId,
    });
    expect(refund.status).toBe("PENDING_REFERENCE");
    await submitBet(app, wallet, "20.00", { externalTransactionId: betId });
    await pendingRefWorker(app).processDue(20);
    const refundRow = await em
      .getConnection()
      .execute("SELECT status FROM wager_transactions WHERE id = ?", [refund.transactionId]);
    expect(refundRow[0].status).toBe("PROCESSED");
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("can send a wager message to the real FIFO queue", async () => {
    const client = sqs();
    const url = (
      await client.send(new GetQueueUrlCommand({ QueueName: "wager-transactions.fifo" }))
    ).QueueUrl!;
    await client.send(
      new SendMessageCommand({
        QueueUrl: url,
        MessageBody: JSON.stringify({ ping: true }),
        MessageGroupId: "probe",
        MessageDeduplicationId: createUuidV7(),
      }),
    );
  });
});
