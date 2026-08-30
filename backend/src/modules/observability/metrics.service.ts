import { Injectable, OnModuleInit } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  private readonly transactions = new Counter({
    name: "wager_transactions_total",
    help: "Wager transactions by status",
    labelNames: ["status"],
    registers: [this.registry],
  });

  private readonly duplicates = new Counter({
    name: "wager_duplicates_total",
    help: "Idempotent replays detected",
    registers: [this.registry],
  });

  private readonly retries = new Counter({
    name: "wager_retries_total",
    help: "Transient retries",
    labelNames: ["kind"],
    registers: [this.registry],
  });

  private readonly dlq = new Counter({
    name: "sqs_dlq_messages_total",
    help: "Messages observed in the DLQ",
    registers: [this.registry],
  });

  private readonly lockConflicts = new Counter({
    name: "wallet_lock_conflicts_total",
    help: "Wallet lock conflicts",
    registers: [this.registry],
  });

  private readonly outboxLag = new Gauge({
    name: "outbox_lag_seconds",
    help: "Age of the oldest unpublished outbox message",
    registers: [this.registry],
  });

  private readonly processingLatency = new Histogram({
    name: "wager_processing_duration_seconds",
    help: "Wager processing latency",
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
    registers: [this.registry],
  });

  private readonly reconciliationDivergences = new Counter({
    name: "wallet_reconciliation_divergences_total",
    help: "Wallet vs ledger divergences",
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  recordTransaction(status: string): void {
    this.transactions.inc({ status });
  }

  recordDuplicate(): void {
    this.duplicates.inc();
  }

  recordRetry(kind: string): void {
    this.retries.inc({ kind });
  }

  recordDlq(): void {
    this.dlq.inc();
  }

  recordLockConflict(): void {
    this.lockConflicts.inc();
  }

  setOutboxLag(seconds: number): void {
    this.outboxLag.set(seconds);
  }

  observeProcessing(seconds: number): void {
    this.processingLatency.observe(seconds);
  }

  recordReconciliationDivergence(): void {
    this.reconciliationDivergences.inc();
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
