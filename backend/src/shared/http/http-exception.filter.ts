import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import {
  DomainError,
  IdempotencyConflictError,
  InvalidMoneyError,
  OpeningNotAllowedError,
  TransientInfrastructureError,
  WalletAlreadyExistsError,
  WalletNotFoundError,
} from "../domain/errors";
import { TransactionNotFoundError } from "../../modules/wagering/application/get-transaction.use-case";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof payload === "string" ? { error: "INVALID_PAYLOAD", message: payload } : payload,
        );
      return;
    }
    if (exception instanceof InvalidMoneyError || exception instanceof OpeningNotAllowedError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    if (
      exception instanceof IdempotencyConflictError ||
      exception instanceof WalletAlreadyExistsError
    ) {
      response.status(HttpStatus.CONFLICT).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof WalletNotFoundError || exception instanceof TransactionNotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        error: exception instanceof DomainError ? exception.code : "NOT_FOUND",
        message: exception.message,
      });
      return;
    }
    if (exception instanceof TransientInfrastructureError) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof DomainError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    this.logger.error({ msg: "unhandled_error", err: String(exception) });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: "INTERNAL_ERROR",
      message: "Unexpected error",
    });
  }
}
