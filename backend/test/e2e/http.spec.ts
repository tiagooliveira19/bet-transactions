import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../helpers/app";
import { createUuidV7 } from "../../src/shared/domain/create-id";

describe("HTTP e2e", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env.AUTH_ENABLED = "false";
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes live and ready health without auth", async () => {
    await request(server).get("/health/live").expect(200);
    await request(server).get("/health/ready").expect(200);
  });

  it("opens a wallet, bets, lists ledger and reconciles", async () => {
    const playerId = createUuidV7();
    const created = await request(server)
      .post("/wallets")
      .send({ playerId, initialBalance: { amount: "1000.00", currency: "BRL" } })
      .expect(201);
    expect(created.body.version).toBe(1);

    const walletId = created.body.id as string;
    const bet = await request(server)
      .post("/wagering/transactions")
      .set("Idempotency-Key", `provider-a:e2e-${walletId}`)
      .send({
        providerId: "provider-a",
        externalTransactionId: `e2e-${walletId}`,
        playerId,
        walletId,
        roundId: "round-987",
        gameId: "fortune-chimp",
        kind: "BET",
        money: { amount: "25.00", currency: "BRL" },
      });
    expect(bet.status).toBe(200);
    expect(bet.body.status).toBe("PROCESSED");
    expect(bet.body.balance.amount).toBe("975.00");
    expect(bet.body.idempotentReplay).toBe(false);

    const replay = await request(server)
      .post("/wagering/transactions")
      .set("Idempotency-Key", `provider-a:e2e-${walletId}`)
      .send({
        providerId: "provider-a",
        externalTransactionId: `e2e-${walletId}`,
        playerId,
        walletId,
        roundId: "round-987",
        gameId: "fortune-chimp",
        kind: "BET",
        money: { amount: "25.00", currency: "BRL" },
      });
    expect(replay.body.idempotentReplay).toBe(true);

    const conflict = await request(server)
      .post("/wagering/transactions")
      .set("Idempotency-Key", `provider-a:e2e-${walletId}`)
      .send({
        providerId: "provider-a",
        externalTransactionId: `e2e-${walletId}`,
        playerId,
        walletId,
        roundId: "round-987",
        gameId: "fortune-chimp",
        kind: "BET",
        money: { amount: "30.00", currency: "BRL" },
      });
    expect(conflict.status).toBe(409);

    const ledger = await request(server).get(`/wallets/${walletId}/ledger?limit=50`).expect(200);
    expect(ledger.body.items.length).toBeGreaterThan(0);

    const reconciliation = await request(server)
      .post(`/wallets/${walletId}/reconciliation`)
      .expect(201);
    expect(reconciliation.body.consistent).toBe(true);

    await request(server).get(`/wagering/transactions/${bet.body.transactionId}`).expect(200);
    await request(server)
      .get(`/providers/provider-a/wagering/transactions/e2e-${walletId}`)
      .expect(200);
  });

  it("serves swagger docs", async () => {
    const spec = await request(server).get("/docs-json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi || spec.body.swagger).toBeDefined();
  });
});

describe("HTTP e2e with Keycloak", () => {
  it("rejects business routes without a bearer token when auth is enabled", async () => {
    process.env.AUTH_ENABLED = "true";
    const authed = await createTestApp();
    try {
      const response = await request(authed.getHttpServer())
        .post("/wallets")
        .send({
          playerId: createUuidV7(),
          initialBalance: { amount: "10.00", currency: "BRL" },
        });
      expect(response.status).toBe(401);
      const live = await request(authed.getHttpServer()).get("/health/live");
      expect(live.status).toBe(200);
    } finally {
      process.env.AUTH_ENABLED = "false";
      await authed.close();
    }
  });

  it("accepts a client-credentials token from Keycloak", async () => {
    const tokenResponse = await fetch(
      `${process.env.KEYCLOAK_URL ?? "http://localhost:8080"}/realms/bet-transactions/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: "bet-transactions-api",
          client_secret: "bet-transactions-api-secret",
        }),
      },
    );
    expect(tokenResponse.ok).toBe(true);
    const token = (await tokenResponse.json()) as { access_token: string };
    process.env.AUTH_ENABLED = "true";
    const authed = await createTestApp();
    try {
      const wallet = await request(authed.getHttpServer())
        .post("/wallets")
        .set("Authorization", `Bearer ${token.access_token}`)
        .send({
          playerId: createUuidV7(),
          initialBalance: { amount: "10.00", currency: "BRL" },
        });
      expect(wallet.status).toBe(201);
    } finally {
      process.env.AUTH_ENABLED = "false";
      await authed.close();
    }
  });
});
