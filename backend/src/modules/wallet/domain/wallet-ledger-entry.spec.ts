import { describe, expect, it } from "bun:test";
import { createUuidV7 } from "../../../shared/domain/create-id";
import { InvalidMoneyError } from "../../../shared/domain/errors";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { Money } from "../../../shared/domain/money";
import { WalletLedgerEntry } from "./wallet-ledger-entry";

describe("WalletLedgerEntry", () => {
  it("accepts a balanced credit", () => {
    const entry = WalletLedgerEntry.create({
      id: createUuidV7(),
      walletId: createUuidV7(),
      transactionId: createUuidV7(),
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: "10.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "5.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "15.00", currency: "BRL" }),
      createdAt: new Date(),
    });
    expect(entry.isBalanced()).toBe(true);
  });

  it("rejects unbalanced arithmetic", () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: createUuidV7(),
        walletId: createUuidV7(),
        transactionId: createUuidV7(),
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: "10.00", currency: "BRL" }),
        balanceBefore: Money.from({ amount: "20.00", currency: "BRL" }),
        balanceAfter: Money.from({ amount: "5.00", currency: "BRL" }),
        createdAt: new Date(),
      }),
    ).toThrow(InvalidMoneyError);
  });
});
