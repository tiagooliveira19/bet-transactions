import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../identity/jwt-auth.guard";
import { GetTransactionUseCase } from "../application/get-transaction.use-case";
import { SubmitWagerUseCase } from "../application/submit-wager.use-case";
import { WagerTransactionStatus } from "../domain/wager-transaction";
import { SubmitWagerDto } from "../dto/submit-wager.dto";

@ApiTags("wagering")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WageringController {
  constructor(
    private readonly submitWager: SubmitWagerUseCase,
    private readonly getTransaction: GetTransactionUseCase,
  ) {}

  @Post("wagering/transactions")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Submit a wager transaction" })
  async submit(
    @Body() body: SubmitWagerDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!idempotencyKey) {
      response.status(HttpStatus.BAD_REQUEST);
      return { error: "INVALID_PAYLOAD", message: "Idempotency-Key header is required" };
    }
    const result = await this.submitWager.execute({
      ...body,
      idempotencyKey,
      correlationId,
    });
    response.status(statusFor(result.status));
    return result;
  }

  @Get("wagering/transactions/:transactionId")
  @HttpCode(200)
  @ApiOperation({ summary: "Get transaction by internal id" })
  getById(@Param("transactionId") transactionId: string) {
    return this.getTransaction.byId(transactionId);
  }

  @Get("providers/:providerId/wagering/transactions/:externalTransactionId")
  @ApiOperation({ summary: "Get transaction by provider external id" })
  getByExternal(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ) {
    return this.getTransaction.byProviderExternal(providerId, externalTransactionId);
  }
}

function statusFor(status: WagerTransactionStatus): number {
  switch (status) {
    case WagerTransactionStatus.Pending:
    case WagerTransactionStatus.PendingReference:
      return HttpStatus.ACCEPTED;
    case WagerTransactionStatus.Rejected:
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case WagerTransactionStatus.Failed:
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.OK;
  }
}
