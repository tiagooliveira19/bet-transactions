export function applyTestEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = process.env.AUTH_ENABLED ?? "false";
  process.env.SQS_CONSUMER_ENABLED = process.env.SQS_CONSUMER_ENABLED ?? "false";
  process.env.OUTBOX_PUBLISHER_ENABLED = process.env.OUTBOX_PUBLISHER_ENABLED ?? "false";
  process.env.PENDING_REF_WORKER_ENABLED = process.env.PENDING_REF_WORKER_ENABLED ?? "false";
  process.env.DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost";
  process.env.DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
  process.env.DATABASE_NAME = process.env.DATABASE_NAME ?? "bet_transactions";
  process.env.DATABASE_USER = process.env.DATABASE_USER ?? "bet";
  process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "bet";
  process.env.AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
  process.env.AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? "test";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "test";
  process.env.KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
  process.env.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "bet-transactions";
  process.env.KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE ?? "bet-transactions-api";
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";
}
