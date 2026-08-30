import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { createTestApp, openWallet } from "../helpers/app";
import { createUuidV7 } from "../../src/shared/domain/create-id";

describe("schema constraints (real PostgreSQL)", () => {
  let app: INestApplication;
  let em: EntityManager;

  beforeAll(async () => {
    app = await createTestApp();
    em = app.get(EntityManager);
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a duplicate wallet for the same player and currency", async () => {
    const playerId = createUuidV7();
    await openWallet(app, "10.00", playerId);
    await expect(openWallet(app, "10.00", playerId)).rejects.toThrow();
  });

  it("rejects a negative stored balance", async () => {
    await expect(
      em
        .getConnection()
        .execute("INSERT INTO wallets VALUES (?, ?, 'BRL', -1, 1, now(), now())", [
          createUuidV7(),
          createUuidV7(),
        ]),
    ).rejects.toThrow();
  });

  it("forbids updating or deleting ledger entries", async () => {
    const wallet = await openWallet(app, "50.00");
    await expect(
      em
        .getConnection()
        .execute("UPDATE wallet_ledger_entries SET amount = 1 WHERE wallet_id = ?", [wallet.id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      em
        .getConnection()
        .execute("DELETE FROM wallet_ledger_entries WHERE wallet_id = ?", [wallet.id]),
    ).rejects.toThrow(/immutable/);
  });
});
