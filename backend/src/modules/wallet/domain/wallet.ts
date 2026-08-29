import { CurrencyMismatchError, InsufficientBalanceError } from "../../../shared/domain/errors";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { Money } from "../../../shared/domain/money";
import { WalletLedgerEntry } from "./wallet-ledger-entry";
import { createUuidV7 } from "../../../shared/domain/create-id";

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: { amount: string; currency: string };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: { id: string; playerId: string; initialBalance: Money; now: Date }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new InsufficientBalanceError("Initial balance cannot be negative");
    }
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      props.now,
      props.now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      Money.rehydrate(state.balance),
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(props: { transactionId: string; money: Money; now: Date }): WalletLedgerEntry {
    this.assertSameCurrency(props.money);
    if (this._balance.isLessThan(props.money)) {
      throw new InsufficientBalanceError();
    }
    return this.apply(LedgerDirection.Debit, props.transactionId, props.money, props.now);
  }

  credit(props: { transactionId: string; money: Money; now: Date }): WalletLedgerEntry {
    this.assertSameCurrency(props.money);
    return this.apply(LedgerDirection.Credit, props.transactionId, props.money, props.now);
  }

  openingEntry(transactionId: string, now: Date): WalletLedgerEntry | undefined {
    if (this._balance.isZero()) {
      return undefined;
    }
    return WalletLedgerEntry.create({
      id: createUuidV7(now.getTime()),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money: this._balance,
      balanceBefore: Money.zero(this.currency),
      balanceAfter: this._balance,
      createdAt: now,
    });
  }

  toState(): WalletState {
    return {
      id: this.id,
      playerId: this.playerId,
      currency: this.currency,
      balance: this._balance.toJSON(),
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  private apply(
    direction: LedgerDirection,
    transactionId: string,
    money: Money,
    now: Date,
  ): WalletLedgerEntry {
    const balanceBefore = this._balance;
    this._balance =
      direction === LedgerDirection.Credit
        ? this._balance.add(money)
        : this._balance.subtract(money);
    this._version += 1;
    this._updatedAt = now;
    return WalletLedgerEntry.create({
      id: createUuidV7(now.getTime()),
      walletId: this.id,
      transactionId,
      direction,
      money,
      balanceBefore,
      balanceAfter: this._balance,
      createdAt: now,
    });
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(
        `Operation currency ${money.currency} does not match wallet ${this.currency}`,
      );
    }
  }
}
