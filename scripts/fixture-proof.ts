import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sha256Canonical } from "@/modules/ledger/canonical-json";
import {
  buildLedgerRoot,
  createManualFixtureProof,
  verifyManualFixtureProof,
  type ForecastCommitment,
} from "@/modules/ledger/root-chain";
import {
  FIXTURE_AUDIT_FORECASTS,
  type ForecastView,
} from "@/modules/view-model";

export const FIXTURE_PROOF_TIMESTAMP = "2026-09-19T10:00:00.000Z";
export const FIXTURE_FORECAST_PROOF_VERSION =
  "jev-fixture-forecast-proof/v1" as const;

export function fixtureForecastEnvelope(forecast: ForecastView) {
  return {
    version: FIXTURE_FORECAST_PROOF_VERSION,
    dataClass: "synthetic_fixture" as const,
    id: forecast.id,
    symbol: forecast.symbol,
    mode: forecast.mode,
    horizonSessions: forecast.horizonSessions,
    neutralBandPercent: forecast.neutralBandPercent,
    cutoffAt: forecast.cutoffAt,
    latestMarketSession: forecast.latestMarketSession,
    modelVersion: forecast.modelVersion,
    questionVersion: forecast.questionVersion,
    policyVersion: forecast.policyVersion,
    methodologyVersion: forecast.methodologyVersion,
    decisionStateHash: forecast.decisionStateHash,
    judgmentInputHash: forecast.judgmentInputHash,
    sourceManifestHash: forecast.sourceManifestHash,
    sourceReferenceCount: forecast.sourceReferenceCount,
    displayState: forecast.displayState,
    forecastStatus: forecast.forecastStatus,
    action: forecast.action,
    judgment: forecast.judgment,
    policyInput: forecast.policyInput,
    marketRisk: forecast.marketRisk,
    positionRisk: forecast.positionRisk,
    gates: forecast.gates,
    timeline: forecast.timeline,
    pickEligible: forecast.pickEligible,
    stateMessage: forecast.stateMessage,
    outcome: forecast.outcome ?? null,
    correction: forecast.correction ?? null,
    voidReason: forecast.voidReason ?? null,
  };
}

export function fixtureForecastContentHash(forecast: ForecastView): string {
  return sha256Canonical(fixtureForecastEnvelope(forecast));
}

export function fixturePolicyTraceHash(forecast: ForecastView): string | null {
  return forecast.policyInput
    ? sha256Canonical({
        version: forecast.policyVersion,
        input: forecast.policyInput,
        action: forecast.action,
        gates: forecast.gates,
        positionRisk: forecast.positionRisk,
      })
    : null;
}

export function fixtureOutcomeHash(forecast: ForecastView): string | null {
  return forecast.outcome
    ? sha256Canonical({
        forecastId: forecast.id,
        outcome: forecast.outcome,
        correction: forecast.correction ?? null,
      })
    : null;
}

export function buildFixtureCommitments(
  forecasts: readonly ForecastView[] = FIXTURE_AUDIT_FORECASTS,
): readonly ForecastCommitment[] {
  return forecasts.map((forecast) => ({
    forecastId: forecast.id,
    contentHash: fixtureForecastContentHash(forecast),
  }));
}

export function buildFixtureManualProof(
  forecasts: readonly ForecastView[] = FIXTURE_AUDIT_FORECASTS,
) {
  const root = buildLedgerRoot({
    batchKey: "jev-trade-public-fixture-v1",
    closedAt: FIXTURE_PROOF_TIMESTAMP,
    attestationDeadline: FIXTURE_PROOF_TIMESTAMP,
    previousRootHash: null,
    commitments: buildFixtureCommitments(forecasts),
  });
  return createManualFixtureProof([root], FIXTURE_PROOF_TIMESTAMP);
}

export interface FixtureManifestAnchor {
  readonly rootHash: string;
  readonly proofHash: string;
  readonly commitmentsHash: string;
  readonly forecastCount: number;
}

export function readFixtureManifestAnchor(): FixtureManifestAnchor {
  const manifestPath = fileURLToPath(
    new URL("../public/fixture-manifest.json", import.meta.url),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    fixtureProof?: Partial<FixtureManifestAnchor>;
  };
  const anchor = manifest.fixtureProof;
  if (
    !anchor ||
    typeof anchor.rootHash !== "string" ||
    typeof anchor.proofHash !== "string" ||
    typeof anchor.commitmentsHash !== "string" ||
    typeof anchor.forecastCount !== "number"
  ) {
    throw new Error("public fixture manifest has no complete proof anchor");
  }
  return anchor as FixtureManifestAnchor;
}

export function verifyFixtureManifestAnchor(
  proof = buildFixtureManualProof(),
  anchor = readFixtureManifestAnchor(),
): void {
  const root = proof.chain[0];
  if (!root) throw new Error("fixture proof chain is empty");
  const proofHash = verifyManualFixtureProof(proof).proofHash;
  const commitmentsHash = sha256Canonical(root.commitments);
  if (
    root.rootHash !== anchor.rootHash ||
    proofHash !== anchor.proofHash ||
    commitmentsHash !== anchor.commitmentsHash ||
    root.forecastCount !== anchor.forecastCount
  ) {
    throw new Error(
      "fixture proof drifted from public/fixture-manifest.json; review the fixture diff and deliberately repin the manifest",
    );
  }
}
