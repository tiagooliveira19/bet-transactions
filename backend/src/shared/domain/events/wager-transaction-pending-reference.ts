import { EventContext, IntegrationEvent } from "./integration-event";
import { WagerTransaction } from "../../../modules/wagering/domain/wager-transaction";

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  referenceExternalTransactionId?: string;
  retryCount: number;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = "WagerTransactionPendingReference";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
      eventId: ctx.eventId,
      aggregateId: transaction.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt,
      data: {
        transactionId: transaction.id,
        providerId: transaction.providerId,
        referenceExternalTransactionId: transaction.referenceExternalTransactionId,
        retryCount: transaction.referenceRetryCount,
      },
    });
  }
}
