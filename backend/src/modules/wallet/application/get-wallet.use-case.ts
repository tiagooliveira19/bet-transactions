import { Injectable } from "@nestjs/common";
import { WalletNotFoundError } from "../../../shared/domain/errors";
import { MoneyProps } from "../../../shared/domain/money";
import { UnitOfWork } from "../../persistence/unit-of-work";

export interface WalletView {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

@Injectable()
export class GetWalletUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(walletId: string): Promise<WalletView> {
    return this.unitOfWork.run(async (ctx) => {
      const wallet = await ctx.findWalletById(walletId);
      if (!wallet) {
        throw new WalletNotFoundError();
      }
      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}
