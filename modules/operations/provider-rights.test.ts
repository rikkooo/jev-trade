import { describe, expect, it } from "vitest";

import type { ProcessorTerms, ProviderRights } from "../ledger/types";
import { evaluatePublicModeGate } from "./provider-rights";

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
  it("requires both complete records to be effective at the requested instant", () => {
    expect(
      evaluatePublicModeGate({
        at: "2026-09-19T12:00:00.000Z",
        providerRights: [rights],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: true, blockers: [] });
  });

  it("fails closed for expired or incomplete records", () => {
    expect(
      evaluatePublicModeGate({
        at: "2026-10-02T00:00:00.000Z",
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
        at: "2026-09-19T12:00:00.000Z",
        providerRights: [{ ...rights, onwardAiProcessing: false }],
        processorTerms: [terms],
      }),
    ).toEqual({ allowed: false, blockers: ["PROVIDER_RIGHTS_MISSING"] });
  });
});
