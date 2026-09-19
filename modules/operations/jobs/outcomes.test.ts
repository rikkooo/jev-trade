import { describe, expect, it } from "vitest";

import { resolveForecastAtHorizon } from "./outcomes";

const calendar = [
  "2026-09-17",
  "2026-09-18",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
] as const;

describe("fixed-session outcome resolution", () => {
  it("resolves only from the exact eligible horizon session", () => {
    const pending = resolveForecastAtHorizon({
      forecast: {
        id: "f1",
        mode: "sprint",
        horizonSessions: 1,
        cutoffSession: "2026-09-18",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-18",
      bars: [],
    });
    expect(pending).toEqual({
      status: "pending",
      targetSession: "2026-09-21",
      reason: "HORIZON_NOT_REACHED",
    });

    const resolved = resolveForecastAtHorizon({
      forecast: {
        id: "f1",
        mode: "sprint",
        horizonSessions: 1,
        cutoffSession: "2026-09-18",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-21",
      bars: [
        {
          session: "2026-09-21",
          adjustedClose: 100.5,
          sourceBarHash: "a".repeat(64),
        },
      ],
    });
    expect(resolved).toMatchObject({
      status: "resolved",
      targetSession: "2026-09-21",
      realizedLabel: "flat",
      adjustedReturn: 0.005,
      valuationBasis: "exact_horizon_close",
    });
  });

  it("uses documented delisting consideration instead of voiding adversity", () => {
    const result = resolveForecastAtHorizon({
      forecast: {
        id: "f2",
        mode: "sprint",
        horizonSessions: 5,
        cutoffSession: "2026-09-17",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-24",
      bars: [],
      lifecycle: {
        type: "delisting",
        effectiveSession: "2026-09-22",
        officialConsideration: 30,
        sourceHash: "b".repeat(64),
      },
    });

    expect(result).toMatchObject({
      status: "resolved",
      realizedLabel: "down",
      adjustedReturn: -0.7,
      valuationBasis: "official_delisting_consideration",
      sensitivity: null,
    });
  });

  it("resolves a documented zero delisting consideration as a total loss", () => {
    const result = resolveForecastAtHorizon({
      forecast: {
        id: "f-zero",
        mode: "sprint",
        horizonSessions: 1,
        cutoffSession: "2026-09-18",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-21",
      bars: [],
      lifecycle: {
        type: "delisting",
        effectiveSession: "2026-09-21",
        officialConsideration: 0,
        sourceHash: "e".repeat(64),
      },
    });
    expect(result).toMatchObject({
      status: "resolved",
      realizedLabel: "down",
      adjustedReturn: -1,
    });
  });

  it("keeps halt and delisting outcomes pending unless a defensible value or explicit void reason exists", () => {
    const result = resolveForecastAtHorizon({
      forecast: {
        id: "f3",
        mode: "sprint",
        horizonSessions: 1,
        cutoffSession: "2026-09-18",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-21",
      bars: [],
      lifecycle: {
        type: "halt",
        effectiveSession: "2026-09-21",
        sourceHash: "c".repeat(64),
      },
    });
    expect(result).toEqual({
      status: "pending",
      targetSession: "2026-09-21",
      reason: "LIFECYCLE_VALUE_PENDING",
    });

    expect(
      resolveForecastAtHorizon({
        forecast: {
          id: "f3",
          mode: "sprint",
          horizonSessions: 1,
          cutoffSession: "2026-09-18",
          cutoffAdjustedClose: 100,
        },
        calendar,
        asOfSession: "2026-09-21",
        bars: [],
        irrecoverableReason: "IRRECOVERABLE_MISSING_BAR",
      }),
    ).toEqual({
      status: "void",
      targetSession: "2026-09-21",
      reason: "IRRECOVERABLE_MISSING_BAR",
    });
  });

  it("includes a sensitivity range when only a last defensible value exists", () => {
    const result = resolveForecastAtHorizon({
      forecast: {
        id: "f4",
        mode: "sprint",
        horizonSessions: 1,
        cutoffSession: "2026-09-18",
        cutoffAdjustedClose: 100,
      },
      calendar,
      asOfSession: "2026-09-21",
      bars: [],
      lifecycle: {
        type: "halt",
        effectiveSession: "2026-09-21",
        lastDefensibleAdjustedValue: 80,
        sourceHash: "d".repeat(64),
      },
    });
    expect(result).toMatchObject({
      status: "resolved",
      adjustedReturn: -0.2,
      valuationBasis: "last_defensible_value",
      sensitivity: {
        lowerBoundAdjustedReturn: -1,
        upperBoundAdjustedReturn: -0.2,
      },
    });
  });
});
