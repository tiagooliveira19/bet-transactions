import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DomainError, TransientInfrastructureError } from "../../../shared/domain/errors";
import { Money } from "../../../shared/domain/money";
import { MetricsService } from "../../observability/metrics.service";
import { SubmitWagerUseCase } from "../../wagering/application/submit-wager.use-case";
import { WagerTransactionKind } from "../../wagering/domain/wager-transaction";
import { createSqsClient } from "./sqs.factory";

const CONSUMER_NAME = "wager-transactions-consumer";

interface WagerMessage {
  messageId: string;
  type: string;
  occurredAt: string;
  data: {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: { amount: string; currency: string };
    referenceExternalTransactionId?: string;
  };
}

@Injectable()
export class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerSqsConsumer.name);
  private readonly sqs: SQSClient;
  private queueUrl?: string;
  private running = false;
  private inFlight = 0;
  private loop?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly submitWager: SubmitWagerUseCase,
    private readonly metrics: MetricsService,
  ) {
    this.sqs = createSqsClient(config);
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get("SQS_CONSUMER_ENABLED") === "false") {
      return;
    }
    this.queueUrl = (
      await this.sqs.send(
        new GetQueueUrlCommand({
          QueueName: this.config.get("SQS_WAGER_QUEUE_NAME") ?? "wager-transactions.fifo",
        }),
      )
    ).QueueUrl;
    this.running = true;
    this.loop = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 5,
            WaitTimeSeconds: 10,
            VisibilityTimeout: Number(this.config.get("SQS_VISIBILITY_TIMEOUT_SECONDS") ?? 30),
            AttributeNames: ["ApproximateReceiveCount"],
          }),
        );
        for (const message of result.Messages ?? []) {
          if (!this.running) {
            await this.release(message);
            continue;
          }
          this.inFlight += 1;
          try {
            await this.handle(message);
          } finally {
            this.inFlight -= 1;
          }
        }
      } catch (error) {
        this.logger.warn({ msg: "sqs_poll_failed", err: String(error) });
        await Bun.sleep(1000);
      }
    }
  }

  private async handle(message: Message): Promise<void> {
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? "1");
    const messageId = message.MessageId;
    let body: WagerMessage | undefined;
    try {
      body = JSON.parse(message.Body ?? "{}") as WagerMessage;
      Money.from(body.data.money);
      await this.submitWager.execute({
        ...body.data,
        inbox: {
          messageId: body.messageId ?? messageId ?? "unknown",
          consumerName: CONSUMER_NAME,
        },
        correlationId: body.messageId ?? messageId,
      });
      await this.ack(message);
    } catch (error) {
      if (error instanceof TransientInfrastructureError) {
        this.metrics.recordRetry("sqs");
        return;
      }
      if (error instanceof DomainError) {
        await this.ack(message);
        return;
      }
      const max = Number(this.config.get("SQS_MAX_RECEIVE_COUNT") ?? 5);
      if (receiveCount >= max) {
        this.metrics.recordDlq();
        this.logger.error({
          msg: "sqs_message_to_dlq",
          messageId: body?.messageId ?? messageId,
          providerId: body?.data.providerId,
          walletId: body?.data.walletId,
          receiveCount,
        });
      } else {
        this.metrics.recordRetry("sqs");
      }
    }
  }

  private async ack(message: Message): Promise<void> {
    if (!this.queueUrl || !message.ReceiptHandle) {
      return;
    }
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }

  private async release(message: Message): Promise<void> {
    if (!this.queueUrl || !message.ReceiptHandle) {
      return;
    }
    await this.sqs.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: 0,
      }),
    );
  }
}
