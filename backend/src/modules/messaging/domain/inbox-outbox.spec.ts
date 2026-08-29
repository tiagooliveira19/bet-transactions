import { describe, expect, it } from "bun:test";
import { createUuidV7 } from "../../../shared/domain/create-id";
import { WalletBalanceChanged } from "../../../shared/domain/events/wallet-balance-changed";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { Money } from "../../../shared/domain/money";
import { Wallet } from "../../wallet/domain/wallet";
import { WalletLedgerEntry } from "../../wallet/domain/wallet-ledger-entry";
import { InboxMessage } from "./inbox-message";
import { OutboxMessage } from "./outbox-message";

describe("InboxMessage", () => {
  it("starts unprocessed and can be marked processed", () => {
    const inbox = InboxMessage.receive({
      messageId: "msg-1",
      consumerName: "wager-consumer",
      payloadHash: "abc",
      receivedAt: new Date(),
    });
    expect(inbox.isProcessed()).toBe(false);
    inbox.markProcessed(new Date());
    expect(inbox.isProcessed()).toBe(true);
  });
});

describe("OutboxMessage", () => {
  it("enqueues from an integration event and backs off retries", () => {
    const now = new Date("2026-07-29T15:00:00.000Z");
    const wallet = Wallet.open({
      id: createUuidV7(),
      playerId: createUuidV7(),
      initialBalance: Money.from({ amount: "10.00", currency: "BRL" }),
      now,
    });
    const entry = WalletLedgerEntry.create({
      id: createUuidV7(),
      walletId: wallet.id,
      transactionId: createUuidV7(),
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: "10.00", currency: "BRL" }),
      balanceBefore: Money.zero("BRL"),
      balanceAfter: Money.from({ amount: "10.00", currency: "BRL" }),
      createdAt: now,
    });
    const event = WalletBalanceChanged.from(wallet, entry, {
      eventId: createUuidV7(),
      correlationId: createUuidV7(),
      occurredAt: now,
    });
    const outbox = OutboxMessage.enqueue(event);
    expect(outbox.isPending()).toBe(true);
    expect(outbox.payload.eventType).toBe("WalletBalanceChanged");
    outbox.scheduleRetry(now);
    expect(outbox.attempts).toBe(1);
    expect(outbox.nextAttemptAt && outbox.nextAttemptAt > now).toBe(true);
    outbox.markPublished(now);
    expect(outbox.isPending()).toBe(false);
  });
});
