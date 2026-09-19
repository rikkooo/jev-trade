"use client";

import { Eye, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { Direction } from "@/modules/view-model";

import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";

interface BlindPickProps {
  readonly forecastId: string;
  readonly symbol: string;
  readonly revealed: boolean;
  readonly onRevealRequest: () => Promise<void>;
}

function pickKey(forecastId: string): string {
  return `jev-trade.pick.${forecastId}`;
}

function revealKey(forecastId: string): string {
  return `jev-trade.reveal.${forecastId}`;
}

export function BlindPick({
  forecastId,
  symbol,
  revealed,
  onRevealRequest,
}: BlindPickProps) {
  const [pick, setPick] = useState<Direction | null>(null);
  const [wasRevealed, setWasRevealed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    const savedPick = readBrowserStorage(pickKey(forecastId));
    if (savedPick === "up" || savedPick === "flat" || savedPick === "down") {
      // Browser-local picks are restored only after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPick(savedPick);
    }
    const persistedReveal =
      readBrowserStorage(revealKey(forecastId)) === "true";
    setWasRevealed(persistedReveal);
    setHydrated(true);
    if (persistedReveal) {
      setLoading(true);
      void onRevealRequest()
        .catch(() => setError("The fixture reveal could not be loaded."))
        .finally(() => setLoading(false));
    }
  }, [forecastId, onRevealRequest]);

  function freezePick(choice: Direction) {
    if (pick || revealed || wasRevealed) return;
    if (!writeBrowserStorage(pickKey(forecastId), choice)) {
      setStorageUnavailable(true);
    }
    setPick(choice);
  }

  async function reveal() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onRevealRequest();
      if (!writeBrowserStorage(revealKey(forecastId), "true")) {
        setStorageUnavailable(true);
      }
      setWasRevealed(true);
    } catch {
      setError(
        "The fixture reveal could not be loaded. Your pick remains frozen locally.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="blind-pick panel-accent"
      aria-labelledby="blind-pick-title"
    >
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">BLIND PICK · BROWSER-LOCAL DEMO</p>
          <h2 id="blind-pick-title">Call {symbol} before the reveal</h2>
        </div>
        <span className="local-only-badge">
          <LockKeyhole aria-hidden="true" /> Local only
        </span>
      </div>

      {!revealed ? (
        <>
          <p className="muted">
            Choose the fixed-horizon direction, or skip. Your first choice is
            frozen in this browser for this fixture forecast.
          </p>
          <div className="pick-grid" aria-label="Choose a direction">
            {(["up", "flat", "down"] as const).map((choice) => (
              <button
                type="button"
                className={`pick-button pick-${choice}${pick === choice ? " selected" : ""}`}
                key={choice}
                onClick={() => freezePick(choice)}
                disabled={!hydrated || pick !== null || loading || wasRevealed}
                aria-pressed={pick === choice}
              >
                <span>
                  {choice === "up" ? "↗" : choice === "down" ? "↘" : "→"}
                </span>
                Pick {choice}
              </button>
            ))}
          </div>
          {pick ? (
            <div className="pick-lock" role="status">
              <LockKeyhole aria-hidden="true" />
              Your frozen pick: <strong>{pick.toUpperCase()}</strong>
            </div>
          ) : null}
          {storageUnavailable ? (
            <p className="muted" role="status">
              Browser storage is unavailable. This state is frozen for this open
              page only.
            </p>
          ) : null}
          <div className="reveal-actions">
            {pick ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => void reveal()}
                disabled={loading}
              >
                <Eye aria-hidden="true" /> {loading ? "Opening…" : "Reveal Jev"}
              </button>
            ) : (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void reveal()}
                disabled={!hydrated || loading}
              >
                {loading ? "Opening…" : "Reveal without playing"}
              </button>
            )}
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="reveal-result" aria-live="polite">
          <Sparkles className="reveal-spark" aria-hidden="true" />
          <div>
            <p className="eyebrow">FROZEN FIXTURE REVEAL</p>
            <h3>Decision workspace unlocked</h3>
            {pick ? (
              <p>Your frozen pick: {pick.toUpperCase()}</p>
            ) : (
              <p>No visitor pick was stored.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
