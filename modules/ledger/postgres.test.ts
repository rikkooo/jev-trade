import { describe, expect, it } from "vitest";

import { PostgresLedgerAdapter, type LedgerSqlClient } from "./postgres";
import { sha256Text } from "./canonical-json";

class RecordingClient implements LedgerSqlClient {
  readonly calls: Array<{
    statement: string;
    parameters: readonly unknown[] | undefined;
  }> = [];

  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  query<Row extends Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }> {
    this.calls.push({ statement, parameters });
    return Promise.resolve({ rows: this.rows as readonly Row[] });
  }
}

describe("PostgresLedgerAdapter", () => {
  it("routes mutations only through the named security-definer function", async () => {
    const client = new RecordingClient([{ id: "AAPL" }]);
    const adapter = new PostgresLedgerAdapter(client);
    const input = {
      symbol: "AAPL",
      exchange: "XNAS",
      currency: "USD",
      benchmarkSymbol: "SPY",
      enabled: true,
    } as const;

    await expect(adapter.upsertSymbol(input)).resolves.toBe("AAPL");
    expect(client.calls).toEqual([
      {
        statement: "select upsert_symbol($1::jsonb) as id",
        parameters: [input],
      },
    ]);
  });

  it("passes every exact public-mode requirement to PostgreSQL", async () => {
    const client = new RecordingClient([{ allowed: true, blockers: [] }]);
    const adapter = new PostgresLedgerAdapter(client);
    const requirements = {
      at: "2026-09-19T12:00:00.000Z",
      expectedProvider: "licensed-provider",
      expectedProcessor: "openrouter-jev",
      requiredFields: ["daily_ohlcv", "corporate_actions"],
    } as const;

    await expect(adapter.publicModeGate(requirements)).resolves.toEqual({
      allowed: true,
      blockers: [],
    });
    expect(client.calls[0]?.parameters).toEqual([
      requirements.at,
      requirements.expectedProvider,
      requirements.expectedProcessor,
      requirements.requiredFields,
    ]);
  });

  it("does not let a public reader choose the rights-evaluation instant", async () => {
    const client = new RecordingClient([]);
    const adapter = new PostgresLedgerAdapter(client);
    await expect(adapter.readPublicForecasts()).resolves.toEqual([]);
    expect(client.calls).toEqual([
      {
        statement: "select * from read_public_forecasts()",
        parameters: undefined,
      },
    ]);
  });

  it("returns publication identity without requiring direct table reads", async () => {
    const client = new RecordingClient([
      { created: false, forecast_id: "forecast_1" },
    ]);
    const adapter = new PostgresLedgerAdapter(client);
    const forecast = {
      id: "forecast_1",
      publicationKey: "AAPL:2026-09-18:position:v1",
      snapshotId: "snapshot_1",
      judgmentId: "judgment_1",
      policyDecisionId: "policy_1",
      symbol: "AAPL",
      mode: "position",
      horizonSessions: 20,
      cutoffAt: "2026-09-18T21:00:00.000Z",
      latestMarketSession: "2026-09-18",
      modelVersion: "jev-v1",
      questionVersion: "questions-v1",
      policyVersion: "policy-v1",
      deploymentSha: "deadbeef",
    } as const;

    await expect(
      adapter.publishForecast({
        forecast,
        publicationEventId: "forecast_event_1",
      }),
    ).resolves.toEqual({ created: false, forecastId: "forecast_1" });
    expect(client.calls[0]?.statement).toBe(
      "select created, forecast_id from publish_forecast($1::jsonb, $2::text)",
    );
  });

  it("keeps worker and operator correction procedures distinct", async () => {
    const client = new RecordingClient([{ id: "paper_1" }]);
    const adapter = new PostgresLedgerAdapter(client);
    const base = {
      id: "paper_1",
      cashDelta: 0,
      sharesDelta: 0,
    } as const;

    await adapter.appendPaperEvent({ ...base, type: "mark" });
    await adapter.appendPaperCorrection({
      ...base,
      type: "correction",
      correctionOfEventId: "paper_0",
      reason: "provider revision",
    });

    expect(client.calls.map((call) => call.statement)).toEqual([
      "select append_paper_event($1::jsonb) as id",
      "select append_paper_correction($1::jsonb) as id",
    ]);
  });

  it("computes a versioned policy hash instead of accepting a caller assertion", async () => {
    const client = new RecordingClient([{ id: "policy_1" }]);
    const adapter = new PostgresLedgerAdapter(client);

    await adapter.appendPolicyDecision({
      id: "policy_1",
      judgmentId: "judgment_1",
      policyVersion: "policy-v1",
      action: "enter",
      gateTrace: { eligible: true },
      sizing: { shares: 10 },
    });

    const parameter = client.calls[0]?.parameters?.[0] as {
      canonicalPayload: string;
      contentHash: string;
    };
    expect(JSON.parse(parameter.canonicalPayload)).toMatchObject({
      recipe: "jev-ledger-canonical-json/v1",
      kind: "policy_decision",
    });
    expect(parameter.contentHash).toBe(sha256Text(parameter.canonicalPayload));
    expect(parameter.contentHash).toBe(
      "868f3f955d7664b6141c374b04b57e836052f2090449fbda5e21f85b25526fe6",
    );
  });

  it("uses one atomic resolution call", async () => {
    const client = new RecordingClient([
      { created: false, event_id: "event_1", outcome_id: "outcome_1" },
    ]);
    const adapter = new PostgresLedgerAdapter(client);
    await expect(
      adapter.resolveForecast({
        event: {
          id: "event_1",
          forecastId: "forecast_1",
          type: "resolved",
          reason: "fixed horizon",
        },
        outcome: {
          id: "outcome_1",
          forecastId: "forecast_1",
          realizedLabel: "up",
          adjustedReturn: 0.03,
          sourceBarHash: "a".repeat(64),
        },
      }),
    ).resolves.toEqual({
      created: false,
      eventId: "event_1",
      outcomeId: "outcome_1",
    });
    expect(client.calls[0]?.statement).toBe(
      "select * from resolve_forecast($1::jsonb, $2::jsonb)",
    );
  });

  it("rejects non-finite numbers before reaching PostgreSQL", async () => {
    const client = new RecordingClient([{ id: "bar_1" }]);
    const adapter = new PostgresLedgerAdapter(client);
    expect(() =>
      adapter.appendMarketBar({
        id: "bar_1",
        symbol: "AAPL",
        provider: "provider",
        sessionDate: "2026-09-18",
        sourceId: "source",
        sourceRevision: "v1",
        sourceAvailableAt: "2026-09-18T21:30:00.000Z",
        unadjustedOpen: Number.NaN,
        unadjustedHigh: 102,
        unadjustedLow: 99,
        unadjustedClose: 101,
        adjustedOpen: 100,
        adjustedHigh: 102,
        adjustedLow: 99,
        adjustedClose: 101,
        volume: 1000,
        sourceHash: "a".repeat(64),
      }),
    ).toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });
});
