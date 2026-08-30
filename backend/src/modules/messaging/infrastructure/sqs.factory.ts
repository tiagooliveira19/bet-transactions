import { SQSClient } from "@aws-sdk/client-sqs";
import { ConfigService } from "@nestjs/config";

export function createSqsClient(config: ConfigService): SQSClient {
  return new SQSClient({
    region: config.get("AWS_REGION") ?? "us-east-1",
    endpoint: config.get("AWS_ENDPOINT_URL"),
    credentials: {
      accessKeyId: config.get("AWS_ACCESS_KEY_ID") ?? "test",
      secretAccessKey: config.get("AWS_SECRET_ACCESS_KEY") ?? "test",
    },
  });
}
