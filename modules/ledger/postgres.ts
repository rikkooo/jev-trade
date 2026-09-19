import type { PublicModeRequirements } from "../operations/provider-rights";
import { computeLedgerContentHash } from "./content-hash";
import { validateSnapshotHistory } from "./snapshot-contract";
import { sha256Canonical, type JsonValue } from "./canonical-json";
import type {
  Forecast,
  ForecastEvent,
  ForecastOutcome,
  IdempotentResult,
  MarketSnapshot,
  PaperEvent,
  PolicyDecision,
  ProcessorTerms,
  ProviderRights,
  VisitorPick,
} from "./types";

const MUTATION_STATEMENTS = {
  upsertSymbol: "select upsert_symbol($1::jsonb) as id",
  appendProviderRights: "select append_provider_rights($1::jsonb) as id",
  appendProcessorTerms: "select append_processor_terms($1::jsonb) as id",
  appendMarketBar: "select append_market_bar($1::jsonb) as id",
  appendMarketSnapshot:
    "select append_market_snapshot($1::jsonb, $2::jsonb, $3::jsonb) as id",
  appendJudgmentRun: "select append_judgment_run($1::jsonb, $2::jsonb) as id",
  appendPolicyDecision: "select append_policy_decision($1::jsonb) as id",
  voidForecast: "select id from void_forecast($1::jsonb)",
  appendPaperEvent: "select append_paper_event($1::jsonb) as id",
  appendPaperCorrection: "select append_paper_correction($1::jsonb) as id",
  appendJobOperation: "select append_job_operation($1::jsonb) as id",
  appendJobAttempt: "select append_job_attempt($1::jsonb, $2::text) as id",
  appendJobAttemptEvent: "select append_job_attempt_event($1::jsonb) as id",
  appendLedgerRoot: "select append_ledger_root($1::jsonb) as id",
  appendVisitorPickResult: "select append_visitor_pick_result($1::jsonb) as id",
} as const;

type MutationStatement =
  (typeof MUTATION_STATEMENTS)[keyof typeof MUTATION_STATEMENTS];

export interface SqlResult<Row> {
  readonly rows: readonly Row[];
}

export interface LedgerSqlClient {
  query<Row extends Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

function assertFiniteNumbers(
  entries: ReadonlyArray<readonly [string, number | undefined]>,
): void {
  for (const [field, value] of entries) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new TypeError(`${field} must be a finite JSON number`);
    }
  }
}

export interface SymbolMutation {
  readonly symbol: string;
  readonly exchange: string;
  readonly currency: string;
  readonly benchmarkSymbol: string;
  readonly enabled: boolean;
}

export interface MarketBarMutation {
  readonly id: string;
  readonly symbol: string;
  readonly provider: string;
  readonly sessionDate: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly sourceAvailableAt: string;
  readonly unadjustedOpen: number;
  readonly unadjustedHigh: number;
  readonly unadjustedLow: number;
  readonly unadjustedClose: number;
  readonly adjustedOpen: number;
  readonly adjustedHigh: number;
  readonly adjustedLow: number;
  readonly adjustedClose: number;
  readonly volume: number;
  readonly corporateAction?: Readonly<Record<string, unknown>>;
  readonly sourceHash: string;
}

export interface SnapshotBarReference {
  readonly barId: string;
  readonly role: "symbol" | "benchmark";
  readonly ordinal: number;
  readonly symbol: string;
  readonly sessionDate: string;
}

export interface EvidenceDescriptorMutation {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly availableAt: string;
  readonly descriptor: Readonly<Record<string, unknown>>;
}

