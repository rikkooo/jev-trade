import { pathToFileURL } from "node:url";

import { sha256Canonical } from "@/modules/ledger/canonical-json";
import { verifyManualFixtureProof } from "@/modules/ledger/root-chain";
import { computeMarketRisk } from "@/modules/policy";
import { multiclassBrier, scoredLogLoss } from "@/modules/scorecard";
import {
  buildFixtureSourceManifest,
  formatFixtureKnownEventEvidence,
  getForecastById,
  rebuildFixturePolicyDecision,
  rebuildFixtureDecisionStateHash,
  rebuildFixtureJudgmentInputHash,
} from "@/modules/view-model";

import {
  buildFixtureManualProof,
  fixtureForecastContentHash,
  fixtureOutcomeHash,
  fixturePolicyTraceHash,
  verifyFixtureManifestAnchor,
} from "./fixture-proof";

export interface FixtureForecastVerification {
  readonly valid: true;
  readonly forecastId: string;
  readonly dataClass: "synthetic_fixture";
  readonly prospectiveScorecardEligible: false;
  readonly externalAttestation: "absent_fixture_manual_proof_only";
  readonly canonicalContentHash: string;
  readonly decisionStateHash: {
    readonly value: string;
    readonly formatValid: boolean;
    readonly reconstruction: "verified_from_synthetic_source_manifest";
  };
  readonly sourceManifest: {
    readonly version: string;
    readonly referenceCount: number;
    readonly manifestHash: string;
    readonly hashMatches: true;
  };
  readonly judgmentInput: {
    readonly inputHash: string | null;
    readonly reconstructionMatches: true;
    readonly status: "verified" | "not_applicable";
  };
  readonly policy: {
    readonly version: string;
    readonly action: string | null;
    readonly reconstructedAction: string | null;
    readonly reconstructionMatches: true;
    readonly traceHash: string | null;
    readonly orderedGateCount: number;
  };
  readonly outcome: {
    readonly status: "unresolved" | "resolved";
    readonly activeLabel: string | null;
    readonly outcomeHash: string | null;
    readonly brierScore: number | null;
    readonly logLoss: number | null;
    readonly excludedFromPublicScorecard: true;
  };
  readonly rootMembership: {
    readonly batchKey: string;
    readonly rootHash: string;
    readonly proofHash: string;
    readonly membershipValid: true;
    readonly proofValid: true;
  };
}

export function parseForecastId(
  argumentsAfterScript: readonly string[],
): string {
  const args =
    argumentsAfterScript[0] === "--"
      ? argumentsAfterScript.slice(1)
      : [...argumentsAfterScript];
  if (args.length === 1 && args[0] && !args[0].startsWith("-")) {
    return args[0];
  }
  if (args.length === 2 && args[0] === "--id" && args[1]) {
    return args[1];
  }
  const equalsValue = args.length === 1 ? args[0]?.match(/^--id=(.+)$/) : null;
  if (equalsValue?.[1]) return equalsValue[1];
  throw new Error(
    "usage: pnpm verify:forecast -- --id <fixture-forecast-id> (a positional ID is also accepted)",
  );
}

