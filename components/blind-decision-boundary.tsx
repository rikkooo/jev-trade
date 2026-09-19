"use client";

import { EyeOff } from "lucide-react";
import { useCallback, useState } from "react";

import type { BlindRevealReference, ForecastView } from "@/modules/view-model";

import { BlindPick } from "./blind-pick";
import { DecisionWorkspace } from "./decision-workspace";

export const FIXTURE_REVEAL_TIMEOUT_MS = 8_000;

export function BlindDecisionBoundary({
  reveal,
}: {
  readonly reveal: BlindRevealReference;
}) {
  const [forecast, setForecast] = useState<ForecastView | null>(null);

  const requestReveal = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      FIXTURE_REVEAL_TIMEOUT_MS,
    );
    try {
      const response = await fetch(
        `/api/v1/fixture-reveal/${encodeURIComponent(reveal.forecastId)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("fixture reveal failed");
      const payload = (await response.json()) as { forecast?: ForecastView };
      if (!payload.forecast || payload.forecast.id !== reveal.forecastId) {
        throw new Error("fixture reveal identity mismatch");
      }
      setForecast(payload.forecast);
    } finally {
      window.clearTimeout(timeout);
    }
  }, [reveal.forecastId]);

  return (
    <>
      <BlindPick
        forecastId={reveal.forecastId}
        symbol={reveal.symbol}
        revealed={forecast !== null}
        onRevealRequest={requestReveal}
      />
      {forecast ? (
        <DecisionWorkspace forecast={forecast} />
      ) : (
        <section className="blind-locked-panel" aria-live="polite">
          <EyeOff aria-hidden="true" />
          <div>
            <p className="eyebrow">JUDGMENT HIDDEN</p>
            <h2>Make a pick or reveal to open the decision workspace</h2>
            <p>
              Jev probabilities, model-derived scores, policy action, and risk
              panels are absent from the initial page projection.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
