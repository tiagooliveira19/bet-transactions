import { Injectable, Logger } from "@nestjs/common";
import { Clock, SystemClock } from "../../../shared/domain/clock";
import { createUuidV7 } from "../../../shared/domain/create-id";
import {
  IdempotencyConflictError,
  InsufficientBalanceError,
  OpeningNotAllowedError,
  ReversalWouldMakeNegativeError,
  WalletNotFoundError,
} from "../../../shared/domain/errors";
import { EventContext } from "../../../shared/domain/events/integration-event";
import { WalletBalanceChanged } from "../../../shared/domain/events/wallet-balance-changed";
import { WagerTransactionPendingReference } from "../../../shared/domain/events/wager-transaction-pending-reference";
import { WagerTransactionProcessed } from "../../../shared/domain/events/wager-transaction-processed";
import { WagerTransactionRejected } from "../../../shared/domain/events/wager-transaction-rejected";
import { FailureCode } from "../../../shared/domain/failure-code";
import { Money, MoneyProps } from "../../../shared/domain/money";
import { OutboxMessage } from "../../messaging/domain/outbox-message";
import { InboxMessage } from "../../messaging/domain/inbox-message";
import { MetricsService } from "../../observability/metrics.service";
import { isUniqueViolation, PersistenceContext } from "../../persistence/persistence.context";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { Wallet } from "../../wallet/domain/wallet";
import { applyWager, referenceRetryLimitReached, validateReference } from "../domain/apply-wager";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { BusinessPayload, hashBusinessPayload } from "./payload-hash";

export interface SubmitWagerInput {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  inbox?: { messageId: string; consumerName: string };
  correlationId?: string;
}

export interface SubmitWagerResult {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}

@Injectable()
export class SubmitWagerUseCase {
  private readonly clock: Clock = new SystemClock();
  private readonly logger = new Logger(SubmitWagerUseCase.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics: MetricsService,
  ) {}

  async execute(input: SubmitWagerInput): Promise<SubmitWagerResult> {
    const started = performance.now();
    try {
      const result = await this.runOrReplay(input);
      this.recordOutcome(input, result, started);
      return result;
    } catch (error) {
      this.logger.warn({
        msg: "wager_submit_failed",
        ...logIds(input),
        err: String(error),
      });
      throw error;
    }
  }

  async reprocessPending(transactionId: string): Promise<SubmitWagerResult | null> {
    const started = performance.now();
    try {
      const tracked = await this.unitOfWork.run(async (ctx) => {
        const existing = await ctx.findTransactionById(transactionId);
        if (!existing || existing.status !== WagerTransactionStatus.PendingReference) {
          return null;
        }
        const wallet = await ctx.findWalletForUpdate(existing.walletId);
        if (!wallet) {
          throw new WalletNotFoundError();
        }
        const input = inputFrom(existing);
        const result = await this.continueExisting(ctx, existing, wallet, input, false);
        return { input, result };
      });
      if (!tracked) {
        return null;
      }
      this.recordOutcome(tracked.input, tracked.result, started);
      return tracked.result;
    } catch (error) {
      this.logger.warn({
        msg: "wager_submit_failed",
        transactionId,
        err: String(error),
      });
      throw error;
    }
  }

  private async runOrReplay(input: SubmitWagerInput): Promise<SubmitWagerResult> {
    try {
      return await this.unitOfWork.run((ctx) => this.process(ctx, input));
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return this.unitOfWork.run(async (ctx) => {
        const existing = await ctx.findTransactionByIdempotencyKey(input.idempotencyKey);
        if (!existing) {
          throw error;
        }
        if (!existing.matchesPayload(hashBusinessPayload(toPayload(input)))) {
          throw new IdempotencyConflictError();
        }
        const wallet = await ctx.findWalletById(existing.walletId);
        return toResult(existing, existing.observedBalance ?? wallet!.balance, true);
      });
    }
  }

  private recordOutcome(input: SubmitWagerInput, result: SubmitWagerResult, started: number): void {
    this.metrics.observeProcessing((performance.now() - started) / 1000);
    this.metrics.recordTransaction(result.status);
    if (result.idempotentReplay) {
      this.metrics.recordDuplicate();
    }
    this.logger.log({
      msg: result.idempotentReplay ? "wager_idempotent_replay" : "wager_submitted",
      ...logIds(input, result),
      status: result.status,
      ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    });
  }

