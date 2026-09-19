import { describe, expect, it } from "vitest";

import type { ProcessorTerms, ProviderRights } from "../ledger/types";
import {
  evaluatePublicForecastRead,
  evaluatePublicModeGate,
} from "./provider-rights";

const rights: ProviderRights = {
  id: "rights_1",
  provider: "licensed-provider",
  planOrContract: "contract-v1",
  permittedFields: ["daily_ohlcv"],
  audience: "public",
  retention: "contract-defined",
  attribution: "Licensed Provider",
  derivedOutputs: true,
  screenshotsAndVideo: true,
  onwardAiProcessing: true,
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  reviewedBy: "reviewer@example.test",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const terms: ProcessorTerms = {
  id: "terms_1",
  processor: "openrouter-jev",
  retention: "none",
  training: "disabled",
  residency: "us",
  deletion: "request-supported",
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  reviewedBy: "reviewer@example.test",
  createdAt: "2026-09-01T00:00:00.000Z",
};

describe("public-mode rights gate", () => {
  const requirements = {
    at: "2026-09-19T12:00:00.000Z",
    expectedProvider: "licensed-provider",
    expectedProcessor: "openrouter-jev",
    requiredFields: ["daily_ohlcv"],
  } as const;

  it("requires both complete records to be effective at the requested instant", () => {
    expect(
      evaluatePublicModeGate({
        requirements,
        providerRights: [rights],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: true, blockers: [] });
  });

  it("binds a public forecast read to its stored snapshot provider", () => {
    const completeRights = {
      ...rights,
      permittedFields: [
        "daily_ohlcv",
        "corporate_actions",
        "exchange_calendar",
        "structured_events",
      ],
    };
    expect(
      evaluatePublicForecastRead({
        at: requirements.at,
        snapshotProvider: "licensed-provider",
        judgmentProvider: "openrouter",
        providerRights: [completeRights],
        processorTerms: [terms],
      }).allowed,
    ).toBe(true);
    expect(
      evaluatePublicForecastRead({
        at: requirements.at,
        snapshotProvider: "unlicensed-provider",
        judgmentProvider: "openrouter",
        providerRights: [completeRights],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: false, blockers: ["PROVIDER_RIGHTS_MISSING"] });
    expect(
      evaluatePublicForecastRead({
        at: requirements.at,
        snapshotProvider: "licensed-provider",
        judgmentProvider: "other-router",
        providerRights: [completeRights],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: false, blockers: ["PROCESSOR_TERMS_MISSING"] });
  });

  it("fails closed for expired or incomplete records", () => {
    expect(
      evaluatePublicModeGate({
        requirements: { ...requirements, at: "2026-10-02T00:00:00.000Z" },
        providerRights: [
          { ...rights, effectiveTo: "2026-10-01T00:00:00.000Z" },
        ],
        processorTerms: [{ ...terms, effectiveTo: "2026-10-01T00:00:00.000Z" }],
      }),
    ).toEqual({
      allowed: false,
      blockers: ["PROVIDER_RIGHTS_MISSING", "PROCESSOR_TERMS_MISSING"],
    });

    expect(
      evaluatePublicModeGate({
        requirements,
        providerRights: [{ ...rights, onwardAiProcessing: false }],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: false, blockers: ["PROVIDER_RIGHTS_MISSING"] });
  });

  it("requires the exact provider, processor, audience, and field set", () => {
    const cases = [
      {
        providerRights: [{ ...rights, provider: "other" }],
        processorTerms: [terms],
      },
      {
        providerRights: [{ ...rights, audience: "private" as const }],
        processorTerms: [terms],
      },
      {
        providerRights: [rights],
        processorTerms: [{ ...terms, processor: "other" }],
      },
      {
        providerRights: [rights],
        processorTerms: [terms],
        requiredFields: ["daily_ohlcv", "corporate_actions"],
      },
    ];

    for (const testCase of cases) {
      const result = evaluatePublicModeGate({
        requirements: {
          ...requirements,
          requiredFields:
            testCase.requiredFields ?? requirements.requiredFields,
        },
        providerRights: testCase.providerRights,
        processorTerms: testCase.processorTerms,
      });
      expect(result.allowed).toBe(false);
    }
  });
});
