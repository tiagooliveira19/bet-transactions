import { describe, expect, it } from "bun:test";
import { InvalidMoneyError } from "./errors";
import { Money } from "./money";

describe("Money", () => {
  it("creates from a 2-decimal string", () => {
    const money = Money.from({ amount: "25.00", currency: "BRL" });
    expect(money.toJSON()).toEqual({ amount: "25.00", currency: "BRL" });
  });

  it("adds and subtracts immutably", () => {
    const a = Money.from({ amount: "10.00", currency: "BRL" });
    const b = Money.from({ amount: "3.50", currency: "BRL" });
    expect(a.add(b).toString()).toBe("13.50");
    expect(a.subtract(b).toString()).toBe("6.50");
    expect(a.toString()).toBe("10.00");
  });

  it("rejects currency mismatch", () => {
    const brl = Money.from({ amount: "10.00", currency: "BRL" });
    const usd = Money.from({ amount: "10.00", currency: "USD" });
    expect(() => brl.add(usd)).toThrow(InvalidMoneyError);
    expect(brl.equals(usd)).toBe(false);
  });

  it("rejects invalid amounts", () => {
    expect(() => Money.from({ amount: "", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "1e2", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "10.0", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "10.001", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "10.00", currency: "brl" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "-1.00", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "NaN", currency: "BRL" })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: "Infinity", currency: "BRL" })).toThrow(InvalidMoneyError);
  });

  it("serializes with fixed scale", () => {
    expect(Money.zero("BRL").toString()).toBe("0.00");
    expect(Money.from({ amount: "0.01", currency: "BRL" }).isPositive()).toBe(true);
  });

  it("rehydrates persisted negatives used only internally", () => {
    const negative = Money.rehydrate({ amount: "-2.00", currency: "BRL" });
    expect(negative.isNegative()).toBe(true);
    expect(negative.negate().toString()).toBe("2.00");
  });
});
