import { Module } from "@nestjs/common";
import { WageringModule } from "../wagering/wagering.module";
import { OutboxPublisher } from "./infrastructure/outbox.publisher";
import { PendingReferenceWorker } from "./infrastructure/pending-reference.worker";
import { QueueBootstrapService } from "./infrastructure/queue-bootstrap.service";
import { WagerSqsConsumer } from "./infrastructure/wager-sqs.consumer";

@Module({
  imports: [WageringModule],
  providers: [QueueBootstrapService, WagerSqsConsumer, OutboxPublisher, PendingReferenceWorker],
  exports: [OutboxPublisher, PendingReferenceWorker, WagerSqsConsumer],
})
export class MessagingModule {}
