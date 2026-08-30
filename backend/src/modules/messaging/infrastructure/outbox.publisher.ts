import { GetQueueUrlCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Clock, SystemClock } from "../../../shared/domain/clock";
import { MetricsService } from "../../observability/metrics.service";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { createSqsClient } from "./sqs.factory";

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private readonly sqs: SQSClient;
  private readonly clock: Clock = new SystemClock();
  private running = false;
  private loop?: Promise<void>;
  private queueUrl?: string;

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.sqs = createSqsClient(config);
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get("OUTBOX_PUBLISHER_ENABLED") === "false") {
      return;
    }
    this.queueUrl = (
      await this.sqs.send(
        new GetQueueUrlCommand({
          QueueName: this.config.get("SQS_EVENTS_QUEUE_NAME") ?? "wallet-events.fifo",
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

  async publishDue(limit = 20): Promise<number> {
    if (!this.queueUrl) {
      this.queueUrl = (
        await this.sqs.send(
          new GetQueueUrlCommand({
            QueueName: this.config.get("SQS_EVENTS_QUEUE_NAME") ?? "wallet-events.fifo",
          }),
        )
      ).QueueUrl;
    }
    const now = this.clock.now();
    return this.unitOfWork.run(async (ctx) => {
      const claimed = await ctx.claimDueOutbox(now, limit);
      if (claimed[0]) {
        this.metrics.setOutboxLag((now.getTime() - claimed[0].occurredAt.getTime()) / 1000);
      } else {
        this.metrics.setOutboxLag(0);
      }
      let published = 0;
      for (const message of claimed) {
        try {
          await this.sqs.send(
            new SendMessageCommand({
              QueueUrl: this.queueUrl,
              MessageBody: JSON.stringify(message.payload),
              MessageGroupId: message.aggregateId,
              MessageDeduplicationId: message.id,
            }),
          );
          message.markPublished(now);
          published += 1;
        } catch (error) {
          this.logger.warn({ msg: "outbox_publish_failed", err: String(error) });
          message.scheduleRetry(now);
          this.metrics.recordRetry("outbox");
        }
        await ctx.saveOutbox(message);
      }
      return published;
    });
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.publishDue();
      } catch (error) {
        this.logger.warn({ msg: "outbox_poll_failed", err: String(error) });
      }
      await Bun.sleep(500);
    }
  }
}
