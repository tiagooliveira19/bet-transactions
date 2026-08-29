import { Injectable, Logger } from "@nestjs/common";
import { WalletNotFoundError } from "../../../shared/domain/errors";
import { Money, MoneyProps } from "../../../shared/domain/money";
import { MetricsService } from "../../observability/metrics.service";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { normalizeDecimal } from "../infrastructure/wallet.mapper";

export interface ReconciliationResult {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: MetricsService,
  ) {}

  execute(walletId: string): Promise<ReconciliationResult> {
    return this.unitOfWork.run(async (ctx) => {
      const wallet = await ctx.findWalletById(walletId);
      if (!wallet) {
        throw new WalletNotFoundError();
      }
      const totals = await ctx.ledgerTotals(walletId);
      const calculated = Money.rehydrate({
        amount: normalizeDecimal(totals.calculated),
        currency: wallet.currency,
      });
      const difference = wallet.balance.subtract(calculated);
      const consistent = difference.isZero();
      if (!consistent) {
        this.logger.error({
          msg: "wallet_reconciliation_divergence",
          walletId,
          checkedEntries: totals.checkedEntries,
        });
        this.metrics.recordReconciliationDivergence();
      }
      return {
        walletId,
        storedBalance: wallet.balance.toJSON(),
        calculatedBalance: calculated.toJSON(),
        difference: difference.toJSON(),
        consistent,
        checkedEntries: totals.checkedEntries,
      };
    });
  }
}
