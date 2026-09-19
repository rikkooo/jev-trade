import { describe, expect, it } from "vitest";

import { PostgresLedgerAdapter, type LedgerSqlClient } from "./postgres";

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
});
