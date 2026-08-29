import { Injectable } from "@nestjs/common";
import { Clock, SystemClock } from "../../../shared/domain/clock";
import { createUuidV7 } from "../../../shared/domain/create-id";
import { WalletAlreadyExistsError } from "../../../shared/domain/errors";
import { WalletBalanceChanged } from "../../../shared/domain/events/wallet-balance-changed";
import { WagerTransactionProcessed } from "../../../shared/domain/events/wager-transaction-processed";
import { Money, MoneyProps } from "../../../shared/domain/money";
import { OutboxMessage } from "../../messaging/domain/outbox-message";
import { isUniqueViolation } from "../../persistence/persistence.context";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { WagerTransaction } from "../../wagering/domain/wager-transaction";
import { Wallet } from "../domain/wallet";

export interface OpenWalletInput {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface OpenWalletResult {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

@Injectable()
export class OpenWalletUseCase {
  private readonly clock: Clock = new SystemClock();

  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(input: OpenWalletInput): Promise<OpenWalletResult> {
    const now = this.clock.now();
    const initialBalance = Money.from(input.initialBalance);
    try {
      return await this.unitOfWork.run(async (ctx) => {
        const existing = await ctx.findWalletByPlayerCurrency(
          input.playerId,
          initialBalance.currency,
        );
        if (existing) {
          throw new WalletAlreadyExistsError();
        }
        const wallet = Wallet.open({
          id: createUuidV7(now.getTime()),
          playerId: input.playerId,
          initialBalance,
          now,
        });
        await ctx.saveWallet(wallet);

        if (!wallet.balance.isZero()) {
          const opening = WagerTransaction.createOpening({
            id: createUuidV7(now.getTime()),
            walletId: wallet.id,
            playerId: wallet.playerId,
            money: wallet.balance,
            createdAt: now,
          });
          const entry = wallet.openingEntry(opening.id, now);
          await ctx.saveTransaction(opening);
          if (entry) {
            await ctx.saveLedger(entry);
            await ctx.saveOutbox(
              OutboxMessage.enqueue(
                WalletBalanceChanged.from(wallet, entry, {
                  eventId: createUuidV7(now.getTime()),
                  correlationId: wallet.id,
                  occurredAt: now,
                }),
              ),
            );
            await ctx.saveOutbox(
              OutboxMessage.enqueue(
                WagerTransactionProcessed.from(opening, {
                  eventId: createUuidV7(now.getTime()),
                  correlationId: wallet.id,
                  occurredAt: now,
                }),
              ),
            );
          }
        }

        return {
          id: wallet.id,
          playerId: wallet.playerId,
          balance: wallet.balance.toJSON(),
          version: wallet.version,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new WalletAlreadyExistsError();
      }
      throw error;
    }
  }
}
