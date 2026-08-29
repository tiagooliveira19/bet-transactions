import { Decimal } from "decimal.js";
import { InvalidMoneyError } from "./errors";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export interface MoneyProps {
  amount: string;
  currency: string;
}

const AMOUNT_PATTERN = /^-?\d+\.\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const currency = Money.normalizeCurrency(props.currency);
    const amount = Money.parseAmount(props.amount, { allowNegative: false });
    return new Money(amount, currency);
  }

  static rehydrate(props: MoneyProps): Money {
    const currency = Money.normalizeCurrency(props.currency);
    const amount = Money.parseAmount(props.amount, { allowNegative: true });
    return new Money(amount, currency);
  }

  static zero(currency: string): Money {
    return new Money(new Decimal("0.00"), Money.normalizeCurrency(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  toDecimalString(): string {
    return this.toString();
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new InvalidMoneyError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  private static normalizeCurrency(currency: string): string {
    if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
      throw new InvalidMoneyError(`Invalid ISO-4217 currency: ${currency}`);
    }
    return currency;
  }

  private static parseAmount(raw: string, options: { allowNegative: boolean }): Decimal {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new InvalidMoneyError("Amount must be a non-empty decimal string");
    }
    if (/[eE]/.test(raw)) {
      throw new InvalidMoneyError("Scientific notation is not allowed");
    }
    if (!AMOUNT_PATTERN.test(raw)) {
      throw new InvalidMoneyError(`Amount must have exactly 2 decimal places (received: ${raw})`);
    }
    const parsed = new Decimal(raw);
    if (!parsed.isFinite()) {
      throw new InvalidMoneyError("Amount must be a finite number");
    }
    if (!options.allowNegative && parsed.isNegative()) {
      throw new InvalidMoneyError("Negative amounts are not allowed in input contracts");
    }
    return parsed;
  }
}
