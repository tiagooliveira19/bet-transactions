import {
  InvalidTransactionStateError,
  OpeningNotAllowedError,
  ReferenceRequiredError,
} from "../../../shared/domain/errors";
import { FailureCode } from "../../../shared/domain/failure-code";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";
import { Money } from "../../../shared/domain/money";

export enum WagerTransactionKind {
  Opening = "OPENING",
  Bet = "BET",
  Win = "WIN",
  Loss = "LOSS",
  Refund = "REFUND",
  Rollback = "ROLLBACK",
}

export enum WagerTransactionStatus {
  Pending = "PENDING",
  PendingReference = "PENDING_REFERENCE",
  Processed = "PROCESSED",
  Rejected = "REJECTED",
  Failed = "FAILED",
}

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
  observedBalance?: { amount: string; currency: string };
  referenceRetryCount: number;
  nextReferenceAttemptAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
    private _observedBalance?: Money,
    private _referenceRetryCount = 0,
    private _nextReferenceAttemptAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === WagerTransactionKind.Opening) {
      throw new OpeningNotAllowedError();
    }
    if (requiresReference(props.kind) && !props.referenceExternalTransactionId) {
      throw new ReferenceRequiredError();
    }
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt,
      WagerTransactionStatus.Pending,
    );
  }

  static createOpening(props: {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    createdAt: Date;
  }): WagerTransaction {
    return new WagerTransaction(
      props.id,
      "internal",
      `opening:${props.walletId}`,
      `internal:opening:${props.walletId}`,
      "opening",
      props.walletId,
      props.playerId,
      `opening:${props.walletId}`,
      "internal",
      WagerTransactionKind.Opening,
      props.money,
      undefined,
      props.createdAt,
      WagerTransactionStatus.Processed,
      undefined,
      undefined,
      props.createdAt,
      props.money,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      Money.rehydrate(state.money),
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.observedBalance ? Money.rehydrate(state.observedBalance) : undefined,
      state.referenceRetryCount,
      state.nextReferenceAttemptAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get observedBalance(): Money | undefined {
    return this._observedBalance;
  }

  get referenceRetryCount(): number {
    return this._referenceRetryCount;
  }

  get nextReferenceAttemptAt(): Date | undefined {
    return this._nextReferenceAttemptAt;
  }

  markProcessed(
    referenceTransactionId: string | undefined,
    at: Date,
    observedBalance: Money,
  ): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
    this._observedBalance = observedBalance;
    this._failureCode = undefined;
  }

  markPendingReference(now: Date): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.PendingReference;
    this._referenceRetryCount += 1;
    const delayMs =
      this._referenceRetryCount <= 1
        ? 0
        : Math.min(60_000, 1_000 * 2 ** (this._referenceRetryCount - 1));
    this._nextReferenceAttemptAt = new Date(now.getTime() + delayMs);
  }

  reject(code: FailureCode, observedBalance?: Money): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._processedAt = new Date();
    if (observedBalance) {
      this._observedBalance = observedBalance;
    }
  }

  fail(code: FailureCode): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.Processed ||
      this._status === WagerTransactionStatus.Rejected ||
      this._status === WagerTransactionStatus.Failed
    );
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return requiresReference(this.kind);
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection | undefined {
    switch (this.kind) {
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
      case WagerTransactionKind.Opening:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Loss:
        return undefined;
      case WagerTransactionKind.Rollback: {
        const referencedDirection = reference?.ledgerDirectionFor();
        if (referencedDirection === LedgerDirection.Debit) {
          return LedgerDirection.Credit;
        }
        if (referencedDirection === LedgerDirection.Credit) {
          return LedgerDirection.Debit;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  isAllowedReferenceKind(reference: WagerTransaction): boolean {
    if (this.kind === WagerTransactionKind.Refund) {
      return reference.kind === WagerTransactionKind.Bet;
    }
    if (this.kind === WagerTransactionKind.Rollback) {
      return (
        reference.kind === WagerTransactionKind.Bet ||
        reference.kind === WagerTransactionKind.Win ||
        reference.kind === WagerTransactionKind.Refund
      );
    }
    if (this.kind === WagerTransactionKind.Win) {
      return reference.kind === WagerTransactionKind.Bet;
    }
    return false;
  }

  matchesReferenceScope(reference: WagerTransaction): boolean {
    return (
      this.providerId === reference.providerId &&
      this.playerId === reference.playerId &&
      this.walletId === reference.walletId &&
      this.money.currency === reference.money.currency &&
      this.roundId === reference.roundId
    );
  }

  toState(): WagerTransactionState {
    return {
      id: this.id,
      providerId: this.providerId,
      externalTransactionId: this.externalTransactionId,
      idempotencyKey: this.idempotencyKey,
      payloadHash: this.payloadHash,
      walletId: this.walletId,
      playerId: this.playerId,
      roundId: this.roundId,
      gameId: this.gameId,
      kind: this.kind,
      money: this.money.toJSON(),
      referenceExternalTransactionId: this.referenceExternalTransactionId,
      createdAt: this.createdAt,
      status: this._status,
      referenceTransactionId: this._referenceTransactionId,
      failureCode: this._failureCode,
      processedAt: this._processedAt,
      observedBalance: this._observedBalance?.toJSON(),
      referenceRetryCount: this._referenceRetryCount,
      nextReferenceAttemptAt: this._nextReferenceAttemptAt,
    };
  }

  private assertNotTerminal(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(`Cannot transition a ${this._status} transaction`);
    }
  }
}

function requiresReference(kind: WagerTransactionKind): boolean {
  return kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
}
