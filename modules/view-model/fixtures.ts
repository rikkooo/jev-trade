import { createHash } from "node:crypto";

import type {
  DisplayState,
  BlindStockPageView,
  ForecastView,
  MarketRiskBand,
  PortfolioView,
  ScorecardView,
  StockSummaryView,
} from "./types";

function fixtureHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function chart(base: number, drift: number, wobble: number) {
  const sessions = [
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
  ];
  return sessions.map((session, index) => ({
    session,
    close: Number(
      (base + drift * index + Math.sin(index * 1.43) * wobble).toFixed(2),
    ),
    volume: Math.round(820_000 + index * 18_500 + (index % 4) * 67_000),
  }));
}

const riskComponents = (index: number) =>
  [
    {
      label: "Volatility percentile",
      value: Math.min(100, index + 8),
      weight: 35,
    },
    { label: "Drawdown severity", value: Math.max(0, index - 11), weight: 20 },
    { label: "Normalized ATR", value: Math.min(100, index + 3), weight: 20 },
    { label: "Gap risk", value: Math.max(0, index - 5), weight: 10 },
    {
      label: "Known event proximity",
      value: Math.min(100, index + 6),
      weight: 15,
    },
  ] as const;

const bandFor = (index: number): MarketRiskBand =>
  index <= 34 ? "LOW" : index <= 64 ? "MEDIUM" : "HIGH";

function baseForecast(input: {
  id: string;
  symbol: string;
  company: string;
  mode: ForecastView["mode"];
  horizon: ForecastView["horizonSessions"];
  state: DisplayState;
  status?: ForecastView["forecastStatus"];
  action: ForecastView["action"];
  choice: ForecastView["judgment"]["choice"];
  probabilities: ForecastView["judgment"]["probabilities"];
  confidence: number;
  risk: number;
  price: number;
  change: number;
  base: number;
  drift: number;
  wobble: number;
  pickEligible?: boolean;
  stateMessage: string;
  sourceFreshness?: string;
}): ForecastView {
  const cutoffAt = "2026-09-18T20:15:00.000Z";
  return {
    id: input.id,
    symbol: input.symbol,
    company: input.company,
    mode: input.mode,
    horizonSessions: input.horizon,
    neutralBandPercent:
      input.mode === "POSITION" ? 2 : input.horizon === 1 ? 0.5 : 1.5,
    cutoffAt,
    latestMarketSession: "2026-09-18",
    modelVersion: "typesafe/jev-1.13-20260917",
    questionVersion: "jev-questions-v1",
    policyVersion: "paper-policy-v1",
    methodologyVersion: "methodology-v1.0",
    decisionStateHash: `sha256:${fixtureHash(`fixture-state:${input.id}`)}`,
    sourceReferenceCount: 614,
    sourceFreshness:
      input.sourceFreshness ??
      "Fixture snapshot completed 15 minutes before cutoff",
    displayState: input.state,
    forecastStatus: input.status ?? "PUBLISHED",
    prospectiveStatus: "FIXTURE — NOT SCORED",
    action: input.action,
    price: input.price,
    sessionChangePercent: input.change,
    judgment: {
      choice: input.choice,
      probabilities: input.probabilities,
      confidence: input.confidence,
      confidenceLabel:
        input.confidence < 0.5
          ? "LOW"
          : input.confidence < 0.75
            ? "MEDIUM"
            : "HIGH",
      setupQuality:
        input.choice === "up" ? 2.6 : input.choice === "flat" ? 1.7 : 1.2,
      downsideHazard: input.risk >= 65 ? 2.6 : input.risk >= 35 ? 1.5 : 0.8,
      evidenceSufficiency: input.state === "incomplete" ? 0.8 : 2.7,
    },
    marketRisk: {
      index: input.risk,
      band: bandFor(input.risk),
      formulaVersion: "market-risk-v1",
      components: riskComponents(input.risk),
    },
    positionRisk:
      input.mode === "POSITION" && input.action === "HOLD"
        ? {
            kind: "active",
            entry: Number((input.price * 0.974).toFixed(2)),
            stop: Number((input.price * 0.922).toFixed(2)),
            shares: 118,
            capitalAtRisk: 708,
            maximumPlannedLoss: 708,
            notional: Number((118 * input.price).toFixed(2)),
            currentPaperPnl: Number((118 * input.price * 0.026).toFixed(2)),
            equity: 100_684,
            formulaVersion: "position-risk-v1",
            assumptions:
              "1% equity risk cap · 20% notional cap · 10 bps adverse fill per side",
          }
        : {
            kind: "not_applicable",
            reason:
              input.mode === "SPRINT"
                ? "Sprint forecasts score direction only and never open a paper position."
                : input.action === "WAIT"
                  ? "No paper position opened because policy-v1 forced WAIT."
                  : "This fixture has no open paper position; realized paper results are shown in the outcome record.",
            maximumPlannedLoss: 0,
          },
    chart: chart(input.base, input.drift, input.wobble),
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
        value: "Synthetic earnings marker in 8 sessions",
      },
      {
        label: "Missing-data flags",
        value:
          input.state === "incomplete" ? "Event calendar incomplete" : "None",
      },
    ],
    gates: [
      {
        order: 1,
        label: "Snapshot freshness",
        result: input.state === "stale" ? "FAIL" : "PASS",
        detail:
          input.state === "stale"
            ? "Fixture cutoff exceeded the demo freshness window."
            : "Latest completed fixture session is present.",
      },
      {
        order: 2,
        label: "Evidence sufficiency",
        result: input.state === "incomplete" ? "FAIL" : "PASS",
        detail:
          input.state === "incomplete"
            ? "Required structured event coverage is missing."
            : "Jev evidence score meets policy-v1 threshold.",
      },
      {
        order: 3,
        label: "Market-risk ceiling",
        result: input.risk > 64 ? "FAIL" : "PASS",
        detail:
          input.risk > 64
            ? "HIGH market-risk band blocks a new simulated entry."
            : "Deterministic risk index is below the entry ceiling.",
      },
      {
        order: 4,
        label: "Code-owned action",
        result:
          input.action === "WAIT" || input.action === "PASS" ? "FAIL" : "PASS",
        detail: `Policy-v1 produced ${input.action}; Jev did not choose position size or execution.`,
      },
    ],
    timeline: [
      {
        at: "2026-09-18T20:00:00.000Z",
        label: "Fixture session closed",
        detail: "Synthetic OHLCV inputs became available.",
        tone: "neutral",
      },
      {
        at: "2026-09-18T20:15:00.000Z",
        label: "State frozen",
        detail: "Canonical fixture state and source hashes were fixed.",
        tone: "neutral",
      },
      {
        at: "2026-09-18T20:16:02.000Z",
        label: "Jev judgment recorded",
        detail: "Typed response validated against jev-questions-v1.",
        tone: "positive",
      },
      {
        at: "2026-09-18T20:16:03.000Z",
        label: "Policy applied",
        detail: `paper-policy-v1 produced ${input.action}.`,
        tone:
          input.action === "WAIT" || input.action === "PASS"
            ? "warning"
            : "positive",
      },
    ],
    pickEligible: input.pickEligible ?? false,
    stateMessage: input.stateMessage,
  };
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
  risk: 41,
  price: 116.42,
  change: 1.26,
  base: 106,
  drift: 0.47,
  wobble: 1.15,
  pickEligible: true,
  stateMessage:
    "Current synthetic fixture judgment. Frozen before its five-session evaluation window.",
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
  risk: 32,
  price: 148.72,
  change: 0.64,
  base: 137,
  drift: 0.54,
  wobble: 1.42,
  stateMessage:
    "Open synthetic paper position. Deterministic stop and horizon checks remain active.",
});

