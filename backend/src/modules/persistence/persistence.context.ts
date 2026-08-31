import { EntityManager, LockMode, UniqueConstraintViolationException } from "@mikro-orm/core";
import { InboxMessage } from "../messaging/domain/inbox-message";
import { OutboxMessage } from "../messaging/domain/outbox-message";
import { InboxOrmEntity } from "../messaging/infrastructure/inbox.orm-entity";
import { OutboxOrmEntity } from "../messaging/infrastructure/outbox.orm-entity";
import { Wallet } from "../wallet/domain/wallet";
import { WalletLedgerEntry } from "../wallet/domain/wallet-ledger-entry";
import { WalletOrmEntity } from "../wallet/infrastructure/wallet.orm-entity";
import { WalletLedgerOrmEntity } from "../wallet/infrastructure/wallet-ledger.orm-entity";
import {
  ledgerToDomain,
  ledgerToOrm,
  walletToDomain,
  walletToOrm,
} from "../wallet/infrastructure/wallet.mapper";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../wagering/domain/wager-transaction";
import { WagerTransactionOrmEntity } from "../wagering/infrastructure/wager-transaction.orm-entity";
import { wagerToDomain, wagerToOrm } from "../wagering/infrastructure/wager-transaction.mapper";

export class PersistenceContext {
  constructor(readonly em: EntityManager) {}

  async findWalletForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletOrmEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? walletToDomain(entity) : null;
  }

  async findWalletById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { id });
    return entity ? walletToDomain(entity) : null;
  }

  async findWalletByPlayerCurrency(playerId: string, currency: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { playerId, currency });
    return entity ? walletToDomain(entity) : null;
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    const existing = await this.em.findOne(WalletOrmEntity, { id: wallet.id });
    this.em.persist(walletToOrm(wallet, existing ?? new WalletOrmEntity()));
    await this.em.flush();
  }

  async saveLedger(entry: WalletLedgerEntry): Promise<void> {
    this.em.persist(ledgerToOrm(entry));
    await this.em.flush();
  }

  async findLedgerByWallet(
    walletId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<WalletLedgerEntry[]> {
    const qb = this.em.createQueryBuilder(WalletLedgerOrmEntity, "l");
    qb.where({ walletId });
    if (cursor) {
      qb.andWhere({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
        ],
      });
    }
    qb.orderBy({ createdAt: "DESC", id: "DESC" }).limit(limit);
    const rows = await qb.getResult();
    return rows.map(ledgerToDomain);
  }

  async ledgerTotals(walletId: string): Promise<{ calculated: string; checkedEntries: number }> {
    const result = await this.em.getConnection().execute<{ calculated: string; checked: string }[]>(
      `SELECT
           COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS calculated,
           COUNT(*)::text AS checked
         FROM wallet_ledger_entries
         WHERE wallet_id = ?`,
      [walletId],
    );
    const row = result[0];
    return { calculated: row?.calculated ?? "0", checkedEntries: Number(row?.checked ?? 0) };
  }

  async findTransactionById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { id });
    return entity ? wagerToDomain(entity) : null;
  }

  async findTransactionByIdempotencyKey(key: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { idempotencyKey: key });
    return entity ? wagerToDomain(entity) : null;
  }

  async findTransactionByProviderExternal(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? wagerToDomain(entity) : null;
  }

  async findActiveReversal(
    providerId: string,
    kind: WagerTransactionKind,
    referenceExternalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      kind,
      referenceExternalTransactionId,
      status: { $nin: [WagerTransactionStatus.Rejected, WagerTransactionStatus.Failed] },
    });
    return entity ? wagerToDomain(entity) : null;
  }

  async findTransactionForUpdate(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(
      WagerTransactionOrmEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? wagerToDomain(entity) : null;
  }

  async claimDuePendingReferences(now: Date, limit: number, holdMs: number): Promise<string[]> {
    const rows = await this.em.find(
      WagerTransactionOrmEntity,
      {
        status: WagerTransactionStatus.PendingReference,
        nextReferenceAttemptAt: { $lte: now },
      },
      {
        limit,
        orderBy: { nextReferenceAttemptAt: "ASC" },
        lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
      },
    );
    const ids: string[] = [];
    for (const entity of rows) {
      const transaction = wagerToDomain(entity);
      transaction.claimReferenceAttempt(now, holdMs);
      await this.saveTransaction(transaction);
      ids.push(transaction.id);
    }
    return ids;
  }

  async saveTransaction(transaction: WagerTransaction): Promise<void> {
    const existing = await this.em.findOne(WagerTransactionOrmEntity, { id: transaction.id });
    this.em.persist(wagerToOrm(transaction, existing ?? new WagerTransactionOrmEntity()));
    await this.em.flush();
  }

  async findInbox(consumerName: string, messageId: string): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxOrmEntity, { consumerName, messageId });
    if (!entity) {
      return null;
    }
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt,
    });
  }

  async saveInbox(inbox: InboxMessage): Promise<void> {
    const state = inbox.toState();
    const existing = await this.em.findOne(InboxOrmEntity, {
      consumerName: state.consumerName,
      messageId: state.messageId,
    });
    const entity = existing ?? new InboxOrmEntity();
    entity.consumerName = state.consumerName;
    entity.messageId = state.messageId;
    entity.payloadHash = state.payloadHash;
    entity.receivedAt = state.receivedAt;
    entity.processedAt = state.processedAt;
    this.em.persist(entity);
  }

  async saveOutbox(message: OutboxMessage): Promise<void> {
    const state = message.toState();
    const existing = await this.em.findOne(OutboxOrmEntity, { id: state.id });
    const entity = existing ?? new OutboxOrmEntity();
    entity.id = state.id;
    entity.aggregateId = state.aggregateId;
    entity.eventType = state.eventType;
    entity.payload = { ...state.payload };
    entity.occurredAt = state.occurredAt;
    entity.attempts = state.attempts;
    entity.nextAttemptAt = state.nextAttemptAt;
    entity.publishedAt = state.publishedAt;
    this.em.persist(entity);
    await this.em.flush();
  }

  async claimDueOutbox(now: Date, limit: number): Promise<OutboxMessage[]> {
    const rows = await this.em.find(
      OutboxOrmEntity,
      {
        publishedAt: null,
        nextAttemptAt: { $lte: now },
      },
      {
        limit,
        orderBy: { occurredAt: "ASC" },
        lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
      },
    );
    return rows.map((entity) =>
      OutboxMessage.rehydrate({
        id: entity.id,
        aggregateId: entity.aggregateId,
        eventType: entity.eventType,
        payload: entity.payload,
        occurredAt: entity.occurredAt,
        attempts: entity.attempts,
        nextAttemptAt: entity.nextAttemptAt,
        publishedAt: entity.publishedAt,
      }),
    );
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof UniqueConstraintViolationException;
}

const LOCK_CONFLICT_CODES = new Set(["40P01", "55P03", "40001"]);

export function isLockConflict(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i += 1) {
    const candidate = current as { code?: string; cause?: unknown };
    if (typeof candidate.code === "string" && LOCK_CONFLICT_CODES.has(candidate.code)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
