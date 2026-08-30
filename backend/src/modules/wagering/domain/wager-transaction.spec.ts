import { describe, expect, it } from "bun:test";
import { createUuidV7 } from "../../../shared/domain/create-id";
import {
  InvalidTransactionStateError,
  OpeningNotAllowedError,
  ReferenceRequiredError,
} from "../../../shared/domain/errors";
import { FailureCode } from "../../../shared/domain/failure-code";
import { hashPayload } from "../../../shared/domain/canonical-json";
import { Money } from "../../../shared/domain/money";
import { WagerTransaction, WagerTransactionKind } from "./wager-transaction";
import { applyWager, validateReference } from "./apply-wager";
import { Wallet } from "../../wallet/domain/wallet";

const now = new Date("2026-07-29T15:00:00.000Z");

function money(amount: string, currency = "BRL") {
  return Money.from({ amount, currency });
}

const sharedWalletId = createUuidV7();
const sharedPlayerId = createUuidV7();

function createTxn(
  kind: WagerTransactionKind,
  extras: Partial<{
    money: Money;
    referenceExternalTransactionId: string;
    payload: Record<string, unknown>;
    walletId: string;
    playerId: string;
  }> = {},
): WagerTransaction {
  const payload = extras.payload ?? { kind, amount: extras.money?.toString() ?? "25.00" };
  return WagerTransaction.create({
    id: createUuidV7(),
    providerId: "provider-a",
    externalTransactionId: createUuidV7(),
    idempotencyKey: `provider-a:${createUuidV7()}`,
    payloadHash: hashPayload(payload),
    walletId: extras.walletId ?? sharedWalletId,
    playerId: extras.playerId ?? sharedPlayerId,
    roundId: "round-1",
    gameId: "fortune-chimp",
    kind,
    money: extras.money ?? money("25.00"),
    referenceExternalTransactionId: extras.referenceExternalTransactionId,
    createdAt: now,
  });
}

function openWallet(amount: string, currency = "BRL"): Wallet {
  return Wallet.open({
    id: createUuidV7(),
    playerId: createUuidV7(),
    initialBalance: money(amount, currency),
    now,
  });
}

describe("WagerTransaction", () => {
  it("rejects OPENING from the public factory", () => {
    expect(() => createTxn(WagerTransactionKind.Opening)).toThrow(OpeningNotAllowedError);
  });

  it("requires a reference for REFUND and ROLLBACK", () => {
    expect(() => createTxn(WagerTransactionKind.Refund)).toThrow(ReferenceRequiredError);
    expect(() => createTxn(WagerTransactionKind.Rollback)).toThrow(ReferenceRequiredError);
  });

  it("treats a divergent payload hash as a conflict, not a replay", () => {
    const txn = createTxn(WagerTransactionKind.Bet, { payload: { kind: "BET", amount: "25.00" } });
    expect(txn.matchesPayload(hashPayload({ kind: "BET", amount: "25.00" }))).toBe(true);
    expect(txn.matchesPayload(hashPayload({ kind: "BET", amount: "30.00" }))).toBe(false);
  });

  it("forbids transitions out of a terminal status", () => {
    const txn = createTxn(WagerTransactionKind.Bet);
    txn.reject(FailureCode.INSUFFICIENT_BALANCE);
    expect(() => txn.markProcessed(undefined, now, money("0.00"))).toThrow(
      InvalidTransactionStateError,
    );
  });
});

describe("wager business rules", () => {
  it("debits a BET and rejects insufficient balance", () => {
    const wallet = openWallet("20.00");
    const bet = createTxn(WagerTransactionKind.Bet, { money: money("25.00") });
    expect(() => applyWager(wallet, bet, undefined, now)).toThrow();
    expect(bet.status).toBe("REJECTED");
    expect(bet.failureCode).toBe(FailureCode.INSUFFICIENT_BALANCE);
    expect(wallet.balance.toString()).toBe("20.00");
  });

  it("credits a WIN and records no movement for LOSS", () => {
    const wallet = openWallet("100.00");
    const win = createTxn(WagerTransactionKind.Win, { money: money("40.00") });
    const winEntry = applyWager(wallet, win, undefined, now);
    expect(winEntry?.direction).toBe("CREDIT");
    expect(wallet.balance.toString()).toBe("140.00");
    const loss = createTxn(WagerTransactionKind.Loss, { money: money("10.00") });
    expect(applyWager(wallet, loss, undefined, now)).toBeUndefined();
    expect(wallet.balance.toString()).toBe("140.00");
    expect(loss.status).toBe("PROCESSED");
  });

  it("allows a WIN to reference a BET with a different payout", () => {
    const wallet = openWallet("100.00");
    const bet = createTxn(WagerTransactionKind.Bet, { money: money("25.00") });
    applyWager(wallet, bet, undefined, now);
    const win = createTxn(WagerTransactionKind.Win, {
      money: money("40.00"),
      referenceExternalTransactionId: bet.externalTransactionId,
    });
    expect(validateReference(win, bet)).toBeUndefined();
    const winEntry = applyWager(wallet, win, bet, now);
    expect(winEntry?.direction).toBe("CREDIT");
    expect(wallet.balance.toString()).toBe("115.00");
  });

  it("refunds a processed BET once and with the same amount", () => {
    const wallet = openWallet("100.00");
    const bet = createTxn(WagerTransactionKind.Bet, { money: money("30.00") });
    applyWager(wallet, bet, undefined, now);
    const refund = createTxn(WagerTransactionKind.Refund, {
      money: money("30.00"),
      referenceExternalTransactionId: bet.externalTransactionId,
    });
    expect(validateReference(refund, bet)).toBeUndefined();
    applyWager(wallet, refund, bet, now);
    expect(wallet.balance.toString()).toBe("100.00");
    const badAmount = createTxn(WagerTransactionKind.Refund, {
      money: money("10.00"),
      referenceExternalTransactionId: bet.externalTransactionId,
    });
    expect(validateReference(badAmount, bet)).toBe(FailureCode.AMOUNT_MISMATCH);
  });

  it("rolls back WIN by debiting and rejects a reversal that would go negative", () => {
    const wallet = openWallet("10.00");
    const win = createTxn(WagerTransactionKind.Win, { money: money("50.00") });
    applyWager(wallet, win, undefined, now);
    wallet.debit({
      transactionId: createUuidV7(),
      money: money("55.00"),
      now,
    });
    const rollback = createTxn(WagerTransactionKind.Rollback, {
      money: money("50.00"),
      referenceExternalTransactionId: win.externalTransactionId,
    });
    expect(() => applyWager(wallet, rollback, win, now)).toThrow();
    expect(rollback.failureCode).toBe(FailureCode.REVERSAL_WOULD_MAKE_NEGATIVE);
  });

  it("detects currency conflict between wallet and operation", () => {
    const wallet = openWallet("100.00", "BRL");
    const bet = createTxn(WagerTransactionKind.Bet, { money: money("10.00", "USD") });
    expect(() => applyWager(wallet, bet, undefined, now)).toThrow();
  });
});
