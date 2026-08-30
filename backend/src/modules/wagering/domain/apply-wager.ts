import {
  InsufficientBalanceError,
  ReversalWouldMakeNegativeError,
} from "../../../shared/domain/errors";
import { FailureCode } from "../../../shared/domain/failure-code";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { Wallet } from "../../wallet/domain/wallet";
import { WalletLedgerEntry } from "../../wallet/domain/wallet-ledger-entry";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "./wager-transaction";

const MAX_REFERENCE_RETRIES = 10;

export function referenceRetryLimitReached(transaction: WagerTransaction): boolean {
  return transaction.referenceRetryCount >= MAX_REFERENCE_RETRIES;
}

export function validateReference(
  transaction: WagerTransaction,
  reference: WagerTransaction,
): FailureCode | undefined {
  if (reference.status !== WagerTransactionStatus.Processed) {
    return FailureCode.INVALID_REFERENCE_KIND;
  }
  if (!transaction.matchesReferenceScope(reference)) {
    return FailureCode.REFERENCE_SCOPE_MISMATCH;
  }
  if (!transaction.isAllowedReferenceKind(reference)) {
    return FailureCode.INVALID_REFERENCE_KIND;
  }
  const isReversal =
    transaction.kind === WagerTransactionKind.Refund ||
    transaction.kind === WagerTransactionKind.Rollback;
  if (isReversal && !transaction.money.equals(reference.money)) {
    return FailureCode.AMOUNT_MISMATCH;
  }
  return undefined;
}

export function applyWager(
  wallet: Wallet,
  transaction: WagerTransaction,
  reference: WagerTransaction | undefined,
  now: Date,
): WalletLedgerEntry | undefined {
  if (transaction.kind === WagerTransactionKind.Loss) {
    transaction.markProcessed(reference?.id, now, wallet.balance);
    return undefined;
  }

  const direction = transaction.ledgerDirectionFor(reference);
  if (!direction) {
    transaction.reject(FailureCode.INVALID_KIND, wallet.balance);
    return undefined;
  }

  try {
    const entry =
      direction === LedgerDirection.Debit
        ? wallet.debit({ transactionId: transaction.id, money: transaction.money, now })
        : wallet.credit({ transactionId: transaction.id, money: transaction.money, now });
    transaction.markProcessed(reference?.id, now, wallet.balance);
    return entry;
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      const isReversal =
        transaction.kind === WagerTransactionKind.Rollback ||
        transaction.kind === WagerTransactionKind.Refund;
      if (isReversal) {
        transaction.reject(FailureCode.REVERSAL_WOULD_MAKE_NEGATIVE, wallet.balance);
        throw new ReversalWouldMakeNegativeError();
      }
      transaction.reject(FailureCode.INSUFFICIENT_BALANCE, wallet.balance);
      throw error;
    }
    throw error;
  }
}
