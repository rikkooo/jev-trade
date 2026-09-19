import { describe, expect, it } from "vitest";

import { computeMarketRisk } from "@/modules/policy";

import {
  FIXTURE_AUDIT_FORECASTS,
  FIXTURE_PORTFOLIO,
  FIXTURE_FORECASTS,
  FIXTURE_SCORECARD,
  buildFixtureSourceManifest,
  getBlindStockPageBySymbol,
  getFixtureForecastStaticParams,
  getForecastById,
  getStockBySymbol,
  getUniverse,
  formatFixtureKnownEventEvidence,
  rebuildFixturePolicyDecision,
  replayFixturePortfolio,
} from "./fixtures";

describe("fixture public projections", () => {
  it("keeps every symbol explicitly synthetic and exposes all public states", () => {
    const universe = getUniverse();

    expect(universe.length).toBeGreaterThanOrEqual(6);
    expect(new Set(universe.map((stock) => stock.symbol)).size).toBe(
      universe.length,
    );
    expect(
      universe.every((stock) => stock.dataKind === "synthetic_fixture"),
    ).toBe(true);
    expect(new Set(universe.map((stock) => stock.displayState))).toEqual(
      new Set([
        "current",
        "resolved",
        "stale",
        "incomplete",
        "failed",
        "void",
        "corrected",
      ]),
    );
  });

  it("resolves stock symbols case-insensitively without inventing records", () => {
    expect(getStockBySymbol("acme")?.symbol).toBe("ACME");
    expect(getStockBySymbol("UNKNOWN")).toBeNull();
  });

  it("keeps eligible calls blind in every universe summary", () => {
    const eligible = getUniverse().filter((stock) => stock.blind);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toMatchObject({
      symbol: "ACME",
      action: "HIDDEN",
      marketRiskBand: null,
    });
    const serialized = JSON.stringify(eligible);
    expect(serialized).not.toContain('"action":"UP"');
    expect(serialized).not.toContain('"marketRiskBand":"MEDIUM"');
  });

  it("preserves immutable forecast metadata and separate risk concepts", () => {
    const forecast = getForecastById("01K5D3JEVACME5SPRINT0001");

    expect(forecast).not.toBeNull();
    expect(forecast?.cutoffAt).toBe("2026-09-18T20:15:00.000Z");
    expect(forecast?.latestMarketSession).toBe("2026-09-18");
    expect(forecast?.modelVersion).toBe("typesafe/jev-1.13-20260917");
    expect(forecast?.policyVersion).toBe("paper-policy-v1");
    expect(forecast?.judgment?.probabilities).toEqual({
      up: 0.62,
      flat: 0.23,
      down: 0.15,
    });
    expect(forecast?.marketRisk).toMatchObject({ index: 41, band: "MEDIUM" });
    expect(forecast?.positionRisk.kind).toBe("not_applicable");
    expect(forecast?.decisionStateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(forecast?.judgmentInputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(forecast?.sourceManifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(forecast?.sourceReferenceCount).toBe(602);
    expect(
      forecast && buildFixtureSourceManifest(forecast).references,
    ).toHaveLength(602);
    expect(
      getUniverse().every((stock) => {
        const full = getForecastById(stock.forecastId);
        return /^sha256:[0-9a-f]{64}$/.test(full?.decisionStateHash ?? "");
      }),
    ).toBe(true);
  });

  it("derives every fixture market-risk view and policy input from market-risk-v1", () => {
    for (const forecast of FIXTURE_AUDIT_FORECASTS) {
      const rebuilt = computeMarketRisk(forecast.marketRisk.inputs);
      expect(forecast.marketRisk).toMatchObject({
        index: rebuilt.index,
        band: rebuilt.band,
        formulaVersion: rebuilt.formulaVersion,
      });
      expect(
        Math.round(
          forecast.marketRisk.components.reduce(
            (total, component) =>
              total + (component.value * component.weight) / 100,
            0,
          ),
        ),
      ).toBe(rebuilt.index);
      if (forecast.policyInput?.kind === "position") {
        expect(forecast.policyInput.marketRisk).toEqual({
          index: rebuilt.index,
          band: rebuilt.band,
        });
      }
      expect(
        forecast.evidence.find(
          ({ label }) => label === "Known structured event",
        )?.value,
      ).toBe(
        formatFixtureKnownEventEvidence(
          forecast.marketRisk.inputs.sessionsToKnownEvent,
        ),
      );
    }
  });

  it("derives the active risk and portfolio totals from replayable values", () => {
    const nova = getForecastById("01K5D3JEVNOVA20POS00001");
    expect(nova?.positionRisk).toMatchObject({
      kind: "active",
      entry: 144.85,
      stop: 137.12,
      shares: 118,
      capitalAtRisk: 912.14,
      maximumPlannedLoss: 912.14,
    });

    const novaEntry = getForecastById("01K5D3JEVNOVA20ENTRY001");
    const novaEntryEvent = FIXTURE_PORTFOLIO.events.find(
      ({ id }) => id === "evt-fixture-nova-entry",
    );
    const novaMonitorEvent = FIXTURE_PORTFOLIO.events.find(
      ({ id }) => id === "evt-fixture-nova-mark-20260918",
    );
    expect(novaEntry).toMatchObject({
      action: "ENTER",
      cutoffAt: "2026-09-14T20:15:00.000Z",
      latestMarketSession: "2026-09-14",
    });
    expect(novaEntryEvent?.forecastId).toBe(novaEntry?.id);
    expect(novaMonitorEvent?.forecastId).toBe(nova?.id);
    expect(getFixtureForecastStaticParams()).toContainEqual({
      id: novaEntry?.id,
    });
    expect(Date.parse(novaEntryEvent!.createdAt)).toBeGreaterThan(
      Date.parse(
        novaEntry!.timeline.find(({ kind }) => kind === "forecast_published")!
          .at,
      ),
    );
    expect(Date.parse(novaMonitorEvent!.createdAt)).toBeGreaterThan(
      Date.parse(
        nova!.timeline.find(({ kind }) => kind === "forecast_published")!.at,
      ),
    );
    expect(FIXTURE_PORTFOLIO.openPositions[0]).toMatchObject({
      forecastId: nova?.id,
      entry: novaEntryEvent?.price,
      stop: 137.12,
    });

    expect(replayFixturePortfolio(FIXTURE_PORTFOLIO.events)).toEqual(
      FIXTURE_PORTFOLIO,
    );
    expect(
      FIXTURE_PORTFOLIO.events.every(
        (event, index, events) =>
          index === 0 || event.createdAt >= events[index - 1]!.createdAt,
      ),
    ).toBe(true);
    expect(FIXTURE_PORTFOLIO.cash).toBe(83_137.1);
    expect(FIXTURE_PORTFOLIO.exposure).toBe(17_548.96);
    expect(FIXTURE_PORTFOLIO.equity).toBe(100_686.06);
    expect(FIXTURE_PORTFOLIO.plannedLoss).toBe(912.14);
    expect(FIXTURE_PORTFOLIO.equityCurve).toEqual([
      { session: "2026-08-17", equity: 100_000 },
      { session: "2026-08-21", equity: 100_000 },
      { session: "2026-08-24", equity: 99_640.4 },
      { session: "2026-08-31", equity: 100_120.28 },
      { session: "2026-09-08", equity: 99_909.48 },
      { session: "2026-09-15", equity: 100_088.04 },
      { session: "2026-09-18", equity: 100_686.06 },
    ]);
  });

  it("replays the real versioned policy engine and preserves its full trace", () => {
    for (const forecast of FIXTURE_FORECASTS) {
      const rebuilt = rebuildFixturePolicyDecision(forecast);
      expect(rebuilt?.action ?? null).toBe(forecast.action);
      expect(rebuilt?.gates ?? []).toEqual(forecast.gates);
      if (rebuilt) {
        expect(rebuilt.policyVersion).toBe(forecast.policyVersion);
        expect(
          forecast.gates.every((gate, index) => gate.order === index + 1),
        ).toBe(true);
      }
    }
  });

  it("keeps lifecycle events chronological and publishes before terminal events", () => {
    for (const forecast of FIXTURE_AUDIT_FORECASTS) {
      const timestamps = forecast.timeline.map(({ at }) => Date.parse(at));
      expect(
        timestamps.every(
          (timestamp, index) =>
            index === 0 || timestamp >= timestamps[index - 1]!,
        ),
      ).toBe(true);
      const publication = forecast.timeline.find(
        ({ kind }) => kind === "forecast_published",
      );
      const terminalEvents = forecast.timeline.filter(({ kind }) =>
        ["outcome_resolved", "forecast_voided", "outcome_corrected"].includes(
          kind,
        ),
      );
      for (const terminal of terminalEvents) {
        expect(publication).toBeDefined();
        expect(Date.parse(terminal.at)).toBeGreaterThan(
          Date.parse(publication!.at),
        );
      }
    }
  });

  it.each([
    ["HELI", "incomplete", "data_incomplete"],
    ["KITE", "failed", "judgment_failed"],
  ] as const)(
    "%s exposes the %s state without invented decision output",
    (symbol, state, terminalKind) => {
      const forecast = getStockBySymbol(symbol);
      expect(forecast).toMatchObject({
        displayState: state,
        forecastStatus: "NOT_PUBLISHED",
        judgment: null,
        policyInput: null,
        action: null,
        gates: [],
      });
      expect(forecast?.timeline.at(-1)?.kind).toBe(terminalKind);
      expect(
        forecast?.timeline.some(({ kind }) =>
          [
            "judgment_recorded",
            "policy_applied",
            "forecast_published",
          ].includes(kind),
        ),
      ).toBe(false);
      expect(JSON.stringify(forecast)).not.toContain('"probabilities"');
    },
  );

  it("builds a complete blind stock projection without Jev or policy output", () => {
    const page = getBlindStockPageBySymbol("ACME");
    expect(page).not.toBeNull();
    expect(page?.pickEligible).toBe(true);
    expect(page?.reveal).toEqual({
      forecastId: "01K5D3JEVACME5SPRINT0001",
      symbol: "ACME",
    });

    const serialized = JSON.stringify(page);
    for (const forbidden of [
      '"judgment"',
      '"action"',
      '"marketRisk"',
      '"positionRisk"',
      '"gates"',
      '"timeline"',
      '"outcome"',
      '"probabilities"',
      "paper-policy-v1 produced",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain('"up":0.62');
  });

  it("starts the prospective scorecard at zero", () => {
    expect(FIXTURE_SCORECARD.prospectiveSampleSize).toBe(0);
    expect(FIXTURE_SCORECARD.metrics.brierScore).toBeNull();
    expect(FIXTURE_SCORECARD.metrics.hitRate).toBeNull();
    expect(FIXTURE_SCORECARD.cohort).toBe("fixture_demo_only");
    expect(FIXTURE_SCORECARD.proof).toEqual({
      evidenceClass: "fixture_manual_only",
      externalAttestation: "absent",
      prospectiveScorecardEligible: false,
    });
    expect(FIXTURE_SCORECARD.baselines.map((baseline) => baseline.id)).toEqual([
      "always_up",
      "momentum_v1",
      "eligible_buy_and_hold_v1",
    ]);
  });
});