const resolvedMesa: ForecastView = {
  ...baseForecast({
    id: "01K4MESA1SPRINTRES00001",
    symbol: "MESA",
    company: "Mesa Robotics (fictional)",
    mode: "SPRINT",
    horizon: 1,
    state: "resolved",
    status: "RESOLVED",
    action: "FLAT",
    choice: "flat",
    probabilities: { up: 0.25, flat: 0.53, down: 0.22 },
    confidence: 0.76,
    risk: 28,
    price: 82.15,
    change: 0.12,
    base: 79,
    drift: 0.13,
    wobble: 0.64,
    stateMessage:
      "Resolved synthetic fixture. Outcome uses the frozen one-session close.",
  }),
  cutoffAt: "2026-09-15T20:15:00.000Z",
  latestMarketSession: "2026-09-15",
  outcome: {
    label: "flat",
    adjustedReturnPercent: 0.31,
    resolvedAt: "2026-09-16T20:20:00.000Z",
  },
  timeline: [
    ...baseForecast({
      id: "01K4MESA1SPRINTRES00001",
      symbol: "MESA",
      company: "Mesa Robotics (fictional)",
      mode: "SPRINT",
      horizon: 1,
      state: "resolved",
      action: "FLAT",
      choice: "flat",
      probabilities: { up: 0.25, flat: 0.53, down: 0.22 },
      confidence: 0.76,
      risk: 28,
      price: 82.15,
      change: 0.12,
      base: 79,
      drift: 0.13,
      wobble: 0.64,
      stateMessage: "Resolved",
    }).timeline,
    {
      at: "2026-09-16T20:20:00.000Z",
      label: "Outcome resolved",
      detail: "+0.31% fell inside the inclusive ±0.5% flat band.",
      tone: "positive",
    },
  ],
};

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
  risk: 72,
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
  action: "WAIT",
  choice: "flat",
  probabilities: { up: 0.31, flat: 0.39, down: 0.3 },
  confidence: 0.42,
  risk: 57,
  price: 42.8,
  change: -0.22,
  base: 44,
  drift: -0.04,
  wobble: 0.72,
  stateMessage:
    "Incomplete fixture. Structured event coverage is missing, so policy-v1 forces WAIT.",
});