export interface JudgmentRunMutation {
  readonly id: string;
  readonly snapshotId: string;
  readonly provider: string;
  readonly modelVersion: string;
  readonly questionVersion: string;
  readonly status: "succeeded" | "failed";
  readonly typedResponse?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface JudgmentAnswerMutation {
  readonly id: string;
  readonly answerId: string;
  readonly primitive: "choice" | "score";
  readonly selectedOption: string;
  readonly distribution: Readonly<Record<string, number>>;
  readonly confidence: number;
}

export interface JobOperationMutation {
  readonly id: string;
  readonly operationKey: string;
  readonly operationType:
    | "snapshot"
    | "judgment"
    | "publication"
    | "resolution"
    | "portfolio"
    | "attestation";
  readonly replayOfOperationId?: string;
}

export interface JobAttemptMutation {
  readonly id: string;
  readonly operationId: string;
  readonly attemptNumber: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface JobAttemptEventMutation {
  readonly id: string;
  readonly attemptId: string;
  readonly status: "evaluating" | "succeeded" | "failed";
  readonly errorCode?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface LedgerRootMutation {
  readonly id: string;
  readonly batchKey: string;
  readonly rootHash: string;
  readonly previousRootHash?: string;
  readonly attestationDeadline: string;
  readonly artifactUrl?: string;
  readonly attestationUrl?: string;
  readonly attestedAt?: string;
}

export interface VisitorPickResultMutation {
  readonly id: string;
  readonly visitorPickId: string;
  readonly outcomeId: string;
}

export interface PublishedForecastResult {
  readonly created: boolean;
  readonly forecastId: string;
}

export interface PublicForecastRow extends Record<string, unknown> {
  readonly forecast_id: string;
  readonly symbol: string;
  readonly mode: "position" | "sprint";
  readonly horizon_sessions: number;
  readonly cutoff_at: string;
  readonly latest_market_session: string;
  readonly provider: string;
  readonly model_version: string;
  readonly question_version: string;
  readonly policy_version: string;
  readonly status: "published" | "resolved" | "void";
  readonly realized_label: "up" | "flat" | "down" | null;
}

export type ForecastTerminalEventMutation = Omit<
  ForecastEvent,
  "createdAt" | "type" | "referencesEventId"
> & {
  readonly id: string;
  readonly type: "resolved" | "void";
  readonly referencesEventId?: never;
};

export type ForecastCorrectionEventMutation = Omit<
  ForecastEvent,
  "createdAt" | "type" | "referencesEventId" | "reason"
> & {
  readonly id: string;
  readonly type: "correction";
  readonly referencesEventId: string;
  readonly reason: string;
};

export type ForecastOutcomeMutation = Omit<
  ForecastOutcome,
  "createdAt" | "correctionOfOutcomeId" | "correctionReason"
> & {
  readonly correctionOfOutcomeId?: never;
  readonly correctionReason?: never;
};

export type ForecastOutcomeCorrectionMutation = Omit<
  ForecastOutcome,
  "createdAt" | "correctionOfOutcomeId" | "correctionReason"
> & {
  readonly correctionOfOutcomeId: string;
  readonly correctionReason: string;
};

export type PaperLedgerEventMutation = Omit<
  PaperEvent,
  "createdAt" | "type" | "correctionOfEventId"
> & {
  readonly type: Exclude<PaperEvent["type"], "correction">;
  readonly correctionOfEventId?: never;
};

export type PaperCorrectionMutation = Omit<
  PaperEvent,
  "createdAt" | "type" | "correctionOfEventId" | "reason"
> & {
  readonly type: "correction";
  readonly correctionOfEventId: string;
  readonly reason: string;
};

export type ProviderRightsMutation = Omit<ProviderRights, "createdAt"> & {
  readonly evidenceHash: string;
};
export type ProcessorTermsMutation = Omit<ProcessorTerms, "createdAt"> & {
  readonly evidenceHash: string;
};

/** Narrow boundary around the ledger's security-definer functions. */
export class PostgresLedgerAdapter {
  constructor(private readonly sql: LedgerSqlClient) {}

  async #appendId(
    statement: MutationStatement,
    parameters: readonly unknown[],
  ): Promise<string> {
    const result = await this.sql.query<{ id: string }>(statement, parameters);
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error("ledger mutation returned no ID");
    return id;
  }

  upsertSymbol(input: SymbolMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.upsertSymbol, [input]);
  }

  appendProviderRights(input: ProviderRightsMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendProviderRights, [input]);
  }

