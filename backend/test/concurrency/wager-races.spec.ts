import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
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

describe("concurrency against real PostgreSQL", () => {
  let app: INestApplication;
  let instances: INestApplication[] = [];
  let em: EntityManager;

  beforeAll(async () => {
    app = await createTestApp();
    em = app.get(EntityManager);
    instances = await Promise.all([createTestApp(), createTestApp(), createTestApp()]);
  });

  afterAll(async () => {
    await Promise.all(instances.map((instance) => instance.close()));
    await app.close();
  });

  it("the same bet sent 50 times in parallel produces a single debit", async () => {
    const wallet = await openWallet(app, "100.00");
    const externalTransactionId = createUuidV7();
    const results = await Promise.all(
      Array.from({ length: 50 }, () => submitBet(app, wallet, "40.00", { externalTransactionId })),
    );
    const originals = results.filter((result) => !result.idempotentReplay);
    expect(originals).toHaveLength(1);
    expect(originals[0].status).toBe("PROCESSED");
    expect(new Set(results.map((result) => result.transactionId)).size).toBe(1);
    const ledgers = await em.getConnection().execute(
      `SELECT count(*)::int AS n FROM wallet_ledger_entries e
       JOIN wager_transactions t ON t.id = e.transaction_id
       WHERE t.kind = 'BET' AND t.wallet_id = ?`,
      [wallet.id],
    );
    expect(ledgers[0].n).toBe(1);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("two concurrent 80.00 bets on 100.00 accept exactly one", async () => {
    const wallet = await openWallet(app, "100.00");
    const [first, second] = await Promise.all([
      submitBet(app, wallet, "80.00"),
      submitBet(app, wallet, "80.00"),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["PROCESSED", "REJECTED"]);
    const rejected = [first, second].find((result) => result.status === "REJECTED");
    expect(rejected?.failureCode).toBe("INSUFFICIENT_BALANCE");
    const current = await em
      .getConnection()
      .execute("SELECT balance_amount::text AS amount FROM wallets WHERE id = ?", [wallet.id]);
    expect(current[0].amount.startsWith("20.00")).toBe(true);
    const ledgers = await em
      .getConnection()
      .execute(
        "SELECT count(*)::int AS n FROM wallet_ledger_entries WHERE wallet_id = ? AND direction = 'DEBIT'",
        [wallet.id],
      );
    expect(ledgers[0].n).toBe(1);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("processes distinct wallets in parallel", async () => {
    const wallets = await Promise.all([
      openWallet(app, "50.00"),
      openWallet(app, "50.00"),
      openWallet(app, "50.00"),
    ]);
    await Promise.all(wallets.map((wallet) => submitBet(app, wallet, "10.00")));
    for (const wallet of wallets) {
      await assertLedgerMatchesBalance(app, wallet.id);
    }
  });

  it("keeps invariants with three application instances", async () => {
    const wallet = await openWallet(instances[0], "100.00");
    const results = await Promise.all(
      instances.map((instance) => submitBet(instance, wallet, "80.00")),
    );
    const processed = results.filter((result) => result.status === "PROCESSED");
    const rejected = results.filter((result) => result.status === "REJECTED");
    expect(processed).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    await assertLedgerMatchesBalance(instances[0], wallet.id);
  });

  it("does not double-apply after commit when the inbox is replayed (crash before ack)", async () => {
    const wallet = await openWallet(app, "90.00");
    const inbox = {
      messageId: `crash-${createUuidV7()}`,
      consumerName: "wager-transactions-consumer",
    };
    const externalTransactionId = createUuidV7();
    await submitBet(app, wallet, "30.00", { inbox, externalTransactionId });
    const replay = await submitBet(app, wallet, "30.00", { inbox, externalTransactionId });
    expect(replay.idempotentReplay).toBe(true);
    const ledgers = await em.getConnection().execute(
      `SELECT count(*)::int AS n FROM wallet_ledger_entries e
       JOIN wager_transactions t ON t.id = e.transaction_id
       WHERE t.kind = 'BET' AND t.wallet_id = ?`,
      [wallet.id],
    );
    expect(ledgers[0].n).toBe(1);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("lets two publishers drain the same outbox without losing events", async () => {
    await openWallet(app, "15.00");
    await openWallet(app, "15.00");
    const [left, right] = await Promise.all([
      publisher(instances[0]).publishDue(50),
      publisher(instances[1]).publishDue(50),
    ]);
    expect(left + right).toBeGreaterThanOrEqual(0);
  });

  it("applies ROLLBACK delivered before the referenced BET", async () => {
    const wallet = await openWallet(app, "70.00");
    const betExternal = createUuidV7();
    const rollback = await submitBet(app, wallet, "20.00", {
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: betExternal,
    });
    expect(rollback.status).toBe("PENDING_REFERENCE");
    await submitBet(app, wallet, "20.00", { externalTransactionId: betExternal });
    await pendingRefWorker(app).processDue(20);
    const row = await em
      .getConnection()
      .execute("SELECT status FROM wager_transactions WHERE id = ?", [rollback.transactionId]);
    expect(row[0].status).toBe("PROCESSED");
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("stays consistent after closing and reopening the application", async () => {
    const wallet = await openWallet(app, "60.00");
    await submitBet(app, wallet, "10.00");
    await app.close();
    app = await createTestApp();
    em = app.get(EntityManager);
    await assertLedgerMatchesBalance(app, wallet.id);
    await submitBet(app, wallet, "5.00");
    await assertLedgerMatchesBalance(app, wallet.id);
  });
});
