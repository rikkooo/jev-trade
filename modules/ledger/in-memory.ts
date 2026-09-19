import {
  evaluatePublicModeGate,
  type PublicModeRequirements,
} from "../operations/provider-rights";
import { sha256Canonical, sha256Text } from "./canonical-json";
import { computeLedgerContentHash } from "./content-hash";
import {
  LedgerConflictError,
  LedgerInvariantError,
  LedgerNotFoundError,
} from "./errors";
import { rebuildLedgerProjection } from "./replay";
import type { LedgerRepository } from "./repository";
import type {
  AnalyticsEvent,
  Forecast,
  ForecastEvent,
  ForecastOutcome,
  ForecastResolution,
  IdempotentResult,
  JobAttempt,
  JudgmentRun,
  LedgerState,
  MarketSnapshot,
  PaperEvent,
  PolicyDecision,
  PrivateIdentifier,
  ProcessorTerms,
  ProviderRights,
  VisitorPick,
} from "./types";

interface RepositoryDependencies {
  readonly now?: () => Date;
  readonly id?: (prefix: string) => string;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }
  return value;
}

function assertTimestamp(value: string, field: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new LedgerInvariantError(
      `${field} must be a canonical ISO timestamp`,
    );
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new LedgerInvariantError(`${field} cannot be empty`);
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return sha256Canonical(left) === sha256Canonical(right);
}

export class InMemoryLedgerRepository implements LedgerRepository {
  readonly #now: () => Date;
  readonly #id: (prefix: string) => string;
  readonly #snapshots: MarketSnapshot[] = [];
  readonly #judgments: JudgmentRun[] = [];
  readonly #policyDecisions: PolicyDecision[] = [];
  readonly #forecasts: Forecast[] = [];
  readonly #forecastEvents: ForecastEvent[] = [];
  readonly #outcomes: ForecastOutcome[] = [];
  readonly #paperEvents: PaperEvent[] = [];
  readonly #jobAttempts: JobAttempt[] = [];
  readonly #visitorPicks: VisitorPick[] = [];
  readonly #analyticsEvents: AnalyticsEvent[] = [];
  readonly #providerRights: ProviderRights[] = [];
  readonly #processorTerms: ProcessorTerms[] = [];
  readonly #privateIdentifiers: PrivateIdentifier[] = [];

  constructor(dependencies: RepositoryDependencies = {}) {
    this.#now = dependencies.now ?? (() => new Date());
    this.#id =
      dependencies.id ??
      ((prefix) =>
        `${prefix}_${this.#now().getTime()}_${Math.random().toString(36).slice(2)}`);
  }

