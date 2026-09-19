import { sha256Canonical, sha256Text } from "@/modules/ledger/canonical-json";
import type {
  Direction,
  JudgmentAnswers,
  ScoreAnswer,
} from "@/modules/judgment/contracts";
import type { PaperEvent } from "@/modules/ledger/types";
import {
  POLICY_V1,
  computeMarketRisk,
  createPolicyEngine,
  evaluatePosition,
  evaluateSprint,
  type MarketRiskInputs,
  type MarketRiskResult,
} from "@/modules/policy";
import { projectPaperPortfolio } from "@/modules/portfolio";

import type {
  DisplayState,
  BlindStockPageView,
  FixturePolicyInputView,
  ForecastView,
  MarketRiskView,
  PortfolioView,
  ScorecardView,
  StockSummaryView,
} from "./types";

export const FIXTURE_SOURCE_MANIFEST_VERSION =
  "jev-fixture-source-manifest/v1" as const;
export const FIXTURE_DECISION_STATE_VERSION =
  "jev-fixture-decision-state/v1" as const;
export const FIXTURE_JUDGMENT_INPUT_VERSION =
  "jev-fixture-judgment-input/v1" as const;

const FIXTURE_POLICY_V1 = createPolicyEngine({
  ...POLICY_V1,
  version: "paper-policy-v1",
});

export interface FixtureSourceReference {
  readonly sourceId: string;
  readonly sourceRevision: "synthetic-fixture-v1";
  readonly sourceHash: string;
  readonly availableAt: string;
}

export interface FixtureSourceManifest {
  readonly version: typeof FIXTURE_SOURCE_MANIFEST_VERSION;
  readonly dataClass: "synthetic_fixture";
  readonly forecastId: string;
  readonly references: readonly FixtureSourceReference[];
}

function chart(
  base: number,
  drift: number,
  wobble: number,
  latestMarketSession: string,
) {
  const sessions = weekdaySessionsEnding(23, latestMarketSession);
  return sessions.map((session, index) => ({
    session,
    close: Number(
      (base + drift * index + Math.sin(index * 1.43) * wobble).toFixed(2),
    ),
    volume: Math.round(820_000 + index * 18_500 + (index % 4) * 67_000),
  }));
}

function weekdaySessionsEnding(count: number, finalSession: string): string[] {
  const sessions: string[] = [];
  const cursor = new Date(`${finalSession}T12:00:00.000Z`);
  while (sessions.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6)
      sessions.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return sessions.reverse();
}

function sourceReference(
  sourceId: string,
  availableAt: string,
): FixtureSourceReference {
  const sourceRevision = "synthetic-fixture-v1" as const;
  return {
    sourceId,
    sourceRevision,
    sourceHash: sha256Text(`${sourceId}|${sourceRevision}|${availableAt}`),
    availableAt,
  };
}

export function buildFixtureSourceManifest(
  forecast: Pick<
    ForecastView,
    "id" | "symbol" | "latestMarketSession" | "cutoffAt"
  >,
): FixtureSourceManifest {
  const sessions = weekdaySessionsEnding(300, forecast.latestMarketSession);
  const barReferences = sessions.flatMap((session) => [
    sourceReference(
      `fixture:bar:${forecast.symbol}:${session}`,
      `${session}T20:00:00.000Z`,
    ),
    sourceReference(
      `fixture:benchmark:BENCH:${session}`,
      `${session}T20:00:00.000Z`,
    ),
  ]);
  return {
    version: FIXTURE_SOURCE_MANIFEST_VERSION,
    dataClass: "synthetic_fixture",
    forecastId: forecast.id,
    references: [
      ...barReferences,
      sourceReference(
        `fixture:calendar:XNAS:${forecast.latestMarketSession}`,
        `${forecast.latestMarketSession}T19:45:00.000Z`,
      ),
      sourceReference(
        `fixture:events:${forecast.symbol}:${forecast.latestMarketSession}`,
        `${forecast.latestMarketSession}T19:45:00.000Z`,
      ),
    ],
  };
}

export function buildFixtureDecisionState(
  forecast: Pick<
    ForecastView,
    | "id"
    | "symbol"
    | "mode"
    | "horizonSessions"
    | "neutralBandPercent"
    | "cutoffAt"
    | "latestMarketSession"
    | "price"
    | "sessionChangePercent"
    | "chart"
    | "evidence"
    | "marketRisk"
    | "sourceManifestHash"
  >,
) {
  return {
    version: FIXTURE_DECISION_STATE_VERSION,
    dataClass: "synthetic_fixture" as const,
    forecastId: forecast.id,
    symbol: forecast.symbol,
    mode: forecast.mode,
    horizonSessions: forecast.horizonSessions,
    neutralBandPercent: forecast.neutralBandPercent,
    cutoffAt: forecast.cutoffAt,
    latestMarketSession: forecast.latestMarketSession,
    price: forecast.price,
    sessionChangePercent: forecast.sessionChangePercent,
    chart: forecast.chart,
    evidence: forecast.evidence,
    marketRisk: forecast.marketRisk,
    sourceManifestHash: forecast.sourceManifestHash,
  };
}

export function rebuildFixtureDecisionStateHash(
  forecast: Parameters<typeof buildFixtureDecisionState>[0],
): string {
  return `sha256:${sha256Canonical(buildFixtureDecisionState(forecast))}`;
}

