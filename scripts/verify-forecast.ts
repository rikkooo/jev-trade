import { pathToFileURL } from "node:url";

import { verifyManualFixtureProof } from "@/modules/ledger/root-chain";
import { multiclassBrier, scoredLogLoss } from "@/modules/scorecard";
import { getForecastById } from "@/modules/view-model";

import {
  buildFixtureManualProof,
  fixtureForecastContentHash,
  fixtureOutcomeHash,
  fixturePolicyTraceHash,
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
    readonly reconstruction: "unavailable_without_source_manifest";
  };
  readonly policy: {
    readonly version: string;
    readonly action: string;
    readonly traceHash: string;
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
  const orderedGates = forecast.gates.every(
    (gate, index) => gate.order === index + 1,
  );
  if (!orderedGates) {
    throw new Error(`fixture forecast ${forecastId} has an invalid gate order`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(forecast.decisionStateHash)) {
    throw new Error(`fixture forecast ${forecastId} has an invalid state hash`);
  }
  const proof = buildFixtureManualProof();
  const proofResult = verifyManualFixtureProof(proof);
  const root = proof.chain[0];
  if (!root) throw new Error("fixture proof chain is empty");
  const membership = root.commitments.find(
    (commitment) => commitment.forecastId === forecastId,
  );
  if (!membership || membership.contentHash !== contentHash) {
    throw new Error(`fixture forecast ${forecastId} is not in the proof root`);
  }
  const score = forecast.outcome
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
      reconstruction: "unavailable_without_source_manifest",
    },
    policy: {
      version: forecast.policyVersion,
      action: forecast.action,
      traceHash: fixturePolicyTraceHash(forecast),
      orderedGateCount: forecast.gates.length,
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
