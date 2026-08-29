import { Money } from "../../../shared/domain/money";
import { Wallet } from "../domain/wallet";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { WalletOrmEntity } from "./wallet.orm-entity";
import { WalletLedgerOrmEntity } from "./wallet-ledger.orm-entity";

export function walletToDomain(entity: WalletOrmEntity): Wallet {
  return Wallet.rehydrate({
    id: entity.id,
    playerId: entity.playerId,
    currency: entity.currency,
    balance: { amount: normalizeDecimal(entity.balanceAmount), currency: entity.currency },
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}

export function walletToOrm(wallet: Wallet, entity = new WalletOrmEntity()): WalletOrmEntity {
  const state = wallet.toState();
  entity.id = state.id;
  entity.playerId = state.playerId;
  entity.currency = state.currency;
  entity.balanceAmount = state.balance.amount;
  entity.version = state.version;
  entity.createdAt = state.createdAt;
  entity.updatedAt = state.updatedAt;
  return entity;
}

export function ledgerToDomain(entity: WalletLedgerOrmEntity): WalletLedgerEntry {
  return WalletLedgerEntry.rehydrate({
    id: entity.id,
    walletId: entity.walletId,
    transactionId: entity.transactionId,
    direction: entity.direction as LedgerDirection,
    money: { amount: normalizeDecimal(entity.amount), currency: entity.currency },
    balanceBefore: { amount: normalizeDecimal(entity.balanceBefore), currency: entity.currency },
    balanceAfter: { amount: normalizeDecimal(entity.balanceAfter), currency: entity.currency },
    createdAt: entity.createdAt,
  });
}

export function ledgerToOrm(entry: WalletLedgerEntry): WalletLedgerOrmEntity {
  const entity = new WalletLedgerOrmEntity();
  entity.id = entry.id;
  entity.walletId = entry.walletId;
  entity.transactionId = entry.transactionId;
  entity.direction = entry.direction;
  entity.amount = entry.money.toString();
  entity.currency = entry.money.currency;
  entity.balanceBefore = entry.balanceBefore.toString();
  entity.balanceAfter = entry.balanceAfter.toString();
  entity.createdAt = entry.createdAt;
  return entity;
}

export function moneyFromColumns(amount: string, currency: string): Money {
  return Money.rehydrate({ amount: normalizeDecimal(amount), currency });
}

export function normalizeDecimal(value: string): string {
  const raw = String(value);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = "00"] = unsigned.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
