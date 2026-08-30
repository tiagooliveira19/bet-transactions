import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Clock, SystemClock } from "../../../shared/domain/clock";
import { MetricsService } from "../../observability/metrics.service";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { SubmitWagerUseCase } from "../../wagering/application/submit-wager.use-case";

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private readonly clock: Clock = new SystemClock();
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly submitWager: SubmitWagerUseCase,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get("PENDING_REF_WORKER_ENABLED") === "false") {
      return;
    }
    this.running = true;
    this.loop = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  async processDue(limit = 20): Promise<number> {
    const now = this.clock.now();
    const due = await this.unitOfWork.run((ctx) => ctx.findDuePendingReferences(now, limit));
    for (const transaction of due) {
      try {
        await this.submitWager.reprocessPending(transaction.id);
        this.metrics.recordRetry("pending_reference");
      } catch (error) {
        this.logger.warn({
          msg: "pending_reference_retry_failed",
          transactionId: transaction.id,
          err: String(error),
        });
      }
    }
    return due.length;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.processDue();
      } catch (error) {
        this.logger.warn({ msg: "pending_reference_poll_failed", err: String(error) });
      }
      await Bun.sleep(1000);
    }
  }
}
