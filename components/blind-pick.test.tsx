// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { useCallback, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getForecastById } from "@/modules/view-model";

import { AnalyticsConsent } from "./analytics-consent";
import {
  BlindDecisionBoundary,
  FIXTURE_REVEAL_TIMEOUT_MS,
} from "./blind-decision-boundary";
import { BlindPick } from "./blind-pick";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("BlindPick", () => {
  function BlindPickHarness({
    forecastId,
    symbol,
    onReveal,
  }: {
    forecastId: string;
    symbol: string;
    onReveal: () => Promise<void>;
  }) {
    const [revealed, setRevealed] = useState(false);
    const reveal = useCallback(async () => {
      await onReveal();
      setRevealed(true);
    }, [onReveal]);
    return (
      <BlindPick
        forecastId={forecastId}
        symbol={symbol}
        revealed={revealed}
        onRevealRequest={reveal}
      />
    );
  }

  it("freezes one browser-local choice and reveals without embedding the call", async () => {
    const onRevealRequest = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <BlindPickHarness
        forecastId="01K5D3JEVACME5SPRINT0001"
        symbol="ACME"
        onReveal={onRevealRequest}
      />,
    );

    expect(screen.queryByText(/Jev judged/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pick down/i }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your frozen pick: DOWN",
    );
    expect(screen.getByRole("button", { name: /pick up/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /reveal Jev/i }));
    await screen.findByText(/Decision workspace unlocked/i);
    expect(onRevealRequest).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <BlindPickHarness
        forecastId="01K5D3JEVACME5SPRINT0001"
        symbol="ACME"
        onReveal={onRevealRequest}
      />,
    );
    await screen.findByText(/Decision workspace unlocked/i);
    expect(screen.getByText(/Your frozen pick: DOWN/i)).toBeInTheDocument();
  });

  it("can reveal without creating a pick", async () => {
    render(
      <BlindPickHarness
        forecastId="01K5D3JEVACME5SPRINT0002"
        symbol="ACME"
        onReveal={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reveal without playing/i }),
    );
    await screen.findByText(/Decision workspace unlocked/i);
    expect(
      window.localStorage.getItem("jev-trade.pick.01K5D3JEVACME5SPRINT0002"),
    ).toBeNull();
  });

  it("never re-enables a pick after a persisted reveal fails to restore", async () => {
    const forecastId = "01K5D3JEVACME5SPRINT0003";
    window.localStorage.setItem(`jev-trade.reveal.${forecastId}`, "true");
    render(
      <BlindPickHarness
        forecastId={forecastId}
        symbol="ACME"
        onReveal={vi.fn().mockRejectedValue(new Error("temporary outage"))}
      />,
    );

    await screen.findByRole("alert");
    const up = screen.getByRole("button", { name: /pick up/i });
    expect(up).toBeDisabled();
    fireEvent.click(up);
    expect(
      window.localStorage.getItem(`jev-trade.pick.${forecastId}`),
    ).toBeNull();
  });

  it("stays usable when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    const { unmount } = render(
      <BlindPickHarness
        forecastId="01K5D3JEVACME5SPRINT0004"
        symbol="ACME"
        onReveal={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const up = await screen.findByRole("button", { name: /pick up/i });
    expect(up).toBeEnabled();
    fireEvent.click(up);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "Your frozen pick: UP",
    );
    expect(screen.getByText(/open page only/i)).toBeInTheDocument();

    unmount();
    render(
      <BlindPickHarness
        forecastId="01K5D3JEVACME5SPRINT0004"
        symbol="ACME"
        onReveal={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(
      await screen.findByRole("button", { name: /pick up/i }),
    ).toBeEnabled();
    expect(screen.queryByText(/Your frozen pick: UP/i)).not.toBeInTheDocument();
  });
});

describe("BlindDecisionBoundary", () => {
  it("fetches the revealed projection only after the visitor reveals", async () => {
    const forecast = getForecastById("01K5D3JEVACME5SPRINT0001");
    if (!forecast) throw new Error("fixture forecast missing");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ forecast }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BlindDecisionBoundary
        reveal={{ forecastId: forecast.id, symbol: forecast.symbol }}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/62%/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/UP leads the distribution/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/code-owned policy action/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /reveal without playing/i }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/UP leads the distribution/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/code-owned policy action/i)).toBeInTheDocument();
  });

  it("times out a stalled reveal, preserves the pick, and permits retry", async () => {
    vi.useFakeTimers();
    const forecast = getForecastById("01K5D3JEVACME5SPRINT0001");
    if (!forecast) throw new Error("fixture forecast missing");
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Timed out", "AbortError")),
          );
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ forecast }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BlindDecisionBoundary
        reveal={{ forecastId: forecast.id, symbol: forecast.symbol }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pick down/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal Jev/i }));
    await act(() => vi.advanceTimersByTimeAsync(FIXTURE_REVEAL_TIMEOUT_MS));
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/i);
    expect(screen.getByRole("status")).toHaveTextContent(
      /Your frozen pick: DOWN/i,
    );

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal Jev/i }));
    expect(
      await screen.findByText(/UP leads the distribution/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("AnalyticsConsent", () => {
  it("keeps the app usable when browser storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    render(<AnalyticsConsent />);
    fireEvent.click(screen.getByRole("button", { name: /decline analytics/i }));
    expect(screen.getByText(/Analytics are off/i)).toBeInTheDocument();
  });

  it("declines without generating an analytics identifier", () => {
    render(<AnalyticsConsent />);

    expect(window.localStorage.getItem("jev-trade.analytics.id.v1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /decline analytics/i }));
    expect(window.localStorage.getItem("jev-trade.analytics.consent.v1")).toBe(
      "declined",
    );
    expect(window.localStorage.getItem("jev-trade.analytics.id.v1")).toBeNull();
    expect(screen.getByText(/Analytics are off/i)).toBeInTheDocument();
  });

  it("rotates an expired opted-in browser identifier for another 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    window.localStorage.setItem("jev-trade.analytics.consent.v1", "accepted");
    window.localStorage.setItem(
      "jev-trade.analytics.id.v1",
      JSON.stringify({
        id: "expired-id",
        createdAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-31T00:00:00.000Z",
      }),
    );

    render(<AnalyticsConsent />);

    const record = JSON.parse(
      window.localStorage.getItem("jev-trade.analytics.id.v1") ?? "{}",
    ) as { id?: string; createdAt?: string; expiresAt?: string };
    expect(record.id).toBeTruthy();
    expect(record.id).not.toBe("expired-id");
    expect(record.createdAt).toBe("2026-09-19T12:00:00.000Z");
    expect(record.expiresAt).toBe("2026-10-19T12:00:00.000Z");
  });
});
