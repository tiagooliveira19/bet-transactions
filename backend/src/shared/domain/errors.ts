export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_MONEY");
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message = "Insufficient wallet balance") {
    super(message, "INSUFFICIENT_BALANCE");
  }
}

export class ReversalWouldMakeNegativeError extends DomainError {
  constructor(message = "Reversal would make wallet balance negative") {
    super(message, "REVERSAL_WOULD_MAKE_NEGATIVE");
  }
}

export class InvalidTransactionStateError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_TRANSACTION_STATE");
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(message: string) {
    super(message, "WALLET_CURRENCY_MISMATCH");
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message = "Idempotency key reused with a different payload") {
    super(message, "IDEMPOTENCY_PAYLOAD_CONFLICT");
  }
}

export class WalletAlreadyExistsError extends DomainError {
  constructor(message = "Wallet already exists for player and currency") {
    super(message, "DUPLICATE_WALLET");
  }
}

export class WalletNotFoundError extends DomainError {
  constructor(message = "Wallet not found") {
    super(message, "WALLET_NOT_FOUND");
  }
}

export class OpeningNotAllowedError extends DomainError {
  constructor(message = "OPENING cannot be submitted via API or queue") {
    super(message, "OPENING_NOT_ALLOWED");
  }
}

export class ReferenceRequiredError extends DomainError {
  constructor(message = "Reference is required for this operation") {
    super(message, "REFERENCE_REQUIRED");
  }
}

export class TransientInfrastructureError extends DomainError {
  constructor(message: string) {
    super(message, "TRANSIENT_INFRASTRUCTURE");
  }
}
