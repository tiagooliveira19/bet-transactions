import { Module } from "@nestjs/common";
import { GetTransactionUseCase } from "./application/get-transaction.use-case";
import { SubmitWagerUseCase } from "./application/submit-wager.use-case";
import { WageringController } from "./controller/wagering.controller";

@Module({
  controllers: [WageringController],
  providers: [SubmitWagerUseCase, GetTransactionUseCase],
  exports: [SubmitWagerUseCase],
})
export class WageringModule {}
