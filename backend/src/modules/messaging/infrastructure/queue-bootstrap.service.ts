import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  QueueDoesNotExist,
  SQSClient,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createSqsClient } from "./sqs.factory";

@Injectable()
export class QueueBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(QueueBootstrapService.name);
  private readonly sqs: SQSClient;

  constructor(private readonly config: ConfigService) {
    this.sqs = createSqsClient(config);
  }

  async onModuleInit(): Promise<void> {
    const dlqName = this.config.get("SQS_WAGER_DLQ_NAME") ?? "wager-transactions-dlq.fifo";
    const mainName = this.config.get("SQS_WAGER_QUEUE_NAME") ?? "wager-transactions.fifo";
    const eventsName = this.config.get("SQS_EVENTS_QUEUE_NAME") ?? "wallet-events.fifo";
    const maxReceive = this.config.get("SQS_MAX_RECEIVE_COUNT") ?? "5";

    const dlqUrl = await this.ensureFifo(dlqName);
    const dlqArn = await this.queueArn(dlqUrl);
    await this.ensureFifo(mainName, {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: String(maxReceive),
      }),
    });
    await this.ensureFifo(eventsName);
    this.logger.log({ msg: "sqs_queues_ready" });
  }

  private async ensureFifo(name: string, extra: Record<string, string> = {}): Promise<string> {
    try {
      const existing = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }));
      if (existing.QueueUrl) {
        if (extra.RedrivePolicy) {
          await this.sqs.send(
            new SetQueueAttributesCommand({
              QueueUrl: existing.QueueUrl,
              Attributes: extra,
            }),
          );
        }
        return existing.QueueUrl;
      }
    } catch (error) {
      if (!(error instanceof QueueDoesNotExist)) {
        this.logger.warn({ msg: "sqs_get_queue_failed", name, err: String(error) });
      }
    }
    const created = await this.sqs.send(
      new CreateQueueCommand({
        QueueName: name,
        Attributes: {
          FifoQueue: "true",
          ContentBasedDeduplication: "false",
          ...extra,
        },
      }),
    );
    return created.QueueUrl!;
  }

  private async queueArn(url: string): Promise<string> {
    const { GetQueueAttributesCommand } = await import("@aws-sdk/client-sqs");
    const result = await this.sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: ["QueueArn"],
      }),
    );
    return result.Attributes?.QueueArn ?? "";
  }
}
