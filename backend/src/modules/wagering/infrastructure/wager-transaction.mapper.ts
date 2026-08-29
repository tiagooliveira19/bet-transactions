import { FailureCode } from "../../../shared/domain/failure-code";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { WagerTransactionOrmEntity } from "./wager-transaction.orm-entity";
import { normalizeDecimal } from "../../wallet/infrastructure/wallet.mapper";

export function wagerToDomain(entity: WagerTransactionOrmEntity): WagerTransaction {
  return WagerTransaction.rehydrate({
    id: entity.id,
    providerId: entity.providerId,
    externalTransactionId: entity.externalTransactionId,
    idempotencyKey: entity.idempotencyKey,
    payloadHash: entity.payloadHash,
    walletId: entity.walletId,
    playerId: entity.playerId,
    roundId: entity.roundId,
    gameId: entity.gameId,
    kind: entity.kind as WagerTransactionKind,
    money: { amount: normalizeDecimal(entity.amount), currency: entity.currency },
    referenceExternalTransactionId: entity.referenceExternalTransactionId,
    createdAt: entity.createdAt,
    status: entity.status as WagerTransactionStatus,
    referenceTransactionId: entity.referenceTransactionId,
    failureCode: entity.failureCode as FailureCode | undefined,
    processedAt: entity.processedAt,
    observedBalance:
      entity.observedBalanceAmount && entity.observedBalanceCurrency
        ? {
            amount: normalizeDecimal(entity.observedBalanceAmount),
            currency: entity.observedBalanceCurrency,
          }
        : undefined,
    referenceRetryCount: entity.referenceRetryCount,
    nextReferenceAttemptAt: entity.nextReferenceAttemptAt,
  });
}

export function wagerToOrm(
  transaction: WagerTransaction,
  entity = new WagerTransactionOrmEntity(),
): WagerTransactionOrmEntity {
  const state = transaction.toState();
  entity.id = state.id;
  entity.providerId = state.providerId;
  entity.externalTransactionId = state.externalTransactionId;
  entity.idempotencyKey = state.idempotencyKey;
  entity.payloadHash = state.payloadHash;
  entity.walletId = state.walletId;
  entity.playerId = state.playerId;
  entity.roundId = state.roundId;
  entity.gameId = state.gameId;
  entity.kind = state.kind;
  entity.amount = state.money.amount;
  entity.currency = state.money.currency;
  entity.referenceExternalTransactionId = state.referenceExternalTransactionId;
  entity.createdAt = state.createdAt;
  entity.status = state.status;
  entity.referenceTransactionId = state.referenceTransactionId;
  entity.failureCode = state.failureCode;
  entity.processedAt = state.processedAt;
  entity.observedBalanceAmount = state.observedBalance?.amount;
  entity.observedBalanceCurrency = state.observedBalance?.currency;
  entity.referenceRetryCount = state.referenceRetryCount;
  entity.nextReferenceAttemptAt = state.nextReferenceAttemptAt;
  return entity;
}