const failedKite = baseForecast({
  id: "01K3KITE1SPRINTFAIL0001",
  symbol: "KITE",
  company: "Kite Mobility (fictional)",
  mode: "SPRINT",
  horizon: 1,
  state: "failed",
  action: "PASS",
  choice: "flat",
  probabilities: { up: 0.33, flat: 0.34, down: 0.33 },
  confidence: 0.34,
  risk: 48,
  price: 91.07,
  change: -0.91,
  base: 92,
  drift: 0.02,
  wobble: 1.32,
  stateMessage:
    "Judgment job failed validation. No replacement call was fabricated; the prior fixture remains historical.",
});

const voidVela: ForecastView = {
  ...baseForecast({
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
    risk: 38,
    price: 73.54,
    change: 0,
    base: 69,
    drift: 0.21,
    wobble: 0.82,
    stateMessage: "Void fixture remains visible and is excluded from metrics.",
  }),
  voidReason:
    "IRRECOVERABLE_MISSING_BAR — synthetic horizon close intentionally omitted",
};

const correctedLuma: ForecastView = {
  ...baseForecast({
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
    risk: 61,
    price: 128.2,
    change: -1.18,
    base: 119,
    drift: 0.39,
    wobble: 1.7,
    stateMessage:
      "Corrected fixture. The original record remains visible beside the active corrected outcome.",
  }),
  cutoffAt: "2026-08-20T20:15:00.000Z",
  latestMarketSession: "2026-08-20",
  outcome: {
    label: "flat",
    adjustedReturnPercent: 1.84,
    resolvedAt: "2026-09-18T20:22:00.000Z",
    paperPnl: 684,
  },
  correction: {
    at: "2026-09-19T09:10:00.000Z",
    reason:
      "Synthetic split adjustment revision changed the fixed-horizon return.",
    originalOutcome: "up",
    activeOutcome: "flat",
  },
};

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

export const FIXTURE_PORTFOLIO: PortfolioView = {
  startingEquity: 100_000,
  equity: 100_684,
  cash: 83_136.96,
  exposure: 17_547.04,
  plannedLoss: 708,
  openPositions: [
    {
      symbol: "NOVA",
      forecastId: currentNova.id,
      shares: 118,
      entry: 144.85,
      mark: 148.72,
      stop: 137.12,
      paperPnl: 456.66,
    },
  ],
  events: [
    {
      id: "evt-fixture-deposit",
      at: "2026-08-17T13:30:00.000Z",
      type: "DEPOSIT",
      symbol: "—",
      detail: "Synthetic starting equity",
      cashDelta: 100_000,
    },
    {
      id: "evt-fixture-nova-entry",
      at: "2026-09-15T13:30:00.000Z",
      type: "ENTRY",
      symbol: "NOVA",
      detail: "118 shares · 10 bps adverse-open assumption",
      cashDelta: -17_092.3,
    },
    {
      id: "evt-fixture-luma-exit",
      at: "2026-09-18T13:30:00.000Z",
      type: "EXIT",
      symbol: "LUMA",
      detail: "Horizon expiry · synthetic fill",
      cashDelta: 16_168.42,
    },
    {
      id: "evt-fixture-mark",
      at: "2026-09-18T20:15:00.000Z",
      type: "MARK",
      symbol: "NOVA",
      detail: "Latest completed synthetic fixture session",
      cashDelta: 0,
    },
  ],
  equityCurve: [
    { session: "2026-08-17", equity: 100_000 },
    { session: "2026-08-24", equity: 99_640 },
    { session: "2026-08-31", equity: 100_120 },
    { session: "2026-09-08", equity: 99_910 },
    { session: "2026-09-15", equity: 100_310 },
    { session: "2026-09-18", equity: 100_684 },
  ],
};

export const FIXTURE_SCORECARD: ScorecardView = {
  cohort: "fixture_demo_only",
  prospectiveSampleSize: 0,
  distinctResolutionDates: 0,
  lastRefresh: "2026-09-19T10:00:00.000Z",
  metrics: {
    brierScore: null,
    logLoss: null,
    coverageRate: null,
    hitRate: null,
    paperReturn: null,
    maximumDrawdown: null,
    turnover: null,
  },
};

export function getForecastById(id: string): ForecastView | null {
  return FIXTURE_FORECASTS.find((forecast) => forecast.id === id) ?? null;
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
    blind: forecast.pickEligible,
    dataKind: "synthetic_fixture" as const,
  }));
}
