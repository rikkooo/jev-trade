import type { Direction, ForecastMode } from "@/modules/ledger/types";

export const OUTCOME_CONTRACT_VERSION = "direction-outcome-v1" as const;

export function flatBandFor(
  mode: ForecastMode,
  horizonSessions: number,
): number {
  if (mode === "position" && horizonSessions === 20) return 0.02;
  if (mode === "sprint" && horizonSessions === 1) return 0.005;
  if (mode === "sprint" && horizonSessions === 5) return 0.015;
  throw new Error(`unsupported outcome contract: ${mode}/${horizonSessions}`);
}

export function resolveDirectionOutcome(
  adjustedReturn: number,
  mode: ForecastMode,
  horizonSessions: number,
): Direction {
  if (!Number.isFinite(adjustedReturn)) {
    throw new Error("adjusted return must be finite");
  }
  const flatBand = flatBandFor(mode, horizonSessions);
  if (adjustedReturn > flatBand) return "up";
  if (adjustedReturn < -flatBand) return "down";
  return "flat";
}
