import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "inbox_messages" })
export class InboxOrmEntity {
  @PrimaryKey({ type: "string", fieldName: "consumer_name" })
  consumerName!: string;

  @PrimaryKey({ type: "string", fieldName: "message_id" })
  messageId!: string;

  @Property({ type: "string", fieldName: "payload_hash" })
  payloadHash!: string;

  @Property({ type: "timestamptz", fieldName: "received_at" })
  receivedAt!: Date;

  @Property({ type: "timestamptz", nullable: true, fieldName: "processed_at" })
  processedAt?: Date;
}
