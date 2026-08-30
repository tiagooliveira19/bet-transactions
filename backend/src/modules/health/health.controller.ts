import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { EntityManager } from "@mikro-orm/core";
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
  ) {}

  @Get("live")
  @ApiOperation({ summary: "Process is alive" })
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "PostgreSQL and SQS are reachable" })
  async ready() {
    await this.em.getConnection().execute("SELECT 1");
    const sqs = new SQSClient({
      region: this.config.get("AWS_REGION") ?? "us-east-1",
      endpoint: this.config.get("AWS_ENDPOINT_URL"),
      credentials: {
        accessKeyId: this.config.get("AWS_ACCESS_KEY_ID") ?? "test",
        secretAccessKey: this.config.get("AWS_SECRET_ACCESS_KEY") ?? "test",
      },
    });
    await sqs.send(
      new GetQueueUrlCommand({
        QueueName: this.config.get("SQS_WAGER_QUEUE_NAME") ?? "wager-transactions.fifo",
      }),
    );
    return { status: "ok" };
  }
}
