"use client";

import { EyeOff } from "lucide-react";
import { useCallback, useState } from "react";

import type { BlindRevealReference, ForecastView } from "@/modules/view-model";

import { BlindPick } from "./blind-pick";
import { DecisionWorkspace } from "./decision-workspace";

export function BlindDecisionBoundary({
  reveal,
}: {
  readonly reveal: BlindRevealReference;
}) {
  const [forecast, setForecast] = useState<ForecastView | null>(null);

  const requestReveal = useCallback(async () => {
    if (forecast) return;
    const response = await fetch(
      `/api/v1/fixture-reveal/${encodeURIComponent(reveal.forecastId)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("fixture reveal failed");
    const payload = (await response.json()) as { forecast?: ForecastView };
    if (!payload.forecast || payload.forecast.id !== reveal.forecastId) {
      throw new Error("fixture reveal identity mismatch");
    }
    setForecast(payload.forecast);
  }, [forecast, reveal.forecastId]);

  return (
    <>
      <BlindPick
        forecastId={reveal.forecastId}
        symbol={reveal.symbol}
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