  #createdAt(): string {
    return this.#now().toISOString();
  }

  insertSnapshot(
    input: Omit<MarketSnapshot, "contentHash" | "createdAt">,
  ): MarketSnapshot {
    assertNonEmpty(input.id, "snapshot.id");
    assertNonEmpty(input.symbol, "snapshot.symbol");
    assertTimestamp(input.cutoffAt, "snapshot.cutoffAt");
    assertTimestamp(input.knowledgeCutoffAt, "snapshot.knowledgeCutoffAt");
    assertTimestamp(input.providerFetchedAt, "snapshot.providerFetchedAt");
    assertTimestamp(input.sourceUpdatedAt, "snapshot.sourceUpdatedAt");
    if (
      input.cutoffAt > input.knowledgeCutoffAt ||
      input.providerFetchedAt > input.knowledgeCutoffAt ||
      input.sourceUpdatedAt > input.knowledgeCutoffAt ||
      input.sourceUpdatedAt > input.providerFetchedAt
    ) {
      throw new LedgerInvariantError(
        "Snapshot sources must be available by the knowledge cutoff",
      );
    }
    if (input.sourceManifest.length === 0) {
      throw new LedgerInvariantError(
        "Snapshot source provenance cannot be empty",
      );
    }
    const sourceVersions = new Set<string>();
    for (const source of input.sourceManifest) {
      assertNonEmpty(source.sourceId, "snapshot source ID");
      assertNonEmpty(source.sourceRevision, "snapshot source revision");
      assertTimestamp(source.availableAt, "snapshot source availableAt");
      if (!/^[a-f0-9]{64}$/.test(source.sourceHash)) {
        throw new LedgerInvariantError(
          "Snapshot source hash must be a SHA-256 hex digest",
        );
      }
      if (
        source.availableAt > input.knowledgeCutoffAt ||
        source.availableAt > input.providerFetchedAt
      ) {
        throw new LedgerInvariantError(
          "Snapshot source was unavailable when the provider response was fetched",
        );
      }
      const sourceVersion = `${source.sourceId}\u0000${source.sourceRevision}`;
      if (sourceVersions.has(sourceVersion)) {
        throw new LedgerInvariantError(
          "Snapshot source versions must be unique",
        );
      }
      sourceVersions.add(sourceVersion);
    }
    const { contentHash } = computeLedgerContentHash("market_snapshot", {
      symbol: input.symbol,
      provider: input.provider,
      cutoffAt: input.cutoffAt,
      knowledgeCutoffAt: input.knowledgeCutoffAt,
      providerFetchedAt: input.providerFetchedAt,
      sourceUpdatedAt: input.sourceUpdatedAt,
      latestMarketSession: input.latestMarketSession,
      sourceManifest: input.sourceManifest.map((source) => ({ ...source })),
      state: input.state,
    });
    const existing = this.#snapshots.find(
      (snapshot) =>
        snapshot.id === input.id || snapshot.contentHash === contentHash,
    );
    if (existing !== undefined) {
      if (
        existing.id === input.id &&
        existing.symbol === input.symbol &&
        existing.provider === input.provider &&
        existing.cutoffAt === input.cutoffAt &&
        existing.knowledgeCutoffAt === input.knowledgeCutoffAt &&
        existing.providerFetchedAt === input.providerFetchedAt &&
        existing.sourceUpdatedAt === input.sourceUpdatedAt &&
        existing.latestMarketSession === input.latestMarketSession &&
        sameCanonical(existing.sourceManifest, input.sourceManifest) &&
        sameCanonical(existing.state, input.state)
      ) {
        return immutableClone(existing);
      }
      throw new LedgerConflictError("An immutable snapshot cannot be replaced");
    }

    const snapshot = immutableClone({
      ...input,
      contentHash,
      createdAt: this.#createdAt(),
    });
    this.#snapshots.push(snapshot);
    return immutableClone(snapshot);
  }

  insertJudgment(
    input: Omit<JudgmentRun, "contentHash" | "createdAt">,
  ): JudgmentRun {
    if (!this.#snapshots.some((snapshot) => snapshot.id === input.snapshotId)) {
      throw new LedgerNotFoundError(
        `Snapshot ${input.snapshotId} does not exist`,
      );
    }
    const { contentHash } = computeLedgerContentHash("judgment_run", {
      snapshotId: input.snapshotId,
      provider: input.provider,
      modelVersion: input.modelVersion,
      questionVersion: input.questionVersion,
      answers: input.answers,
    });
    const existing = this.#judgments.find(
      (judgment) => judgment.id === input.id,
    );
    if (existing !== undefined) {
      if (existing.contentHash === contentHash) return immutableClone(existing);
      throw new LedgerConflictError("An immutable judgment cannot be replaced");
    }
    const judgment = immutableClone({
      ...input,
      contentHash,
      createdAt: this.#createdAt(),
    });
    this.#judgments.push(judgment);
    return immutableClone(judgment);
  }

  insertPolicyDecision(
    input: Omit<PolicyDecision, "contentHash" | "createdAt">,
  ): PolicyDecision {
    if (!this.#judgments.some((judgment) => judgment.id === input.judgmentId)) {
      throw new LedgerNotFoundError(
        `Judgment ${input.judgmentId} does not exist`,
      );
    }
    const { contentHash } = computeLedgerContentHash("policy_decision", {
      judgmentId: input.judgmentId,
      policyVersion: input.policyVersion,
      action: input.action,
      gateTrace: input.gateTrace,
      sizing: input.sizing ?? null,
    });
    const existing = this.#policyDecisions.find(
      (decision) =>
        decision.id === input.id || decision.judgmentId === input.judgmentId,
    );
    if (existing !== undefined) {
      if (existing.contentHash === contentHash) return immutableClone(existing);
      throw new LedgerConflictError(
        "An immutable policy decision cannot be replaced",
      );
    }
    const decision = immutableClone({
      ...input,
      contentHash,
      createdAt: this.#createdAt(),
    });
    this.#policyDecisions.push(decision);
    return immutableClone(decision);
  }

  publishForecast(
    input: Omit<Forecast, "createdAt">,
  ): IdempotentResult<Forecast> {
    const replay = this.#forecasts.find(
      (forecast) => forecast.publicationKey === input.publicationKey,
    );
    if (replay !== undefined) {
      const immutablePayload = structuredClone(replay);
      Reflect.deleteProperty(immutablePayload, "createdAt");
      if (!sameCanonical(immutablePayload, input)) {
        throw new LedgerConflictError(
          "A publication key cannot be reused with a different payload",
        );
      }
      return { created: false, value: immutableClone(replay) };
    }
    if (this.#forecasts.some((forecast) => forecast.id === input.id)) {
      throw new LedgerConflictError(`Forecast ID ${input.id} already exists`);
    }
    const snapshot = this.#snapshots.find(
      (entry) => entry.id === input.snapshotId,
    );
    const judgment = this.#judgments.find(
      (entry) => entry.id === input.judgmentId,
    );
    const policyDecision = this.#policyDecisions.find(
      (entry) => entry.id === input.policyDecisionId,
    );
    if (
      snapshot === undefined ||
      judgment === undefined ||
      policyDecision === undefined
    ) {
      throw new LedgerNotFoundError(
        "A forecast requires an existing snapshot, judgment, and policy decision",
      );
    }
    if (
      judgment.snapshotId !== snapshot.id ||
      policyDecision.judgmentId !== judgment.id ||
      snapshot.symbol !== input.symbol ||
      snapshot.cutoffAt !== input.cutoffAt ||
      snapshot.latestMarketSession !== input.latestMarketSession ||
      judgment.modelVersion !== input.modelVersion ||
      judgment.questionVersion !== input.questionVersion ||
      policyDecision.policyVersion !== input.policyVersion
    ) {
      throw new LedgerInvariantError(
        "Forecast dependencies or immutable versions do not match",
      );
    }
    if (
      this.#forecasts.some(
        (forecast) => forecast.judgmentId === input.judgmentId,
      )
    ) {
      throw new LedgerConflictError(
        `Judgment ${input.judgmentId} already has a forecast`,
      );
    }
    if (input.horizonSessions < 1 || !Number.isInteger(input.horizonSessions)) {
      throw new LedgerInvariantError(
        "horizonSessions must be a positive integer",
      );
    }
    const forecast = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#forecasts.push(forecast);
    this.#forecastEvents.push(
      immutableClone({
        id: this.#id("forecast_event"),
        forecastId: forecast.id,
        type: "published" as const,
        createdAt: this.#createdAt(),
      }),
    );
    return { created: true, value: immutableClone(forecast) };
  }

  #appendForecastEvent(
    input: Omit<ForecastEvent, "id" | "createdAt"> & { readonly id?: string },
  ): ForecastEvent {
    if (!this.#forecasts.some((forecast) => forecast.id === input.forecastId)) {
      throw new LedgerInvariantError(
        `Forecast ${input.forecastId} does not exist`,
      );
    }
    if (input.type === "published") {
      throw new LedgerInvariantError(
        "Publication events are created atomically with forecasts",
      );
    }
    const status = rebuildLedgerProjection(this.readAll()).forecastStatusById[
      input.forecastId
    ];
    if (input.type === "resolved" || input.type === "void") {
      if (status !== "published") {
        throw new LedgerInvariantError(
          `Forecast ${input.forecastId} cannot move from ${status} to ${input.type}`,
        );
      }
      assertNonEmpty(input.reason ?? "", "terminal event reason");
    } else {
      if (status !== "resolved" && status !== "void") {
        throw new LedgerInvariantError(
          "Only a terminal forecast can be corrected",
        );
      }
      const referenced = this.#forecastEvents.find(
        (event) => event.id === input.referencesEventId,
      );
      if (referenced?.forecastId !== input.forecastId) {
        throw new LedgerInvariantError(
          "A correction must reference this forecast's event",
        );
      }
      assertNonEmpty(input.reason ?? "", "correction reason");
    }
    const event = immutableClone({
      ...input,
      id: input.id ?? this.#id("forecast_event"),
      createdAt: this.#createdAt(),
    });
    if (this.#forecastEvents.some((entry) => entry.id === event.id)) {
      throw new LedgerConflictError(
        `Forecast event ID ${event.id} already exists`,
      );
    }
    this.#forecastEvents.push(event);
    return immutableClone(event);
  }

  #appendOutcome(input: Omit<ForecastOutcome, "createdAt">): ForecastOutcome {
    if (!this.#forecasts.some((forecast) => forecast.id === input.forecastId)) {
      throw new LedgerInvariantError(
        `Forecast ${input.forecastId} does not exist`,
      );
    }
    if (this.#outcomes.some((outcome) => outcome.id === input.id)) {
      throw new LedgerConflictError(`Outcome ID ${input.id} already exists`);
    }
    if (
      !Number.isFinite(input.adjustedReturn) ||
      (input.brierScore !== undefined &&
        (!Number.isFinite(input.brierScore) || input.brierScore < 0)) ||
      (input.logLoss !== undefined &&
        (!Number.isFinite(input.logLoss) || input.logLoss < 0))
    ) {
      throw new LedgerInvariantError("Outcome scores must be finite and valid");
    }
    if (!/^[a-f0-9]{64}$/.test(input.sourceBarHash)) {
      throw new LedgerInvariantError(
        "Outcome sourceBarHash must be a SHA-256 hex digest",
      );
    }
    const active = rebuildLedgerProjection(this.readAll())
      .activeOutcomeByForecast[input.forecastId];
    if (input.correctionOfOutcomeId === undefined) {
      const status = rebuildLedgerProjection(this.readAll()).forecastStatusById[
        input.forecastId
      ];
      if (status !== "resolved") {
        throw new LedgerInvariantError(
          "A forecast must be resolved before recording an outcome",
        );
      }
      if (active !== undefined) {
        throw new LedgerInvariantError(
          "A second outcome must correct the active outcome",
        );
      }
    } else {
      if (active?.id !== input.correctionOfOutcomeId) {
        throw new LedgerInvariantError(
          "A correction must reference the active outcome",
        );
      }
      assertNonEmpty(input.correctionReason ?? "", "outcome correction reason");
    }
    const outcome = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#outcomes.push(outcome);
    return immutableClone(outcome);
  }

  resolveForecast(input: {
    readonly event: Omit<
      ForecastEvent,
      "createdAt" | "type" | "referencesEventId"
    > & { readonly type: "resolved" };
    readonly outcome: Omit<
      ForecastOutcome,
      "createdAt" | "correctionOfOutcomeId" | "correctionReason"
    >;
  }): IdempotentResult<ForecastResolution> {
    const existingEvent = this.#forecastEvents.find(
      (event) => event.id === input.event.id,
    );
    const existingOutcome = this.#outcomes.find(
      (outcome) => outcome.id === input.outcome.id,
    );
    if (existingEvent !== undefined || existingOutcome !== undefined) {
      if (existingEvent === undefined || existingOutcome === undefined) {
        throw new LedgerConflictError(
          "A forecast resolution cannot be partially replayed",
        );
      }
      const eventPayload = structuredClone(existingEvent);
      const outcomePayload = structuredClone(existingOutcome);
      Reflect.deleteProperty(eventPayload, "createdAt");
      Reflect.deleteProperty(outcomePayload, "createdAt");
      if (
        !sameCanonical(eventPayload, input.event) ||
        !sameCanonical(outcomePayload, input.outcome)
      ) {
        throw new LedgerConflictError(
          "A forecast resolution ID cannot be reused with a different payload",
        );
      }
      return {
        created: false,
        value: immutableClone({
          event: existingEvent,
          outcome: existingOutcome,
        }),
      };
    }

    const eventLength = this.#forecastEvents.length;
    const outcomeLength = this.#outcomes.length;
    try {
      const event = this.#appendForecastEvent(input.event);
      const outcome = this.#appendOutcome(input.outcome);
      return { created: true, value: immutableClone({ event, outcome }) };
    } catch (error) {
      this.#forecastEvents.splice(eventLength);
      this.#outcomes.splice(outcomeLength);
      throw error;
    }
  }

  correctForecastOutcome(input: {
    readonly event: Omit<ForecastEvent, "createdAt" | "type"> & {
      readonly type: "correction";
      readonly referencesEventId: string;
      readonly reason: string;
    };
    readonly outcome: Omit<ForecastOutcome, "createdAt"> & {
      readonly correctionOfOutcomeId: string;
      readonly correctionReason: string;
    };
  }): IdempotentResult<ForecastResolution> {
    const existingEvent = this.#forecastEvents.find(
      (event) => event.id === input.event.id,
    );
    const existingOutcome = this.#outcomes.find(
      (outcome) => outcome.id === input.outcome.id,
    );
    if (existingEvent !== undefined || existingOutcome !== undefined) {
      if (existingEvent === undefined || existingOutcome === undefined) {
        throw new LedgerConflictError(
          "An outcome correction cannot be partially replayed",
        );
      }
      const eventPayload = structuredClone(existingEvent);
      const outcomePayload = structuredClone(existingOutcome);
      Reflect.deleteProperty(eventPayload, "createdAt");
      Reflect.deleteProperty(outcomePayload, "createdAt");
      if (
        !sameCanonical(eventPayload, input.event) ||
        !sameCanonical(outcomePayload, input.outcome)
      ) {
        throw new LedgerConflictError(
          "An outcome correction ID cannot be reused with a different payload",
        );
      }
      return {
        created: false,
        value: immutableClone({
          event: existingEvent,
          outcome: existingOutcome,
        }),
      };
    }

    const eventLength = this.#forecastEvents.length;
    const outcomeLength = this.#outcomes.length;
    try {
      const event = this.#appendForecastEvent(input.event);
      const outcome = this.#appendOutcome(input.outcome);
      return { created: true, value: immutableClone({ event, outcome }) };
    } catch (error) {
      this.#forecastEvents.splice(eventLength);
      this.#outcomes.splice(outcomeLength);
      throw error;
    }
  }

  voidForecast(
    input: Omit<ForecastEvent, "createdAt" | "type" | "referencesEventId"> & {
      readonly type: "void";
    },
  ): IdempotentResult<ForecastEvent> {
    const existing = this.#forecastEvents.find(
      (event) => event.id === input.id,
    );
    if (existing !== undefined) {
      const payload = structuredClone(existing);
      Reflect.deleteProperty(payload, "createdAt");
      if (!sameCanonical(payload, input)) {
        throw new LedgerConflictError(
          "A void event ID cannot be reused with a different payload",
        );
      }
      return { created: false, value: immutableClone(existing) };
    }
    return { created: true, value: this.#appendForecastEvent(input) };
  }

  appendPaperEvent(input: Omit<PaperEvent, "createdAt">): PaperEvent {
    if (this.#paperEvents.some((event) => event.id === input.id)) {
      throw new LedgerConflictError(
        `Paper event ID ${input.id} already exists`,
      );
    }
    if (
      !Number.isFinite(input.cashDelta) ||
      !Number.isFinite(input.sharesDelta) ||
      (input.price !== undefined &&
        (!Number.isFinite(input.price) || input.price <= 0))
    ) {
      throw new LedgerInvariantError("Paper event deltas must be finite");
    }
    if (input.sharesDelta !== 0 && input.symbol === undefined) {
      throw new LedgerInvariantError("A share delta requires a symbol");
    }
    if (
      (input.type === "correction") !==
      (input.correctionOfEventId !== undefined)
    ) {
      throw new LedgerInvariantError(
        "Only a correction event may reference another paper event",
      );
    }
    if (input.type === "correction") {
      assertNonEmpty(input.reason ?? "", "paper correction reason");
    }
    if (
      input.correctionOfEventId !== undefined &&
      !this.#paperEvents.some((event) => event.id === input.correctionOfEventId)
    ) {
      throw new LedgerInvariantError(
        "A paper event reference must already exist",
      );
    }
    const event = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#paperEvents.push(event);
    return immutableClone(event);
  }

  recordJobAttempt(
    input: Omit<JobAttempt, "createdAt">,
  ): IdempotentResult<JobAttempt> {
    if (input.attemptNumber < 1 || !Number.isInteger(input.attemptNumber)) {
      throw new LedgerInvariantError(
        "attemptNumber must be a positive integer",
      );
    }
    const existing = this.#jobAttempts.find(
      (attempt) =>
        attempt.id === input.id ||
        (attempt.operationKey === input.operationKey &&
          attempt.attemptNumber === input.attemptNumber),
    );
    if (existing !== undefined) {
      const payload = structuredClone(existing);
      Reflect.deleteProperty(payload, "createdAt");
      if (!sameCanonical(payload, input)) {
        throw new LedgerConflictError(
          "A job attempt key cannot be reused with a different payload",
        );
      }
      return { created: false, value: immutableClone(existing) };
    }
    if (input.terminalStatus === "failed" && input.errorCode === undefined) {
      throw new LedgerInvariantError("A failed attempt requires an errorCode");
    }
    const previous = this.#jobAttempts
      .filter((attempt) => attempt.operationKey === input.operationKey)
      .at(-1);
    if (previous === undefined && input.attemptNumber !== 1) {
      throw new LedgerInvariantError("The first job attempt must be attempt 1");
    }
    if (previous?.terminalStatus === "succeeded") {
      throw new LedgerInvariantError("A succeeded operation cannot be retried");
    }
    if (
      previous !== undefined &&
      input.attemptNumber !== previous.attemptNumber + 1
    ) {
      throw new LedgerInvariantError(
        "Retry attempt numbers must be contiguous",
      );
    }
    const attempt = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#jobAttempts.push(attempt);
    return { created: true, value: immutableClone(attempt) };
  }

  #identifier(
    kind: PrivateIdentifier["kind"],
    token: string,
    scope: string,
    recordId: string,
    expiresAt: string,
  ) {
    assertNonEmpty(token, "browser token");
    assertTimestamp(expiresAt, "identifier.expiresAt");
    const createdAt = this.#createdAt();
    const requestedExpiry = Date.parse(expiresAt);
    const createdAtMillis = Date.parse(createdAt);
    if (requestedExpiry <= createdAtMillis) {
      throw new LedgerInvariantError(
        "A private identifier expiry must be after its creation time",
      );
    }
    const maximumExpiry = createdAtMillis + 30 * 24 * 60 * 60 * 1_000;
    const cappedExpiry = new Date(
      Math.min(requestedExpiry, maximumExpiry),
    ).toISOString();
    const digest = sha256Text(token);
    const existing = this.#privateIdentifiers.find(
      (identifier) =>
        identifier.kind === kind &&
        identifier.digest === digest &&
        identifier.scope === scope,
    );
    if (existing !== undefined) return existing;
    const identifier = immutableClone({
      id: this.#id("identifier"),
      kind,
      digest,
      scope,
      recordId,
      expiresAt: cappedExpiry,
      createdAt,
    });
    this.#privateIdentifiers.push(identifier);
    return identifier;
  }

  recordVisitorPick(input: {
    readonly id: string;
    readonly forecastId: string;
    readonly visitorToken: string;
    readonly choice: VisitorPick["choice"];
    readonly expiresAt: string;
  }): IdempotentResult<VisitorPick> {
    if (!this.#forecasts.some((forecast) => forecast.id === input.forecastId)) {
      throw new LedgerNotFoundError(
        `Forecast ${input.forecastId} does not exist`,
      );
    }
    const identifier = this.#identifier(
      "visitor_pick",
      input.visitorToken,
      input.forecastId,
      input.id,
      input.expiresAt,
    );
    const existing = this.#visitorPicks.find(
      (pick) => pick.id === identifier.recordId,
    );
    if (existing !== undefined)
      return { created: false, value: immutableClone(existing) };
    if (this.#visitorPicks.some((pick) => pick.id === input.id)) {
      throw new LedgerConflictError(
        `Visitor-pick ID ${input.id} already exists`,
      );
    }
    const pick = immutableClone({
      id: input.id,
      forecastId: input.forecastId,
      choice: input.choice,
      createdAt: this.#createdAt(),
    });
    this.#visitorPicks.push(pick);
    return { created: true, value: immutableClone(pick) };
  }

  recordAnalyticsEvent(input: {
    readonly id: string;
    readonly event: AnalyticsEvent["event"];
    readonly consent: boolean;
    readonly browserToken: string;
    readonly expiresAt: string;
    readonly symbol?: string;
    readonly forecastId?: string;
  }): AnalyticsEvent | null {
    if (!input.consent) return null;
    if (this.#analyticsEvents.some((event) => event.id === input.id)) {
      throw new LedgerConflictError(
        `Analytics event ID ${input.id} already exists`,
      );
    }
    this.#identifier(
      "analytics",
      input.browserToken,
      input.id,
      input.id,
      input.expiresAt,
    );
    const event = immutableClone({
      id: input.id,
      event: input.event,
      symbol: input.symbol,
      forecastId: input.forecastId,
      createdAt: this.#createdAt(),
    });
    this.#analyticsEvents.push(event);
    return immutableClone(event);
  }

  purgeExpiredIdentifiers(at: string): { readonly purged: number } {
    assertTimestamp(at, "purge time");
    const cutoff = Date.parse(at);
    const before = this.#privateIdentifiers.length;
    for (
      let index = this.#privateIdentifiers.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (Date.parse(this.#privateIdentifiers[index]!.expiresAt) <= cutoff) {
        this.#privateIdentifiers.splice(index, 1);
      }
    }
    return { purged: before - this.#privateIdentifiers.length };
  }

  analyticsAggregate(): Readonly<
    Partial<Record<AnalyticsEvent["event"], number>>
  > {
    const aggregate: Partial<Record<AnalyticsEvent["event"], number>> = {};
    for (const event of this.#analyticsEvents) {
      aggregate[event.event] = (aggregate[event.event] ?? 0) + 1;
    }
    return immutableClone(aggregate);
  }

  appendProviderRights(
    input: Omit<ProviderRights, "createdAt">,
  ): ProviderRights {
    if (this.#providerRights.some((record) => record.id === input.id)) {
      throw new LedgerConflictError(
        `Provider-rights ID ${input.id} already exists`,
      );
    }
    assertTimestamp(input.effectiveFrom, "provider rights effectiveFrom");
    if (input.effectiveTo !== undefined) {
      assertTimestamp(input.effectiveTo, "provider rights effectiveTo");
    }
    const record = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#providerRights.push(record);
    return immutableClone(record);
  }

  appendProcessorTerms(
    input: Omit<ProcessorTerms, "createdAt">,
  ): ProcessorTerms {
    if (this.#processorTerms.some((record) => record.id === input.id)) {
      throw new LedgerConflictError(
        `Processor-terms ID ${input.id} already exists`,
      );
    }
    assertTimestamp(input.effectiveFrom, "processor terms effectiveFrom");
    if (input.effectiveTo !== undefined) {
      assertTimestamp(input.effectiveTo, "processor terms effectiveTo");
    }
    const record = immutableClone({ ...input, createdAt: this.#createdAt() });
    this.#processorTerms.push(record);
    return immutableClone(record);
  }

  publicModeGate(requirements: PublicModeRequirements) {
    return evaluatePublicModeGate({
      requirements,
      providerRights: this.#providerRights,
      processorTerms: this.#processorTerms,
    });
  }

  projection() {
    return immutableClone(rebuildLedgerProjection(this.readAll()));
  }

  inspectPrivateIdentifiers(): readonly PrivateIdentifier[] {
    return immutableClone(this.#privateIdentifiers);
  }

  readAll(): LedgerState {
    return immutableClone({
      snapshots: this.#snapshots,
      judgments: this.#judgments,
      policyDecisions: this.#policyDecisions,
      forecasts: this.#forecasts,
      forecastEvents: this.#forecastEvents,
      outcomes: this.#outcomes,
      paperEvents: this.#paperEvents,
      jobAttempts: this.#jobAttempts,
      visitorPicks: this.#visitorPicks,
      analyticsEvents: this.#analyticsEvents,
      providerRights: this.#providerRights,
      processorTerms: this.#processorTerms,
    });
  }
}
