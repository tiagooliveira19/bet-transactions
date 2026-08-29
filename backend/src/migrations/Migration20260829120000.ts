import { Migration } from "@mikro-orm/migrations";

export class Migration20260829120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallets (
        id uuid PRIMARY KEY,
        player_id uuid NOT NULL,
        currency char(3) NOT NULL,
        balance_amount numeric(20, 2) NOT NULL,
        version integer NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency),
        CONSTRAINT wallets_balance_non_negative CHECK (balance_amount >= 0),
        CONSTRAINT wallets_version_positive CHECK (version >= 1)
      );
    `);

    this.addSql(`
      CREATE TABLE wager_transactions (
        id uuid PRIMARY KEY,
        provider_id text NOT NULL,
        external_transaction_id text NOT NULL,
        idempotency_key text NOT NULL,
        payload_hash text NOT NULL,
        wallet_id uuid NOT NULL REFERENCES wallets(id),
        player_id uuid NOT NULL,
        round_id text NOT NULL,
        game_id text NOT NULL,
        kind varchar(16) NOT NULL,
        amount numeric(20, 2) NOT NULL,
        currency char(3) NOT NULL,
        reference_external_transaction_id text,
        created_at timestamptz NOT NULL,
        status varchar(32) NOT NULL,
        reference_transaction_id uuid,
        failure_code text,
        processed_at timestamptz,
        observed_balance_amount numeric(20, 2),
        observed_balance_currency char(3),
        reference_retry_count integer NOT NULL DEFAULT 0,
        next_reference_attempt_at timestamptz,
        CONSTRAINT wager_transactions_idempotency_unique UNIQUE (idempotency_key),
        CONSTRAINT wager_transactions_provider_external_unique UNIQUE (provider_id, external_transaction_id),
        CONSTRAINT wager_transactions_kind_check CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
        CONSTRAINT wager_transactions_status_check CHECK (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')),
        CONSTRAINT wager_transactions_amount_non_negative CHECK (amount >= 0)
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wager_transactions_one_reversal_per_kind
      ON wager_transactions (provider_id, kind, reference_external_transaction_id)
      WHERE kind IN ('REFUND', 'ROLLBACK')
        AND status NOT IN ('REJECTED', 'FAILED');
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_pending_ref_idx
      ON wager_transactions (status, next_reference_attempt_at);
    `);

    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id uuid PRIMARY KEY,
        wallet_id uuid NOT NULL REFERENCES wallets(id),
        transaction_id uuid NOT NULL REFERENCES wager_transactions(id),
        direction varchar(8) NOT NULL,
        amount numeric(20, 2) NOT NULL,
        currency char(3) NOT NULL,
        balance_before numeric(20, 2) NOT NULL,
        balance_after numeric(20, 2) NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT wallet_ledger_entries_transaction_unique UNIQUE (transaction_id),
        CONSTRAINT wallet_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT wallet_ledger_direction_check CHECK (direction IN ('DEBIT', 'CREDIT')),
        CONSTRAINT wallet_ledger_arithmetic CHECK (
          (direction = 'CREDIT' AND balance_after = balance_before + amount) OR
          (direction = 'DEBIT' AND balance_after = balance_before - amount)
        )
      );
    `);

    this.addSql(`
      CREATE INDEX wallet_ledger_cursor_idx
      ON wallet_ledger_entries (wallet_id, created_at DESC, id DESC);
    `);

    this.addSql(`
      CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ledger entries are immutable';
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER wallet_ledger_entries_no_update
      BEFORE UPDATE OR DELETE ON wallet_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
    `);

    this.addSql(`
      CREATE TABLE inbox_messages (
        consumer_name text NOT NULL,
        message_id text NOT NULL,
        payload_hash text NOT NULL,
        received_at timestamptz NOT NULL,
        processed_at timestamptz,
        PRIMARY KEY (consumer_name, message_id)
      );
    `);

    this.addSql(`
      CREATE TABLE outbox_messages (
        id uuid PRIMARY KEY,
        aggregate_id text NOT NULL,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        published_at timestamptz
      );
    `);

    this.addSql(`
      CREATE INDEX outbox_due_idx
      ON outbox_messages (published_at, next_attempt_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql("DROP TABLE IF EXISTS outbox_messages;");
    this.addSql("DROP TABLE IF EXISTS inbox_messages;");
    this.addSql("DROP TRIGGER IF EXISTS wallet_ledger_entries_no_update ON wallet_ledger_entries;");
    this.addSql("DROP FUNCTION IF EXISTS forbid_ledger_mutation();");
    this.addSql("DROP TABLE IF EXISTS wallet_ledger_entries;");
    this.addSql("DROP TABLE IF EXISTS wager_transactions;");
    this.addSql("DROP TABLE IF EXISTS wallets;");
  }
}
