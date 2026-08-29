import { describe, expect, it } from "bun:test";
import { CurrencyMismatchError, InsufficientBalanceError } from "../../../shared/domain/errors";
import { createUuidV7 } from "../../../shared/domain/create-id";
import { Money } from "../../../shared/domain/money";
import { Wallet } from "./wallet";

describe("Wallet", () => {
  const now = new Date("2026-07-29T15:00:00.000Z");

  function open(amount = "100.00"): Wallet {
    return Wallet.open({
      id: createUuidV7(),
      playerId: createUuidV7(),
      initialBalance: Money.from({ amount, currency: "BRL" }),
      now,
    });
  }

  it("opens with version 1 and never-negative balance", () => {
    const wallet = open("1000.00");
    expect(wallet.version).toBe(1);
    expect(wallet.balance.toString()).toBe("1000.00");
    const opening = wallet.openingEntry(createUuidV7(), now);
    expect(opening?.isBalanced()).toBe(true);
    expect(opening?.balanceBefore.toString()).toBe("0.00");
  });

  it("debits and credits keeping ledger arithmetic", () => {
    const wallet = open();
    const debit = wallet.debit({
      transactionId: createUuidV7(),
      money: Money.from({ amount: "40.00", currency: "BRL" }),
      now,
    });
    expect(wallet.balance.toString()).toBe("60.00");
    expect(wallet.version).toBe(2);
    expect(debit.isBalanced()).toBe(true);
    const credit = wallet.credit({
      transactionId: createUuidV7(),
      money: Money.from({ amount: "10.00", currency: "BRL" }),
      now,
    });
    expect(wallet.balance.toString()).toBe("70.00");
    expect(credit.direction).toBe("CREDIT");
  });

  it("rejects debit when balance is insufficient", () => {
    const wallet = open("20.00");
    expect(() =>
      wallet.debit({
        transactionId: createUuidV7(),
        money: Money.from({ amount: "20.01", currency: "BRL" }),
        now,
      }),
    ).toThrow(InsufficientBalanceError);
    expect(wallet.balance.toString()).toBe("20.00");
    expect(wallet.version).toBe(1);
  });

  it("rejects currency mismatch", () => {
    const wallet = open();
    expect(() =>
      wallet.credit({
        transactionId: createUuidV7(),
        money: Money.from({ amount: "1.00", currency: "USD" }),
        now,
      }),
    ).toThrow(CurrencyMismatchError);
  });

  it("rehydrates without revalidating transitions", () => {
    const wallet = open();
    const copy = Wallet.rehydrate(wallet.toState());
    expect(copy.balance.equals(wallet.balance)).toBe(true);
    expect(copy.version).toBe(wallet.version);
  });
});