  private async process(
    ctx: PersistenceContext,
    input: SubmitWagerInput,
  ): Promise<SubmitWagerResult> {
    const now = this.clock.now();
    if (input.kind === WagerTransactionKind.Opening) {
      throw new OpeningNotAllowedError();
    }
    const money = Money.from(input.money);
    const payloadHash = hashBusinessPayload(toPayload(input));

    if (input.inbox) {
      const inbox = await this.ensureInbox(ctx, input, payloadHash, now);
      if (inbox.isProcessed()) {
        const existing = await ctx.findTransactionByIdempotencyKey(input.idempotencyKey);
        const wallet = existing
          ? await ctx.findWalletById(existing.walletId)
          : await ctx.findWalletById(input.walletId);
        if (existing && wallet) {
          return toResult(existing, existing.observedBalance ?? wallet.balance, true);
        }
      }
    }

    const wallet = await ctx.findWalletForUpdate(input.walletId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const existing = await ctx.findTransactionByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (!existing.matchesPayload(payloadHash)) {
        throw new IdempotencyConflictError();
      }
      if (input.inbox) {
        await this.markInboxProcessed(ctx, input, payloadHash, now);
      }
      return toResult(existing, existing.observedBalance ?? wallet.balance, true);
    }

    const transaction = WagerTransaction.create({
      id: createUuidV7(now.getTime()),
      providerId: input.providerId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      walletId: input.walletId,
      playerId: input.playerId,
      roundId: input.roundId,
      gameId: input.gameId,
      kind: input.kind,
      money,
      referenceExternalTransactionId: input.referenceExternalTransactionId,
      createdAt: now,
    });

    return this.continueExisting(ctx, transaction, wallet, input, false);
  }

  private async continueExisting(
    ctx: PersistenceContext,
    transaction: WagerTransaction,
    wallet: Wallet,
    input: SubmitWagerInput,
    replay: boolean,
  ): Promise<SubmitWagerResult> {
    const now = this.clock.now();
    const correlationId = input.correlationId ?? transaction.id;

    await ctx.saveTransaction(transaction);
    if (wallet.playerId !== transaction.playerId) {
      transaction.reject(FailureCode.PLAYER_WALLET_MISMATCH, wallet.balance);
    } else if (wallet.currency !== transaction.money.currency) {
      transaction.reject(FailureCode.WALLET_CURRENCY_MISMATCH, wallet.balance);
    } else {
      await this.applyRules(ctx, transaction, wallet, now, correlationId);
    }

    await ctx.saveTransaction(transaction);
    if (input.inbox) {
      await this.markInboxProcessed(ctx, input, transaction.payloadHash, now);
    }

    await this.enqueueOutcome(ctx, transaction, correlationId, now);
    return toResult(transaction, transaction.observedBalance ?? wallet.balance, replay);
  }

  private async applyRules(
    ctx: PersistenceContext,
    transaction: WagerTransaction,
    wallet: Wallet,
    now: Date,
    correlationId: string,
  ): Promise<void> {
    let reference: WagerTransaction | undefined;
    if (transaction.referenceExternalTransactionId) {
      reference =
        (await ctx.findTransactionByProviderExternal(
          transaction.providerId,
          transaction.referenceExternalTransactionId,
        )) ?? undefined;

      if (!reference) {
        if (referenceRetryLimitReached(transaction)) {
          transaction.reject(FailureCode.REFERENCE_NOT_FOUND, wallet.balance);
          return;
        }
        transaction.markPendingReference(now);
        await this.enqueue(
          ctx,
          WagerTransactionPendingReference.from(transaction, eventCtx(correlationId, now)),
        );
        return;
      }

      if (transaction.requiresReference()) {
        const already = await ctx.findActiveReversal(
          transaction.providerId,
          transaction.kind,
          transaction.referenceExternalTransactionId,
        );
        if (already && already.id !== transaction.id) {
          transaction.reject(FailureCode.ALREADY_REVERSED, wallet.balance);
          return;
        }
      }

      const invalid = validateReference(transaction, reference);
      if (invalid) {
        transaction.reject(invalid, wallet.balance);
        return;
      }
    } else if (transaction.requiresReference()) {
      transaction.reject(FailureCode.REFERENCE_REQUIRED, wallet.balance);
      return;
    }

    try {
      const entry = applyWager(wallet, transaction, reference, now);
      if (entry) {
        await ctx.saveWallet(wallet);
        await ctx.saveLedger(entry);
        await this.enqueue(
          ctx,
          WalletBalanceChanged.from(wallet, entry, eventCtx(correlationId, now)),
        );
      }
    } catch (error) {
      if (
        error instanceof InsufficientBalanceError ||
        error instanceof ReversalWouldMakeNegativeError
      ) {
        return;
      }
      throw error;
    }
  }