  appendProcessorTerms(input: ProcessorTermsMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendProcessorTerms, [input]);
  }

  appendMarketBar(input: MarketBarMutation): Promise<string> {
    for (const value of [
      input.unadjustedOpen,
      input.unadjustedHigh,
      input.unadjustedLow,
      input.unadjustedClose,
      input.adjustedOpen,
      input.adjustedHigh,
      input.adjustedLow,
      input.adjustedClose,
      input.volume,
    ]) {
      if (!Number.isFinite(value)) {
        throw new TypeError("market bar numbers must be finite JSON numbers");
      }
    }
    return this.#appendId(MUTATION_STATEMENTS.appendMarketBar, [input]);
  }

  appendMarketSnapshot(input: {
    readonly snapshot: Omit<MarketSnapshot, "createdAt" | "contentHash">;
    readonly benchmarkSymbol: string;
    readonly barReferences: readonly SnapshotBarReference[];
    readonly evidence: readonly EvidenceDescriptorMutation[];
  }): Promise<string> {
    validateSnapshotHistory({
      symbol: input.snapshot.symbol,
      benchmarkSymbol: input.benchmarkSymbol,
      latestMarketSession: input.snapshot.latestMarketSession,
      references: input.barReferences,
    });
    const hash = computeLedgerContentHash("market_snapshot", {
      symbol: input.snapshot.symbol,
      provider: input.snapshot.provider,
      cutoffAt: input.snapshot.cutoffAt,
      knowledgeCutoffAt: input.snapshot.knowledgeCutoffAt,
      providerFetchedAt: input.snapshot.providerFetchedAt,
      sourceUpdatedAt: input.snapshot.sourceUpdatedAt,
      latestMarketSession: input.snapshot.latestMarketSession,
      sourceManifest: input.snapshot.sourceManifest.map((source) => ({
        sourceId: source.sourceId,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        availableAt: source.availableAt,
      })),
      state: input.snapshot.state,
    });
    return this.#appendId(MUTATION_STATEMENTS.appendMarketSnapshot, [
      { ...input.snapshot, ...hash },
      input.barReferences,
      input.evidence.map((evidence) => ({
        ...evidence,
        contentHash: sha256Canonical(evidence.descriptor),
      })),
    ]);
  }

  appendJudgmentRun(input: {
    readonly run: JudgmentRunMutation;
    readonly answers: readonly JudgmentAnswerMutation[];
  }): Promise<string> {
    const hash = computeLedgerContentHash("judgment_run", {
      snapshotId: input.run.snapshotId,
      provider: input.run.provider,
      modelVersion: input.run.modelVersion,
      questionVersion: input.run.questionVersion,
      status: input.run.status,
      typedResponse: (input.run.typedResponse ?? null) as JsonValue,
      errorCode: input.run.errorCode ?? null,
      startedAt: input.run.startedAt,
      completedAt: input.run.completedAt,
      answers: input.answers as unknown as JsonValue,
    });
    return this.#appendId(MUTATION_STATEMENTS.appendJudgmentRun, [
      { ...input.run, ...hash },
      input.answers,
    ]);
  }

  appendPolicyDecision(
    input: Omit<PolicyDecision, "createdAt" | "contentHash">,
  ): Promise<string> {
    const hash = computeLedgerContentHash("policy_decision", {
      judgmentId: input.judgmentId,
      policyVersion: input.policyVersion,
      action: input.action,
      gateTrace: input.gateTrace,
      sizing: input.sizing ?? null,
    });
    return this.#appendId(MUTATION_STATEMENTS.appendPolicyDecision, [
      { ...input, ...hash },
    ]);
  }

  async publishForecast(input: {
    readonly forecast: Omit<Forecast, "createdAt">;
    readonly publicationEventId: string;
  }): Promise<PublishedForecastResult> {
    const result = await this.sql.query<{
      created: boolean;
      forecast_id: string;
    }>(
      "select created, forecast_id from publish_forecast($1::jsonb, $2::text)",
      [input.forecast, input.publicationEventId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("publish_forecast returned no row");
    return { created: row.created, forecastId: row.forecast_id };
  }

  async resolveForecast(input: {
    readonly event: ForecastTerminalEventMutation & {
      readonly type: "resolved";
    };
    readonly outcome: ForecastOutcomeMutation;
  }): Promise<{ created: boolean; eventId: string; outcomeId: string }> {
    assertFiniteNumbers([
      ["adjustedReturn", input.outcome.adjustedReturn],
      ["brierScore", input.outcome.brierScore],
      ["logLoss", input.outcome.logLoss],
    ]);
    const result = await this.sql.query<{
      created: boolean;
      event_id: string;
      outcome_id: string;
    }>("select * from resolve_forecast($1::jsonb, $2::jsonb)", [
      input.event,
      input.outcome,
    ]);
    const row = result.rows[0];
    if (row === undefined) throw new Error("resolve_forecast returned no row");
    return {
      created: row.created,
      eventId: row.event_id,
      outcomeId: row.outcome_id,
    };
  }

  voidForecast(
    input: ForecastTerminalEventMutation & { readonly type: "void" },
  ): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.voidForecast, [input]);
  }

  async correctForecastOutcome(input: {
    readonly event: ForecastCorrectionEventMutation;
    readonly outcome: ForecastOutcomeCorrectionMutation;
  }): Promise<{ created: boolean; eventId: string; outcomeId: string }> {
    assertFiniteNumbers([
      ["adjustedReturn", input.outcome.adjustedReturn],
      ["brierScore", input.outcome.brierScore],
      ["logLoss", input.outcome.logLoss],
    ]);
    const result = await this.sql.query<{
      created: boolean;
      event_id: string;
      outcome_id: string;
    }>("select * from correct_forecast_outcome($1::jsonb, $2::jsonb)", [
      input.event,
      input.outcome,
    ]);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("correct_forecast_outcome returned no row");
    }
    return {
      created: row.created,
      eventId: row.event_id,
      outcomeId: row.outcome_id,
    };
  }

  appendPaperEvent(input: PaperLedgerEventMutation): Promise<string> {
    assertFiniteNumbers([
      ["cashDelta", input.cashDelta],
      ["sharesDelta", input.sharesDelta],
      ["price", input.price],
    ]);
    return this.#appendId(MUTATION_STATEMENTS.appendPaperEvent, [input]);
  }

  appendPaperCorrection(input: PaperCorrectionMutation): Promise<string> {
    assertFiniteNumbers([
      ["cashDelta", input.cashDelta],
      ["sharesDelta", input.sharesDelta],
      ["price", input.price],
    ]);
    return this.#appendId(MUTATION_STATEMENTS.appendPaperCorrection, [input]);
  }

  appendJobOperation(input: JobOperationMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendJobOperation, [input]);
  }

  appendJobAttempt(
    input: JobAttemptMutation,
    scheduledEventId: string,
  ): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendJobAttempt, [
      input,
      scheduledEventId,
    ]);
  }

  appendJobAttemptEvent(input: JobAttemptEventMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendJobAttemptEvent, [input]);
  }

  appendLedgerRoot(input: LedgerRootMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendLedgerRoot, [input]);
  }

  appendVisitorPickResult(input: VisitorPickResultMutation): Promise<string> {
    return this.#appendId(MUTATION_STATEMENTS.appendVisitorPickResult, [input]);
  }

  async purgeExpiredIdentifiers(
    runId: string,
    cutoffAt: string,
  ): Promise<number> {
    const result = await this.sql.query<{ purged: number }>(
      "select purge_expired_identifiers($1, $2) as purged",
      [runId, cutoffAt],
    );
    const purged = result.rows[0]?.purged;
    if (purged === undefined) {
      throw new Error("purge_expired_identifiers returned no count");
    }
    return purged;
  }

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
    requirements: PublicModeRequirements,
  ): Promise<{ allowed: boolean; blockers: readonly string[] }> {
    const result = await this.sql.query<{
      allowed: boolean;
      blockers: string[];
    }>("select allowed, blockers from public_mode_gate($1, $2, $3, $4)", [
      requirements.at,
      requirements.expectedProvider,
      requirements.expectedProcessor,
      requirements.requiredFields,
    ]);
    const row = result.rows[0];
    if (row === undefined) throw new Error("public_mode_gate returned no row");
    return row;
  }

  async readPublicForecasts(): Promise<readonly PublicForecastRow[]> {
    const result = await this.sql.query<PublicForecastRow>(
      "select * from read_public_forecasts()",
    );
    return result.rows;
  }
}
