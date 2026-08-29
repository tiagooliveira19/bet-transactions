import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../identity/jwt-auth.guard";
import { GetWalletUseCase } from "../application/get-wallet.use-case";
import { ListLedgerUseCase } from "../application/list-ledger.use-case";
import { OpenWalletUseCase } from "../application/open-wallet.use-case";
import { ReconcileWalletUseCase } from "../application/reconcile-wallet.use-case";
import { OpenWalletDto } from "../dto/open-wallet.dto";

@ApiTags("wallets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("wallets")
export class WalletController {
  constructor(
    private readonly openWallet: OpenWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly listLedger: ListLedgerUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: "Open a wallet" })
  open(@Body() body: OpenWalletDto) {
    return this.openWallet.execute(body);
  }

  @Get(":walletId")
  @ApiOperation({ summary: "Get wallet" })
  get(@Param("walletId") walletId: string) {
    return this.getWallet.execute(walletId);
  }

  @Get(":walletId/ledger")
  @ApiOperation({ summary: "List ledger with opaque cursor" })
  ledger(
    @Param("walletId") walletId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
  ) {
    return this.listLedger.execute(walletId, cursor, Math.min(100, Number(limit) || 50));
  }

  @Post(":walletId/reconciliation")
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({ summary: "Reconcile stored balance against the ledger" })
  reconcile(@Param("walletId") walletId: string) {
    return this.reconcileWallet.execute(walletId);
  }
}