export function verifyFixtureForecast(
  forecastId: string,
): FixtureForecastVerification {
  const forecast = getForecastById(forecastId);
  if (!forecast) {
    throw new Error(`unknown fixture forecast ID: ${forecastId}`);
  }
  const contentHash = fixtureForecastContentHash(forecast);
  const rebuiltMarketRisk = computeMarketRisk(forecast.marketRisk.inputs);
  const componentIndex = Math.round(
    forecast.marketRisk.components.reduce(
      (total, component) => total + (component.value * component.weight) / 100,
      0,
    ),
  );
  if (
    rebuiltMarketRisk.index !== forecast.marketRisk.index ||
    rebuiltMarketRisk.band !== forecast.marketRisk.band ||
    rebuiltMarketRisk.formulaVersion !== forecast.marketRisk.formulaVersion ||
    componentIndex !== forecast.marketRisk.index ||
    (forecast.policyInput?.kind === "position" &&
      (forecast.policyInput.marketRisk.index !== forecast.marketRisk.index ||
        forecast.policyInput.marketRisk.band !== forecast.marketRisk.band))
  ) {
    throw new Error(`fixture forecast ${forecastId} market-risk mismatch`);
  }
  const knownEventEvidence = forecast.evidence.find(
    ({ label }) => label === "Known structured event",
  );
  if (
    knownEventEvidence?.value !==
    formatFixtureKnownEventEvidence(
      forecast.marketRisk.inputs.sessionsToKnownEvent,
    )
  ) {
    throw new Error(
      `fixture forecast ${forecastId} known-event evidence mismatch`,
    );
  }
  const orderedGates = forecast.gates.every(
    (gate, index) => gate.order === index + 1,
  );
  if (!orderedGates) {
    throw new Error(`fixture forecast ${forecastId} has an invalid gate order`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(forecast.decisionStateHash)) {
    throw new Error(`fixture forecast ${forecastId} has an invalid state hash`);
  }
  const sourceManifest = buildFixtureSourceManifest(forecast);
  const sourceManifestHash = sha256Canonical(sourceManifest);
  if (
    sourceManifest.references.length !== forecast.sourceReferenceCount ||
    sourceManifestHash !== forecast.sourceManifestHash
  ) {
    throw new Error(`fixture forecast ${forecastId} source manifest mismatch`);
  }
  const rebuiltStateHash = rebuildFixtureDecisionStateHash(forecast);
  if (rebuiltStateHash !== forecast.decisionStateHash) {
    throw new Error(
      `fixture forecast ${forecastId} state reconstruction failed`,
    );
  }
  const rebuiltJudgmentInputHash =
    forecast.judgmentInputHash === null
      ? null
      : rebuildFixtureJudgmentInputHash(forecast);
  if (rebuiltJudgmentInputHash !== forecast.judgmentInputHash) {
    throw new Error(
      `fixture forecast ${forecastId} judgment input reconstruction failed`,
    );
  }
  const reconstructedDecision = rebuildFixturePolicyDecision(forecast);
  const reconstructedAction = reconstructedDecision?.action ?? null;
  if (
    reconstructedAction !== forecast.action ||
    reconstructedDecision?.policyVersion !==
      (forecast.policyInput ? forecast.policyVersion : undefined) ||
    sha256Canonical(reconstructedDecision?.gates ?? []) !==
      sha256Canonical(forecast.gates)
  ) {
    throw new Error(
      `fixture forecast ${forecastId} policy reconstruction failed`,
    );
  }
  if (
    !forecast.policyInput &&
    (forecast.judgment !== null ||
      forecast.action !== null ||
      forecast.gates.length !== 0)
  ) {
    throw new Error(
      `fixture forecast ${forecastId} invented output for an unavailable decision`,
    );
  }
  const proof = buildFixtureManualProof();
  verifyFixtureManifestAnchor(proof);
  const proofResult = verifyManualFixtureProof(proof);
  const root = proof.chain[0];
  if (!root) throw new Error("fixture proof chain is empty");
  const membership = root.commitments.find(
    (commitment) => commitment.forecastId === forecastId,
  );
  if (!membership || membership.contentHash !== contentHash) {
    throw new Error(`fixture forecast ${forecastId} is not in the proof root`);
  }
  const score =
    forecast.outcome && forecast.judgment
      ? {
          brier: multiclassBrier(
            forecast.judgment.probabilities,
            forecast.outcome.label,
          ),
          logLoss: scoredLogLoss(
            forecast.judgment.probabilities,
            forecast.outcome.label,
          ),
        }
      : null;
  return {
    valid: true,
    forecastId,
    dataClass: "synthetic_fixture",
    prospectiveScorecardEligible: false,
    externalAttestation: "absent_fixture_manual_proof_only",
    canonicalContentHash: contentHash,
    decisionStateHash: {
      value: forecast.decisionStateHash,
      formatValid: true,
      reconstruction: "verified_from_synthetic_source_manifest",
    },
    sourceManifest: {
      version: sourceManifest.version,
      referenceCount: sourceManifest.references.length,
      manifestHash: sourceManifestHash,
      hashMatches: true,
    },
    judgmentInput: {
      inputHash: rebuiltJudgmentInputHash,
      reconstructionMatches: true,
      status: rebuiltJudgmentInputHash ? "verified" : "not_applicable",
    },
    policy: {
      version: forecast.policyVersion,
      action: forecast.action,
      reconstructedAction,
      reconstructionMatches: true,
      traceHash: fixturePolicyTraceHash(forecast),
      orderedGateCount: reconstructedDecision?.gates.length ?? 0,
    },
    outcome: {
      status: forecast.outcome ? "resolved" : "unresolved",
      activeLabel: forecast.outcome?.label ?? null,
      outcomeHash: fixtureOutcomeHash(forecast),
      brierScore: score?.brier ?? null,
      logLoss: score?.logLoss ?? null,
      excludedFromPublicScorecard: true,
    },
    rootMembership: {
      batchKey: root.batchKey,
      rootHash: root.rootHash,
      proofHash: proofResult.proofHash,
      membershipValid: true,
      proofValid: true,
    },
  };
}

async function main(): Promise<void> {
  const forecastId = parseForecastId(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify(verifyFixtureForecast(forecastId), null, 2)}\n`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "forecast verification failed"}\n`,
    );
    process.exitCode = 1;
  });
}