export function buildFixtureJudgmentInput(
  forecast: Pick<
    ForecastView,
    | "modelVersion"
    | "questionVersion"
    | "decisionStateHash"
    | "mode"
    | "horizonSessions"
    | "neutralBandPercent"
  >,
) {
  return {
    version: FIXTURE_JUDGMENT_INPUT_VERSION,
    dataClass: "synthetic_fixture" as const,
    requestedModel: "typesafe/jev-1.13" as const,
    resolvedModel: forecast.modelVersion,
    questionVersion: forecast.questionVersion,
    decisionStateHash: forecast.decisionStateHash,
    strategyMode: forecast.mode,
    horizonSessions: forecast.horizonSessions,
    neutralBandPercent: forecast.neutralBandPercent,
  };
}

export function rebuildFixtureJudgmentInputHash(
  forecast: Parameters<typeof buildFixtureJudgmentInput>[0],
): string {
  return `sha256:${sha256Canonical(buildFixtureJudgmentInput(forecast))}`;
}

export function rebuildFixturePolicyDecision(
  forecast: Pick<ForecastView, "policyInput">,
) {
  const input = forecast.policyInput;
  if (!input) return null;
  return input.kind === "sprint"
    ? evaluateSprint(FIXTURE_POLICY_V1, {
        judgment: input.judgment,
        dataQuality: input.dataQuality,
      })
    : evaluatePosition(FIXTURE_POLICY_V1, {
        judgment: input.judgment,
        dataQuality: input.dataQuality,
        marketRisk: input.marketRisk,
        sizing: input.sizing,
        position: input.position,
      });
}

export function deriveFixturePolicyAction(
  forecast: Pick<ForecastView, "policyInput">,
): ForecastView["action"] {
  return rebuildFixturePolicyDecision(forecast)?.action ?? null;
}

function validateTimeline(forecast: ForecastView): void {
  const times = forecast.timeline.map(({ at }) => Date.parse(at));
  if (
    times.some((time) => !Number.isFinite(time)) ||
    times.some((time, index) => index > 0 && time < times[index - 1]!)
  ) {
    throw new Error(`fixture ${forecast.id} lifecycle is not chronological`);
  }
  const publicationAt = forecast.timeline.find(
    ({ kind }) => kind === "forecast_published",
  )?.at;
  const shouldBePublished = forecast.forecastStatus !== "NOT_PUBLISHED";
  if (shouldBePublished !== Boolean(publicationAt)) {
    throw new Error(
      `fixture ${forecast.id} publication event does not match its status`,
    );
  }
  for (const terminalKind of [
    "outcome_resolved",
    "forecast_voided",
    "outcome_corrected",
  ] as const) {
    const terminalAt = forecast.timeline.find(
      ({ kind }) => kind === terminalKind,
    )?.at;
    if (terminalAt && (!publicationAt || terminalAt <= publicationAt)) {
      throw new Error(
        `fixture ${forecast.id} ${terminalKind} precedes publication`,
      );
    }
  }
  if (
    forecast.outcome &&
    !forecast.timeline.some(
      ({ kind, at }) =>
        kind === "outcome_resolved" && at === forecast.outcome?.resolvedAt,
    )
  ) {
    throw new Error(`fixture ${forecast.id} has no matching outcome event`);
  }
  if (
    forecast.correction &&
    !forecast.timeline.some(
      ({ kind, at }) =>
        kind === "outcome_corrected" && at === forecast.correction?.at,
    )
  ) {
    throw new Error(`fixture ${forecast.id} has no matching correction event`);
  }
  if (
    forecast.voidReason &&
    !forecast.timeline.some(({ kind }) => kind === "forecast_voided")
  ) {
    throw new Error(`fixture ${forecast.id} has no matching void event`);
  }
}

function finalizeFixtureForecast(forecast: ForecastView): ForecastView {
  const sourceManifest = buildFixtureSourceManifest(forecast);
  const withManifest: ForecastView = {
    ...forecast,
    sourceManifestHash: sha256Canonical(sourceManifest),
    sourceReferenceCount: sourceManifest.references.length,
  };
  const withState: ForecastView = {
    ...withManifest,
    decisionStateHash: rebuildFixtureDecisionStateHash(withManifest),
  };
  const finalized: ForecastView = {
    ...withState,
    judgmentInputHash:
      withState.displayState === "incomplete"
        ? null
        : rebuildFixtureJudgmentInputHash(withState),
  };
  const rebuilt = rebuildFixturePolicyDecision(finalized);
  if (
    (rebuilt?.action ?? null) !== finalized.action ||
    sha256Canonical(rebuilt?.gates ?? []) !== sha256Canonical(finalized.gates)
  ) {
    throw new Error(
      `fixture ${finalized.id} policy record does not match ${FIXTURE_POLICY_V1.version}`,
    );
  }
  if (!rebuilt && (finalized.action !== null || finalized.gates.length > 0)) {
    throw new Error(
      `fixture ${finalized.id} has output without a policy input`,
    );
  }
  const componentIndex = Math.round(
    finalized.marketRisk.components.reduce(
      (total, component) => total + (component.value * component.weight) / 100,
      0,
    ),
  );
  const policyMarketRisk =
    finalized.policyInput?.kind === "position"
      ? finalized.policyInput.marketRisk
      : null;
  if (
    componentIndex !== finalized.marketRisk.index ||
    (policyMarketRisk !== null &&
      (policyMarketRisk.index !== finalized.marketRisk.index ||
        policyMarketRisk.band !== finalized.marketRisk.band))
  ) {
    throw new Error(`fixture ${finalized.id} market-risk records do not agree`);
  }
  validateTimeline(finalized);
  return finalized;
}

