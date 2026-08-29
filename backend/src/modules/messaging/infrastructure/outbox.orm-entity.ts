import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

@Entity({ tableName: "outbox_messages" })
@Index({ properties: ["publishedAt", "nextAttemptAt"], name: "outbox_due_idx" })
export class OutboxOrmEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", fieldName: "aggregate_id" })
  aggregateId!: string;

  @Property({ type: "string", fieldName: "event_type" })
  eventType!: string;

  @Property({ type: "json" })
  payload!: Record<string, unknown>;

  @Property({ type: "timestamptz", fieldName: "occurred_at" })
  occurredAt!: Date;

  @Property({ type: "int" })
  attempts = 0;

  @Property({ type: "timestamptz", nullable: true, fieldName: "next_attempt_at" })
  nextAttemptAt?: Date;

  @Property({ type: "timestamptz", nullable: true, fieldName: "published_at" })
  publishedAt?: Date;
}
