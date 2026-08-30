import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { assertLedgerMatchesBalance, createTestApp, openWallet, submitBet } from "../helpers/app";
import { WagerTransactionKind } from "../../src/modules/wagering/domain/wager-transaction";
import { createUuidV7 } from "../../src/shared/domain/create-id";

describe("atomicity of wallet, ledger, inbox and outbox", () => {
  let app: INestApplication;
  let em: EntityManager;

  beforeAll(async () => {
    app = await createTestApp();
    em = app.get(EntityManager);
  });

  afterAll(async () => {
    await app.close();
  });

  it("persists opening credit, ledger and outbox together", async () => {
    const wallet = await openWallet(app, "1000.00");
    const ledgers = await em
      .getConnection()
      .execute("SELECT count(*)::int AS n FROM wallet_ledger_entries WHERE wallet_id = ?", [
        wallet.id,
      ]);
    const outbox = await em
      .getConnection()
      .execute("SELECT count(*)::int AS n FROM outbox_messages WHERE aggregate_id = ?", [
        wallet.id,
      ]);
    expect(ledgers[0].n).toBe(1);
    expect(outbox[0].n).toBeGreaterThan(0);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("writes inbox, wager, ledger and outbox in the same commit", async () => {
    const wallet = await openWallet(app, "100.00");
    const messageId = `msg-${createUuidV7()}`;
    await submitBet(app, wallet, "25.00", {
      inbox: { messageId, consumerName: "wager-transactions-consumer" },
    });
    const inbox = await em
      .getConnection()
      .execute("SELECT processed_at IS NOT NULL AS done FROM inbox_messages WHERE message_id = ?", [
        messageId,
      ]);
    expect(inbox[0].done).toBe(true);
    await assertLedgerMatchesBalance(app, wallet.id);
  });

  it("does not write a ledger row for LOSS", async () => {
    const wallet = await openWallet(app, "100.00");
    const result = await submitBet(app, wallet, "10.00", { kind: WagerTransactionKind.Loss });
    expect(result.status).toBe("PROCESSED");
    const ledgers = await em.getConnection().execute(
      `SELECT count(*)::int AS n FROM wallet_ledger_entries e
       JOIN wager_transactions t ON t.id = e.transaction_id
       WHERE t.kind = 'LOSS' AND t.wallet_id = ?`,
      [wallet.id],
    );
    expect(ledgers[0].n).toBe(0);
    await assertLedgerMatchesBalance(app, wallet.id);
  });
});