function marketRiskView(
  inputs: Readonly<MarketRiskInputs>,
  result: MarketRiskResult,
): MarketRiskView {
  return {
    inputs,
    index: result.index,
    band: result.band,
    formulaVersion: result.formulaVersion,
    components: [
      {
        label: "Volatility percentile",
        value: (result.components.volatility / 35) * 100,
        weight: 35,
      },
      {
        label: "Drawdown severity",
        value: (result.components.drawdown / 20) * 100,
        weight: 20,
      },
      {
        label: "Normalized ATR",
        value: (result.components.normalizedAtr / 20) * 100,
        weight: 20,
      },
      {
        label: "Gap risk",
        value: (result.components.gap / 10) * 100,
        weight: 10,
      },
      {
        label: "Known event proximity",
        value: (result.components.eventProximity / 15) * 100,
        weight: 15,
      },
    ],
  };
}

const SCORE_LEGEND = {
  "0": "Absent",
  "1": "Weak",
  "2": "Adequate",
  "3": "Strong",
} as const;

function scoreAnswer(score: number, confidence = 0.75): ScoreAnswer {
  const lower = Math.floor(score);
  const upper = Math.ceil(score);
  const probabilities: Record<"0" | "1" | "2" | "3", number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
  };
  probabilities[String(lower) as keyof typeof probabilities] =
    lower === upper ? 1 : upper - score;
  if (upper !== lower) {
    probabilities[String(upper) as keyof typeof probabilities] = score - lower;
  }
  return {
    type: "score",
    score,
    confidence,
    legend: SCORE_LEGEND,
    probabilities,
  };
}

function judgmentAnswers(input: {
  choice: Direction;
  probabilities: Readonly<Record<Direction, number>>;
  confidence: number;
  risk: number;
}): JudgmentAnswers {
  const setupQuality =
    input.choice === "up" ? 2.6 : input.choice === "flat" ? 1.7 : 1.2;
  const downsideHazard = input.risk >= 65 ? 2.6 : input.risk >= 35 ? 1.5 : 0.8;
  return {
    direction: {
      type: "choice",
      choice: input.choice,
      probabilities: input.probabilities,
      confidence: input.confidence,
    },
    setup_quality: scoreAnswer(setupQuality),
    downside_hazard: scoreAnswer(downsideHazard),
    evidence_sufficiency: scoreAnswer(2.7),
  };
}

function viewJudgment(
  answers: JudgmentAnswers,
): NonNullable<ForecastView["judgment"]> {
  return {
    choice: answers.direction.choice,
    probabilities: answers.direction.probabilities,
    confidence: answers.direction.confidence,
    confidenceLabel:
      answers.direction.confidence < 0.5
        ? "LOW"
        : answers.direction.confidence < 0.75
          ? "MEDIUM"
          : "HIGH",
    setupQuality: answers.setup_quality.score,
    downsideHazard: answers.downside_hazard.score,
    evidenceSufficiency: answers.evidence_sufficiency.score,
  };
}

