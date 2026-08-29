import { Injectable } from "@nestjs/common";
import { WalletNotFoundError } from "../../../shared/domain/errors";
import { FailureCode } from "../../../shared/domain/failure-code";
import { MoneyProps } from "../../../shared/domain/money";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { WagerTransactionKind, WagerTransactionStatus } from "../domain/wager-transaction";

export class TransactionNotFoundError extends Error {
  constructor() {
    super("Transaction not found");
  }
}

export interface TransactionView {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  kind: WagerTransactionKind;
  status: WagerTransactionStatus;
  money: MoneyProps;
  failureCode?: FailureCode;
  observedBalance?: MoneyProps;
}

@Injectable()
export class GetTransactionUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  byId(transactionId: string): Promise<TransactionView> {
    return this.unitOfWork.run(async (ctx) => {
      const transaction = await ctx.findTransactionById(transactionId);
      if (!transaction) {
        throw new TransactionNotFoundError();
      }
      return toView(transaction);
    });
  }

  byProviderExternal(providerId: string, externalTransactionId: string): Promise<TransactionView> {
    return this.unitOfWork.run(async (ctx) => {
      const transaction = await ctx.findTransactionByProviderExternal(
        providerId,
        externalTransactionId,
      );
      if (!transaction) {
        throw new TransactionNotFoundError();
      }
      const wallet = await ctx.findWalletById(transaction.walletId);
      if (!wallet) {
        throw new WalletNotFoundError();
      }
      return toView(transaction);
    });
  }
}

function toView(
  transaction: import("../domain/wager-transaction").WagerTransaction,
): TransactionView {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    kind: transaction.kind,
    status: transaction.status,
    money: transaction.money.toJSON(),
    failureCode: transaction.failureCode,
    observedBalance: transaction.observedBalance?.toJSON(),
  };
}
