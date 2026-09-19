import type { IdempotentResult, VisitorPick } from "./types";

export interface SqlResult<Row> {
  readonly rows: readonly Row[];
}

export interface LedgerSqlClient {
  query<Row extends Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

/**
 * Narrow boundary around the ledger's security-definer functions. Connection
 * ownership and credentials stay in composition code, never in this module.
 */
export class PostgresLedgerAdapter {
  constructor(private readonly sql: LedgerSqlClient) {}

  async recordVisitorPick(input: {
    readonly id: string;
    readonly identifierId: string;
    readonly identifierDigest: string;
    readonly expiresAt: string;
    readonly forecastId: string;
    readonly choice: "up" | "flat" | "down";
  }): Promise<IdempotentResult<VisitorPick>> {
    const result = await this.sql.query<{
      created: boolean;
      id: string;
      forecast_id: string;
      choice: "up" | "flat" | "down";
      created_at: string;
    }>("select * from record_visitor_pick($1, $2, $3, $4, $5, $6)", [
      input.id,
      input.identifierId,
      input.identifierDigest,
      input.expiresAt,
      input.forecastId,
      input.choice,
    ]);
    const row = result.rows[0];
    if (row === undefined)
      throw new Error("record_visitor_pick returned no row");
    return {
      created: row.created,
      value: {
        id: row.id,
        forecastId: row.forecast_id,
        choice: row.choice,
        createdAt: row.created_at,
      },
    };
  }

  async recordAnalyticsEvent(input: {
    readonly id: string;
    readonly consent: boolean;
    readonly identifierId: string;
    readonly identifierDigest: string;
    readonly expiresAt: string;
    readonly event: "stock_view" | "pick" | "reveal" | "return" | "share";
    readonly symbol?: string;
    readonly forecastId?: string;
  }): Promise<string | null> {
    const result = await this.sql.query<{ event_id: string | null }>(
      "select record_analytics_event($1, $2, $3, $4, $5, $6, $7, $8) as event_id",
      [
        input.id,
        input.consent,
        input.identifierId,
        input.identifierDigest,
        input.expiresAt,
        input.event,
        input.symbol ?? null,
        input.forecastId ?? null,
      ],
    );
    return result.rows[0]?.event_id ?? null;
  }

  async publicModeGate(
    at: string,
  ): Promise<{ allowed: boolean; blockers: readonly string[] }> {
    const result = await this.sql.query<{
      allowed: boolean;
      blockers: string[];
    }>("select allowed, blockers from public_mode_gate($1)", [at]);
    const row = result.rows[0];
    if (row === undefined) throw new Error("public_mode_gate returned no row");
    return row;
  }
}