function after(iso: string, milliseconds: number): string {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function baseForecast(input: {
  id: string;
  symbol: string;
  company: string;
  mode: ForecastView["mode"];
  horizon: ForecastView["horizonSessions"];
  state: DisplayState;
  status?: ForecastView["forecastStatus"];
  action: ForecastView["action"];
  choice?: "up" | "flat" | "down";
  probabilities?: Readonly<Record<"up" | "flat" | "down", number>>;
  confidence?: number;
  marketRiskInputs: Readonly<MarketRiskInputs>;
  price: number;
  change: number;
  base: number;
  drift: number;
  wobble: number;
  pickEligible?: boolean;
  stateMessage: string;
  sourceFreshness?: string;
  cutoffAt?: string;
  latestMarketSession?: string;
  position?: Extract<FixturePolicyInputView, { kind: "position" }>["position"];
}): ForecastView {
  const cutoffAt = input.cutoffAt ?? "2026-09-18T20:15:00.000Z";
  const latestMarketSession = input.latestMarketSession ?? "2026-09-18";
  const marketRiskResult = computeMarketRisk(input.marketRiskInputs);
  const marketRisk = marketRiskView(input.marketRiskInputs, marketRiskResult);
  const positionEntry = Number((input.price * 0.974).toFixed(2));
  const positionStop = Number((input.price * 0.922).toFixed(2));
  const positionShares = 118;
  const maximumPlannedLoss = Number(
    ((positionEntry - positionStop) * positionShares).toFixed(2),
  );
  const hasDecision = input.state !== "incomplete" && input.state !== "failed";
  const answers = hasDecision
    ? judgmentAnswers({
        choice: input.choice!,
        probabilities: input.probabilities!,
        confidence: input.confidence!,
        risk: marketRiskResult.index,
      })
    : null;
  const dataQuality = {
    valid: true,
    fresh: input.state !== "stale",
  } as const;
  const policyInput: FixturePolicyInputView | null = answers
    ? input.mode === "SPRINT"
      ? { kind: "sprint", judgment: answers, dataQuality }
      : {
          kind: "position",
          judgment: answers,
          dataQuality,
          marketRisk: {
            index: marketRiskResult.index,
            band: marketRiskResult.band,
          },
          sizing: {
            valid: true,
            shares: positionShares,
            plannedLoss: maximumPlannedLoss,
            notional: Number((positionShares * positionEntry).toFixed(2)),
          },
          position: input.position ?? null,
        }
    : null;
  const policyDecision = rebuildFixturePolicyDecision({ policyInput });
  if ((policyDecision?.action ?? null) !== input.action) {
    throw new Error(
      `fixture ${input.id} expected ${String(input.action)} but policy produced ${String(policyDecision?.action ?? null)}`,
    );
  }
  const commonTimeline: ForecastView["timeline"] = [
    {
      kind: "source_ready",
      at: `${latestMarketSession}T20:00:00.000Z`,
      label: "Fixture session closed",
      detail: "Synthetic OHLCV inputs became available.",
      tone: "neutral",
    },
  ];
  const timeline: ForecastView["timeline"] =
    input.state === "incomplete"
      ? [
          ...commonTimeline,
          {
            kind: "data_incomplete",
            at: cutoffAt,
            label: "Data validation failed",
            detail:
              "Required structured event coverage was missing. Jev and policy were not run.",
            tone: "warning",
          },
        ]
      : input.state === "failed"
        ? [
            ...commonTimeline,
            {
              kind: "state_frozen",
              at: cutoffAt,
              label: "State frozen",
              detail: "Canonical fixture state and source hashes were fixed.",
              tone: "neutral",
            },
            {
              kind: "judgment_failed",
              at: after(cutoffAt, 62_000),
              label: "Judgment validation failed",
              detail:
                "No Jev answer, policy action, or forecast publication was recorded.",
              tone: "danger",
            },
          ]
        : [
            ...commonTimeline,
            {
              kind: "state_frozen",
              at: cutoffAt,
              label: "State frozen",
              detail: "Canonical fixture state and source hashes were fixed.",
              tone: "neutral",
            },
            {
              kind: "judgment_recorded",
              at: after(cutoffAt, 62_000),
              label: "Jev judgment recorded",
              detail: "Typed response validated against jev-questions-v1.",
              tone: "positive",
            },
            {
              kind: "policy_applied",
              at: after(cutoffAt, 63_000),
              label: "Policy applied",
              detail: `paper-policy-v1 produced ${policyDecision!.action}.`,
              tone:
                policyDecision!.action === "WAIT" ||
                policyDecision!.action === "PASS"
                  ? "warning"
                  : "positive",
            },
            {
              kind: "forecast_published",
              at: after(cutoffAt, 64_000),
              label: "Forecast published",
              detail: "The immutable synthetic forecast became public.",
              tone: "positive",
            },
          ];
  return finalizeFixtureForecast({
    id: input.id,
    symbol: input.symbol,
    company: input.company,
    mode: input.mode,
    horizonSessions: input.horizon,
    neutralBandPercent:
      input.mode === "POSITION" ? 2 : input.horizon === 1 ? 0.5 : 1.5,
    cutoffAt,
    latestMarketSession,
    modelVersion: "typesafe/jev-1.13-20260917",
    questionVersion: "jev-questions-v1",
    policyVersion: "paper-policy-v1",
    methodologyVersion: "methodology-v1.0",
    decisionStateHash: "sha256:pending",
    judgmentInputHash: "sha256:pending",
    sourceManifestHash: "pending",
    sourceReferenceCount: 0,
    sourceFreshness:
      input.sourceFreshness ??
      "Fixture snapshot completed 15 minutes before cutoff",
    displayState: input.state,
    forecastStatus:
      input.status ?? (hasDecision ? "PUBLISHED" : "NOT_PUBLISHED"),
    prospectiveStatus: "FIXTURE — NOT SCORED",
    action: input.action,
    price: input.price,
    sessionChangePercent: input.change,
    judgment: answers ? viewJudgment(answers) : null,
    policyInput,
    marketRisk,
    positionRisk:
      input.mode === "POSITION" && policyDecision?.action === "HOLD"
        ? {
            kind: "active",
            entry: positionEntry,
            stop: positionStop,
            shares: positionShares,
            capitalAtRisk: maximumPlannedLoss,
            maximumPlannedLoss,
            notional: Number((positionShares * positionEntry).toFixed(2)),
            currentPaperPnl: Number(
              ((input.price - positionEntry) * positionShares).toFixed(2),
            ),
            equity: 100_686.06,
            formulaVersion: "position-risk-v1",
            assumptions:
              "1% equity risk cap · 20% notional cap · 10 bps adverse fill per side",
          }
        : {
            kind: "not_applicable",
            reason:
              input.mode === "SPRINT"
                ? "Sprint forecasts score direction only and never open a paper position."
                : !policyDecision
                  ? "No paper position exists because this attempt never produced a publishable decision."
                  : policyDecision.action === "WAIT"
                    ? "No paper position opened because paper-policy-v1 returned WAIT."
                    : "This fixture has no open paper position; realized paper results are shown in the outcome record.",
            maximumPlannedLoss: 0,
          },
    chart: chart(input.base, input.drift, input.wobble, latestMarketSession),
    evidence: [
      {
        label: "20-session return",
        value: input.drift > 0 ? "+6.8% · rising" : "−4.1% · falling",
      },
      {
        label: "Price vs 50-session average",
        value: input.drift > 0 ? "+3.2% above" : "−2.7% below",
      },
      { label: "RSI (14)", value: input.drift > 0 ? "61 · firm" : "39 · weak" },
      {
        label: "Relative strength vs fixture benchmark",
        value: input.drift > 0 ? "+2.1% / 20 sessions" : "−3.4% / 20 sessions",
      },
      {
        label: "Known structured event",
        value: formatFixtureKnownEventEvidence(
          input.marketRiskInputs.sessionsToKnownEvent,
        ),
      },
      {
        label: "Missing-data flags",
        value:
          input.state === "incomplete" ? "Event calendar incomplete" : "None",
      },
    ],
    gates: policyDecision?.gates ?? [],
    timeline,
    pickEligible: input.pickEligible ?? false,
    stateMessage: input.stateMessage,
  });
}

const currentAcme = baseForecast({
  id: "01K5D3JEVACME5SPRINT0001",
  symbol: "ACME",
  company: "Acme Systems (fictional)",
  mode: "SPRINT",
  horizon: 5,
  state: "current",
  action: "UP",
  choice: "up",
  probabilities: { up: 0.62, flat: 0.23, down: 0.15 },
  confidence: 0.78,
  marketRiskInputs: {
    volatilityPercentile: 0.6,
    drawdown60: -0.08,
    normalizedAtr14: 0.025,
    gapRiskPercentile: 0.6,
    sessionsToKnownEvent: 8,
  },
  price: 116.42,
  change: 1.26,
  base: 106,
  drift: 0.47,
  wobble: 1.15,
  pickEligible: true,
  stateMessage:
    "Current synthetic fixture judgment. Frozen before its five-session evaluation window.",
});

const novaEntryForecast = baseForecast({
  id: "01K5D3JEVNOVA20ENTRY001",
  symbol: "NOVA",
  company: "Nova Fabrication (fictional)",
  mode: "POSITION",
  horizon: 20,
  state: "current",
  action: "ENTER",
  choice: "up",
  probabilities: { up: 0.64, flat: 0.22, down: 0.14 },
  confidence: 0.79,
  marketRiskInputs: {
    volatilityPercentile: 0.4,
    drawdown60: -0.06,
    normalizedAtr14: 0.02,
    gapRiskPercentile: 0.6,
    sessionsToKnownEvent: 8,
  },
  price: 148.72,
  change: 0.38,
  base: 137,
  drift: 0.54,
  wobble: 1.42,
  cutoffAt: "2026-09-14T20:15:00.000Z",
  latestMarketSession: "2026-09-14",
  stateMessage:
    "Frozen pre-entry synthetic forecast. The next eligible session produced the paper entry.",
});

const currentNova = baseForecast({
  id: "01K5D3JEVNOVA20POS00001",
  symbol: "NOVA",
  company: "Nova Fabrication (fictional)",
  mode: "POSITION",
  horizon: 20,
  state: "current",
  action: "HOLD",
  choice: "up",
  probabilities: { up: 0.57, flat: 0.28, down: 0.15 },
  confidence: 0.73,
  marketRiskInputs: {
    volatilityPercentile: 0.4,
    drawdown60: -0.08,
    normalizedAtr14: 0.025,
    gapRiskPercentile: 0.4,
    sessionsToKnownEvent: 8,
  },
  price: 148.72,
  change: 0.64,
  base: 137,
  drift: 0.54,
  wobble: 1.42,
  position: {
    stopPrice: 137.12,
    completedSessionLow: 145.06,
    eligibleSessionsHeld: 4,
    horizonSessions: 20,
    consecutiveHoldFailures: 0,
  },
  stateMessage:
    "Open synthetic paper position. Deterministic stop and horizon checks remain active.",
});

const resolvedMesaBase = baseForecast({
  id: "01K4MESA1SPRINTRES00001",
  symbol: "MESA",
  company: "Mesa Robotics (fictional)",
  mode: "SPRINT",
  horizon: 1,
  state: "resolved",
  status: "RESOLVED",
  action: "FLAT",
  choice: "flat",
  probabilities: { up: 0.24, flat: 0.56, down: 0.2 },
  confidence: 0.76,
  marketRiskInputs: {
    volatilityPercentile: 0.4,
    drawdown60: -0.05,
    normalizedAtr14: 0.02,
    gapRiskPercentile: 0.5,
    sessionsToKnownEvent: 8,
  },
  price: 82.15,
  change: 0.12,
  base: 79,
  drift: 0.13,
  wobble: 0.64,
  cutoffAt: "2026-09-15T20:15:00.000Z",
  latestMarketSession: "2026-09-15",
  stateMessage:
    "Resolved synthetic fixture. Outcome uses the frozen one-session close.",
});
const resolvedMesa: ForecastView = finalizeFixtureForecast({
  ...resolvedMesaBase,
  outcome: {
    label: "flat",
    adjustedReturnPercent: 0.31,
    resolvedAt: "2026-09-16T20:20:00.000Z",
  },
  timeline: [
    ...resolvedMesaBase.timeline,
    {
      kind: "outcome_resolved",
      at: "2026-09-16T20:20:00.000Z",
      label: "Outcome resolved",
      detail: "+0.31% fell inside the inclusive ±0.5% flat band.",
      tone: "positive",
    },
  ],
});

const staleOrbit = baseForecast({
  id: "01K3ORBT5SPRINTSTALE001",
  symbol: "ORBT",
  company: "Orbit Networks (fictional)",
  mode: "SPRINT",
  horizon: 5,
  state: "stale",
  action: "PASS",
  choice: "down",
  probabilities: { up: 0.18, flat: 0.26, down: 0.56 },
  confidence: 0.66,
  marketRiskInputs: {
    volatilityPercentile: 0.8,
    drawdown60: -0.12,
    normalizedAtr14: 0.035,
    gapRiskPercentile: 0.7,
    sessionsToKnownEvent: 2,
  },
  price: 64.28,
  change: -2.41,
  base: 76,
  drift: -0.48,
  wobble: 1.2,
  sourceFreshness: "STALE — last synthetic fixture session is 3 sessions old",
  stateMessage:
    "Stale historical fixture only. Current-action styling and visitor picks are suppressed.",
});

const incompleteHeli = baseForecast({
  id: "01K3HELI20POSINCOMP0001",
  symbol: "HELI",
  company: "Helio Materials (fictional)",
  mode: "POSITION",
  horizon: 20,
  state: "incomplete",
  action: null,
  marketRiskInputs: {
    volatilityPercentile: 0.6,
    drawdown60: -0.1,
    normalizedAtr14: 0.035,
    gapRiskPercentile: 0.8,
    sessionsToKnownEvent: 3,
  },
  price: 42.8,
  change: -0.22,
  base: 44,
  drift: -0.04,
  wobble: 0.72,
  stateMessage:
    "Incomplete fixture. Structured event coverage is missing, so no Jev judgment, policy action, or forecast was published.",
});

const failedKite = baseForecast({
  id: "01K3KITE1SPRINTFAIL0001",
  symbol: "KITE",
  company: "Kite Mobility (fictional)",
  mode: "SPRINT",
  horizon: 1,
  state: "failed",
  action: null,
  marketRiskInputs: {
    volatilityPercentile: 0.6,
    drawdown60: -0.08,
    normalizedAtr14: 0.025,
    gapRiskPercentile: 0.5,
    sessionsToKnownEvent: 3,
  },
  price: 91.07,
  change: -0.91,
  base: 92,
  drift: 0.02,
  wobble: 1.32,
  stateMessage:
    "Judgment validation failed. No Jev answer, policy action, or forecast was published.",
});

const voidVelaBase = baseForecast({
  id: "01K2VELA5SPRINTVOID0001",
  symbol: "VELA",
  company: "Vela Health (fictional)",
  mode: "SPRINT",
  horizon: 5,
  state: "void",
  status: "VOID",
  action: "PASS",
  choice: "up",
  probabilities: { up: 0.51, flat: 0.31, down: 0.18 },
  confidence: 0.59,
  marketRiskInputs: {
    volatilityPercentile: 0.5,
    drawdown60: -0.05,
    normalizedAtr14: 0.025,
    gapRiskPercentile: 0.15,
    sessionsToKnownEvent: 3,
  },
  price: 73.54,
  change: 0,
  base: 69,
  drift: 0.21,
  wobble: 0.82,
  stateMessage: "Void fixture remains visible and is excluded from metrics.",
});
const voidVela: ForecastView = finalizeFixtureForecast({
  ...voidVelaBase,
  voidReason:
    "IRRECOVERABLE_MISSING_BAR — synthetic horizon close intentionally omitted",
  timeline: [
    ...voidVelaBase.timeline,
    {
      kind: "forecast_voided",
      at: "2026-09-19T08:45:00.000Z",
      label: "Forecast voided",
      detail: "The synthetic horizon close was irrecoverably missing.",
      tone: "danger",
    },
  ],
});

const correctedLumaBase = baseForecast({
  id: "01K2LUMA20POSCORR00001",
  symbol: "LUMA",
  company: "Luma Circuits (fictional)",
  mode: "POSITION",
  horizon: 20,
  state: "corrected",
  status: "RESOLVED",
  action: "EXIT",
  choice: "up",
  probabilities: { up: 0.58, flat: 0.24, down: 0.18 },
  confidence: 0.71,
  marketRiskInputs: {
    volatilityPercentile: 0.7,
    drawdown60: -0.1,
    normalizedAtr14: 0.035,
    gapRiskPercentile: 0.85,
    sessionsToKnownEvent: 3,
  },
  price: 128.2,
  change: -1.18,
  base: 119,
  drift: 0.39,
  wobble: 1.7,
  cutoffAt: "2026-08-20T20:15:00.000Z",
  latestMarketSession: "2026-08-20",
  position: {
    stopPrice: 119.4,
    completedSessionLow: 126.2,
    eligibleSessionsHeld: 20,
    horizonSessions: 20,
    consecutiveHoldFailures: 0,
  },
  stateMessage:
    "Corrected fixture. The original record remains visible beside the active corrected outcome.",
});
const correctedLuma: ForecastView = finalizeFixtureForecast({
  ...correctedLumaBase,
  outcome: {
    label: "flat",
    adjustedReturnPercent: 1.84,
    resolvedAt: "2026-09-18T20:22:00.000Z",
    paperPnl: 229.4,
  },
  correction: {
    at: "2026-09-19T09:10:00.000Z",
    reason:
      "Synthetic split adjustment revision changed the fixed-horizon return.",
    originalOutcome: "up",
    activeOutcome: "flat",
  },
  timeline: [
    ...correctedLumaBase.timeline,
    {
      kind: "outcome_resolved",
      at: "2026-09-18T20:22:00.000Z",
      label: "Original outcome resolved",
      detail: "The original synthetic fixed-horizon outcome was appended.",
      tone: "positive",
    },
    {
      kind: "outcome_corrected",
      at: "2026-09-19T09:10:00.000Z",
      label: "Outcome corrected",
      detail:
        "A synthetic split adjustment revision appended the active outcome.",
      tone: "warning",
    },
  ],
});

export const FIXTURE_FORECASTS: readonly ForecastView[] = [
  currentAcme,
  currentNova,
  resolvedMesa,
  staleOrbit,
  incompleteHeli,
  failedKite,
  voidVela,
  correctedLuma,
];

export const FIXTURE_AUDIT_FORECASTS: readonly ForecastView[] = [
  ...FIXTURE_FORECASTS,
  novaEntryForecast,
];

export function getFixtureForecastStaticParams(): { id: string }[] {
  return FIXTURE_AUDIT_FORECASTS.filter(
    ({ pickEligible }) => !pickEligible,
  ).map(({ id }) => ({ id }));
}

const novaPositionRisk = currentNova.positionRisk;
if (novaPositionRisk.kind !== "active") {
  throw new Error("NOVA fixture must contain an active paper position");
}
const novaEntryPolicyInput = novaEntryForecast.policyInput;
if (
  novaEntryForecast.action !== "ENTER" ||
  novaEntryPolicyInput?.kind !== "position" ||
  !novaEntryPolicyInput.sizing.valid ||
  !novaEntryPolicyInput.sizing.shares ||
  !novaEntryPolicyInput.sizing.notional
) {
  throw new Error("NOVA entry fixture must contain a valid frozen entry plan");
}
const novaEntryShares = novaEntryPolicyInput.sizing.shares;
const novaEntryNotional = novaEntryPolicyInput.sizing.notional;
const novaEntryPrice = roundMoney(novaEntryNotional / novaEntryShares);
if (
  novaPositionRisk.entry !== novaEntryPrice ||
  novaPositionRisk.shares !== novaEntryShares
) {
  throw new Error("NOVA monitor risk must retain the frozen entry basis");
}
type FixturePaperEvent = PaperEvent & { readonly detail: string };

const fixturePortfolioEvents: readonly FixturePaperEvent[] = [
  {
    id: "evt-fixture-deposit",
    type: "deposit",
    detail: "Synthetic starting equity",
    cashDelta: 100_000,
    sharesDelta: 0,
    createdAt: "2026-08-17T13:30:00.000Z",
  },
  {
    id: "evt-fixture-luma-entry",
    type: "entry",
    symbol: "LUMA",
    forecastId: correctedLuma.id,
    detail: "Synthetic position entry retained for replay",
    cashDelta: -(124 * 128.54),
    sharesDelta: 124,
    price: 128.54,
    createdAt: "2026-08-21T13:30:00.000Z",
  },
  {
    id: "evt-fixture-luma-mark-20260824",
    type: "mark",
    symbol: "LUMA",
    detail: "Completed synthetic session mark",
    cashDelta: 0,
    sharesDelta: 0,
    price: 125.64,
    createdAt: "2026-08-24T20:15:00.000Z",
  },
  {
    id: "evt-fixture-luma-mark-20260831",
    type: "mark",
    symbol: "LUMA",
    detail: "Completed synthetic session mark",
    cashDelta: 0,
    sharesDelta: 0,
    price: 129.51,
    createdAt: "2026-08-31T20:15:00.000Z",
  },
  {
    id: "evt-fixture-luma-mark-20260908",
    type: "mark",
    symbol: "LUMA",
    detail: "Completed synthetic session mark",
    cashDelta: 0,
    sharesDelta: 0,
    price: 127.81,
    createdAt: "2026-09-08T20:15:00.000Z",
  },
  {
    id: "evt-fixture-luma-mark-20260915",
    type: "mark",
    symbol: "LUMA",
    detail: "Completed synthetic session mark",
    cashDelta: 0,
    sharesDelta: 0,
    price: 129.25,
    createdAt: "2026-09-15T12:00:00.000Z",
  },
  {
    id: "evt-fixture-nova-entry",
    type: "entry",
    symbol: "NOVA",
    forecastId: novaEntryForecast.id,
    detail: "118 shares · 10 bps adverse-open assumption",
    cashDelta: -novaEntryNotional,
    sharesDelta: novaEntryShares,
    price: novaEntryPrice,
    createdAt: "2026-09-15T13:30:00.000Z",
  },
  {
    id: "evt-fixture-luma-exit",
    type: "expiry",
    symbol: "LUMA",
    forecastId: correctedLuma.id,
    detail: "Horizon expiry · synthetic fill",
    cashDelta: 124 * 130.39,
    sharesDelta: -124,
    price: 130.39,
    reason: "horizon expiry",
    createdAt: "2026-09-18T13:30:00.000Z",
  },
  {
    id: "evt-fixture-nova-mark-20260918",
    type: "mark",
    symbol: "NOVA",
    forecastId: currentNova.id,
    detail: "Latest completed synthetic fixture session",
    cashDelta: 0,
    sharesDelta: 0,
    price: currentNova.price,
    createdAt: "2026-09-18T20:17:00.000Z",
  },
];

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function formatFixtureKnownEventEvidence(
  sessionsToKnownEvent: number | null,
): string {
  return sessionsToKnownEvent === null
    ? "No known structured event scheduled"
    : `Synthetic earnings marker in ${sessionsToKnownEvent} sessions`;
}

export function replayFixturePortfolio(
  events: readonly FixturePaperEvent[] = fixturePortfolioEvents,
): PortfolioView {
  for (const [index, event] of events.entries()) {
    if (index > 0 && event.createdAt < events[index - 1]!.createdAt) {
      throw new Error("fixture portfolio events are not chronological");
    }
    if (!event.forecastId) continue;
    const forecast = getForecastById(event.forecastId);
    const publicationAt = forecast?.timeline.find(
      ({ kind }) => kind === "forecast_published",
    )?.at;
    if (
      !forecast ||
      !publicationAt ||
      publicationAt > event.createdAt ||
      (event.symbol !== undefined && event.symbol !== forecast.symbol)
    ) {
      throw new Error(
        `fixture event ${event.id} has an invalid forecast reference`,
      );
    }
  }
  const projection = projectPaperPortfolio(events);
  const openPositions = Object.values(projection.positions)
    .filter(({ shares }) => shares > 0)
    .map((position) => {
      const entryEvent = events.find(
        (event) =>
          event.type === "entry" &&
          event.symbol === position.symbol &&
          event.forecastId !== undefined,
      );
      const entryForecast = entryEvent?.forecastId
        ? getForecastById(entryEvent.forecastId)
        : null;
      const entryPolicyInput = entryForecast?.policyInput;
      const monitorEvent = [...events].reverse().find((event) => {
        if (event.symbol !== position.symbol || !event.forecastId) {
          return false;
        }
        return (
          getForecastById(event.forecastId)?.positionRisk.kind === "active"
        );
      });
      const monitorForecast = monitorEvent?.forecastId
        ? getForecastById(monitorEvent.forecastId)
        : null;
      const risk = monitorForecast?.positionRisk;
      const entryShares =
        entryPolicyInput?.kind === "position"
          ? entryPolicyInput.sizing.shares
          : undefined;
      const entryNotional =
        entryPolicyInput?.kind === "position"
          ? entryPolicyInput.sizing.notional
          : undefined;
      const entry =
        entryShares && entryNotional
          ? roundMoney(entryNotional / entryShares)
          : undefined;
      if (
        entryForecast?.action !== "ENTER" ||
        !entryEvent ||
        !entry ||
        entryEvent.price !== entry ||
        entryEvent.sharesDelta !== entryShares ||
        position.shares !== entryShares ||
        !monitorForecast ||
        risk?.kind !== "active"
      ) {
        throw new Error(
          `fixture position ${position.symbol} lacks a frozen entry or eligible monitor`,
        );
      }
      return {
        symbol: position.symbol,
        forecastId: monitorForecast.id,
        shares: position.shares,
        entry,
        mark: position.markPrice,
        stop: risk.stop,
        paperPnl: roundMoney((position.markPrice - entry) * position.shares),
      };
    });
  const sessions = [
    ...new Set(events.map(({ createdAt }) => createdAt.slice(0, 10))),
  ];
  const equityCurve = sessions.map((session) => {
    const throughSession = events.filter(
      ({ createdAt }) => createdAt.slice(0, 10) <= session,
    );
    return {
      session,
      equity: roundMoney(projectPaperPortfolio(throughSession).equity),
    };
  });
  return {
    startingEquity: equityCurve[0]?.equity ?? 0,
    equity: roundMoney(projection.equity),
    cash: roundMoney(projection.cash),
    exposure: roundMoney(projection.marketValue),
    plannedLoss: roundMoney(
      openPositions.reduce((total, position) => {
        const risk = getForecastById(position.forecastId)?.positionRisk;
        return total + (risk?.kind === "active" ? risk.maximumPlannedLoss : 0);
      }, 0),
    ),
    openPositions,
    events,
    equityCurve,
  };
}

export const FIXTURE_PORTFOLIO: PortfolioView = replayFixturePortfolio();

export const FIXTURE_SCORECARD: ScorecardView = {
  cohort: "fixture_demo_only",
  prospectiveSampleSize: 0,
  distinctResolutionDates: 0,
  activeHorizons: 0,
  lastRefresh: "2026-09-19T10:00:00.000Z",
  scoringContract: {
    version: "scorecard-v1",
    minimumForecasts: 100,
    minimumDistinctResolutionDates: 20,
    minimumPerActiveHorizon: 20,
    reliabilityMinimumBucketSize: 20,
    lowSampleWarning:
      "Not enough prospective evidence for a superiority claim. Same-date observations and overlapping windows are correlated.",
  },
  proof: {
    evidenceClass: "fixture_manual_only",
    externalAttestation: "absent",
    prospectiveScorecardEligible: false,
  },
  baselines: [
    { id: "always_up", label: "Always up", metricClass: "direction" },
    {
      id: "momentum_v1",
      label: "Deterministic momentum",
      metricClass: "direction",
    },
    {
      id: "eligible_buy_and_hold_v1",
      label: "Eligible-universe buy and hold",
      metricClass: "portfolio",
    },
  ],
  metrics: {
    brierScore: null,
    logLoss: null,
    publicationSuccessRate: null,
    coverageRate: null,
    passRate: null,
    hitRate: null,
    paperReturn: null,
    maximumDrawdown: null,
    turnover: null,
  },
};

export function getForecastById(id: string): ForecastView | null {
  return FIXTURE_AUDIT_FORECASTS.find((forecast) => forecast.id === id) ?? null;
}

export function getStockBySymbol(symbol: string): ForecastView | null {
  const normalized = symbol.trim().toUpperCase();
  return (
    FIXTURE_FORECASTS.find((forecast) => forecast.symbol === normalized) ?? null
  );
}

export function getBlindStockPageBySymbol(
  symbol: string,
): BlindStockPageView | null {
  const forecast = getStockBySymbol(symbol);
  if (!forecast) return null;
  return {
    symbol: forecast.symbol,
    company: forecast.company,
    price: forecast.price,
    sessionChangePercent: forecast.sessionChangePercent,
    displayState: forecast.displayState,
    stateMessage: forecast.stateMessage,
    chart: forecast.chart,
    evidence: forecast.evidence,
    forecastId: forecast.id,
    cutoffAt: forecast.cutoffAt,
    latestMarketSession: forecast.latestMarketSession,
    modelVersion: forecast.modelVersion,
    policyVersion: forecast.policyVersion,
    sourceReferenceCount: forecast.sourceReferenceCount,
    pickEligible: forecast.pickEligible,
    reveal: { forecastId: forecast.id, symbol: forecast.symbol },
  };
}

export function getUniverse(): readonly StockSummaryView[] {
  return FIXTURE_FORECASTS.map((forecast) => ({
    symbol: forecast.symbol,
    company: forecast.company,
    price: forecast.price,
    sessionChangePercent: forecast.sessionChangePercent,
    action: forecast.pickEligible ? "HIDDEN" : forecast.action,
    mode: forecast.mode,
    horizonSessions: forecast.horizonSessions,
    marketRiskBand: forecast.pickEligible ? null : forecast.marketRisk.band,
    displayState: forecast.displayState,
    forecastId: forecast.id,
    cutoffAt: forecast.cutoffAt,
    latestMarketSession: forecast.latestMarketSession,
    modelVersion: forecast.modelVersion,
    policyVersion: forecast.policyVersion,
    blind: forecast.pickEligible,
    decisionAvailable: forecast.judgment !== null && forecast.action !== null,
    dataKind: "synthetic_fixture" as const,
  }));
}
