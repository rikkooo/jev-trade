import { sha256Canonical } from "@/modules/ledger/canonical-json";
import {
  buildLedgerRoot,
  createManualFixtureProof,
  type ForecastCommitment,
} from "@/modules/ledger/root-chain";
import { FIXTURE_FORECASTS, type ForecastView } from "@/modules/view-model";

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
    forecastStatus: forecast.forecastStatus,
    action: forecast.action,
    judgment: forecast.judgment,
    marketRisk: forecast.marketRisk,
    positionRisk: forecast.positionRisk,
    gates: forecast.gates,
    outcome: forecast.outcome ?? null,
    correction: forecast.correction ?? null,
    voidReason: forecast.voidReason ?? null,
  };
}

export function fixtureForecastContentHash(forecast: ForecastView): string {
  return sha256Canonical(fixtureForecastEnvelope(forecast));
}

export function fixturePolicyTraceHash(forecast: ForecastView): string {
  return sha256Canonical({
    version: forecast.policyVersion,
    action: forecast.action,
    gates: forecast.gates,
    positionRisk: forecast.positionRisk,
  });
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

export function buildFixtureCommitments(): readonly ForecastCommitment[] {
  return FIXTURE_FORECASTS.map((forecast) => ({
    forecastId: forecast.id,
    contentHash: fixtureForecastContentHash(forecast),
  }));
}

export function buildFixtureManualProof() {
  const root = buildLedgerRoot({
    batchKey: "jev-trade-public-fixture-v1",
    closedAt: FIXTURE_PROOF_TIMESTAMP,
    attestationDeadline: FIXTURE_PROOF_TIMESTAMP,
    previousRootHash: null,
    commitments: buildFixtureCommitments(),
  });
  return createManualFixtureProof([root], FIXTURE_PROOF_TIMESTAMP);
}
