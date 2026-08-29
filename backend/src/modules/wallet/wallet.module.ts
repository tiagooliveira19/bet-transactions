import { Module } from "@nestjs/common";
import { GetWalletUseCase } from "./application/get-wallet.use-case";
import { ListLedgerUseCase } from "./application/list-ledger.use-case";
import { OpenWalletUseCase } from "./application/open-wallet.use-case";
import { ReconcileWalletUseCase } from "./application/reconcile-wallet.use-case";
import { WalletController } from "./controller/wallet.controller";

@Module({
  controllers: [WalletController],
  providers: [OpenWalletUseCase, GetWalletUseCase, ListLedgerUseCase, ReconcileWalletUseCase],
  exports: [OpenWalletUseCase, GetWalletUseCase, ReconcileWalletUseCase],
})
export class WalletModule {}