  private async enqueueOutcome(
    ctx: PersistenceContext,
    transaction: WagerTransaction,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    if (transaction.status === WagerTransactionStatus.Processed) {
      await this.enqueue(
        ctx,
        WagerTransactionProcessed.from(transaction, eventCtx(correlationId, now)),
      );
    }
    if (transaction.status === WagerTransactionStatus.Rejected) {
      await this.enqueue(
        ctx,
        WagerTransactionRejected.from(transaction, eventCtx(correlationId, now)),
      );
    }
  }

  private async enqueue(
    ctx: PersistenceContext,
    event:
      | WalletBalanceChanged
      | WagerTransactionProcessed
      | WagerTransactionRejected
      | WagerTransactionPendingReference,
  ): Promise<void> {
    await ctx.saveOutbox(OutboxMessage.enqueue(event));
  }

  private async ensureInbox(
    ctx: PersistenceContext,
    input: SubmitWagerInput,
    payloadHash: string,
    now: Date,
  ): Promise<InboxMessage> {
    const existing = await ctx.findInbox(input.inbox!.consumerName, input.inbox!.messageId);
    if (existing) {
      return existing;
    }
    const inbox = InboxMessage.receive({
      messageId: input.inbox!.messageId,
      consumerName: input.inbox!.consumerName,
      payloadHash,
      receivedAt: now,
    });
    await ctx.saveInbox(inbox);
    return inbox;
  }

  private async markInboxProcessed(
    ctx: PersistenceContext,
    input: SubmitWagerInput,
    payloadHash: string,
    now: Date,
  ): Promise<void> {
    if (!input.inbox) {
      return;
    }
    const inbox =
      (await ctx.findInbox(input.inbox.consumerName, input.inbox.messageId)) ??
      InboxMessage.receive({
        messageId: input.inbox.messageId,
        consumerName: input.inbox.consumerName,
        payloadHash,
        receivedAt: now,
      });
    inbox.markProcessed(now);
    await ctx.saveInbox(inbox);
  }
}

function logIds(
  input: Pick<SubmitWagerInput, "providerId" | "walletId" | "correlationId" | "inbox">,
  result?: SubmitWagerResult,
): Record<string, string> {
  const fields: Record<string, string> = {
    providerId: input.providerId,
    walletId: input.walletId,
  };
  const correlationId = input.correlationId ?? result?.transactionId;
  if (correlationId) {
    fields.correlationId = correlationId;
  }
  if (input.inbox?.messageId) {
    fields.messageId = input.inbox.messageId;
  }
  if (result?.transactionId) {
    fields.transactionId = result.transactionId;
  }
  return fields;
}

function toPayload(input: SubmitWagerInput): BusinessPayload {
  return {
    providerId: input.providerId,
    externalTransactionId: input.externalTransactionId,
    playerId: input.playerId,
    walletId: input.walletId,
    roundId: input.roundId,
    gameId: input.gameId,
    kind: input.kind,
    money: input.money,
    referenceExternalTransactionId: input.referenceExternalTransactionId,
  };
}

function inputFrom(transaction: WagerTransaction): SubmitWagerInput {
  return {
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    idempotencyKey: transaction.idempotencyKey,
    playerId: transaction.playerId,
    walletId: transaction.walletId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    referenceExternalTransactionId: transaction.referenceExternalTransactionId,
    correlationId: transaction.id,
  };
}

function toResult(
  transaction: WagerTransaction,
  balance: Money,
  idempotentReplay: boolean,
): SubmitWagerResult {
  return {
    transactionId: transaction.id,
    status: transaction.status,
    balance: balance.toJSON(),
    idempotentReplay,
    failureCode: transaction.failureCode,
  };
}

function eventCtx(correlationId: string, now: Date): EventContext {
  return {
    eventId: createUuidV7(now.getTime()),
    correlationId,
    occurredAt: now,
  };
}
