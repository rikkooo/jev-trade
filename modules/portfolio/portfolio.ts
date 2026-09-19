import type { PaperEvent } from "@/modules/ledger/types";

import type { PaperPortfolioEvent, PaperPortfolioProjection } from "./types";

interface MutablePosition {
  symbol: string;
  shares: number;
  markPrice: number;
  forecastIds: Set<string>;
}

interface CommonPositionEventInput {
  readonly id: string;
  readonly symbol: string;
  readonly forecastId: string;
  readonly createdAt: string;
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive`);
  }
}

function requireIdentity(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

export function createEntryEvent(
  input: CommonPositionEventInput & {
    readonly shares: number;
    readonly fillPrice: number;
  },
): PaperEvent {
  requireIdentity(input.id, "event id");
  requireIdentity(input.symbol, "symbol");
  requireIdentity(input.forecastId, "forecast id");
  requirePositive(input.shares, "shares");
  requirePositive(input.fillPrice, "fill price");
  if (!Number.isInteger(input.shares)) {
    throw new Error("entry shares must be an integer");
  }
  return {
    id: input.id,
    type: "entry",
    symbol: input.symbol,
    forecastId: input.forecastId,
    cashDelta: -(input.shares * input.fillPrice),
    sharesDelta: input.shares,
    price: input.fillPrice,
    createdAt: input.createdAt,
  };
}

export function createExitEvent(
  input: CommonPositionEventInput & {
    readonly shares: number;
    readonly fillPrice: number;
    readonly reason?: string;
    readonly type?: "exit" | "stop" | "expiry";
  },
): PaperEvent {
  requireIdentity(input.id, "event id");
  requireIdentity(input.symbol, "symbol");
  requireIdentity(input.forecastId, "forecast id");
  requirePositive(input.shares, "shares");
  requirePositive(input.fillPrice, "fill price");
  if (!Number.isInteger(input.shares)) {
    throw new Error("exit shares must be an integer");
  }
  return {
    id: input.id,
    type: input.type ?? "exit",
    symbol: input.symbol,
    forecastId: input.forecastId,
    cashDelta: input.shares * input.fillPrice,
    sharesDelta: -input.shares,
    price: input.fillPrice,
    ...(input.reason ? { reason: input.reason } : {}),
    createdAt: input.createdAt,
  };
}

export function createMarkEvent(input: {
  readonly id: string;
  readonly symbol: string;
  readonly price: number;
  readonly createdAt: string;
}): PaperEvent {
  requireIdentity(input.id, "event id");
  requireIdentity(input.symbol, "symbol");
  requirePositive(input.price, "mark price");
  return {
    id: input.id,
    type: "mark",
    symbol: input.symbol,
    cashDelta: 0,
    sharesDelta: 0,
    price: input.price,
    createdAt: input.createdAt,
  };
}

export function createSplitEvent(
  input: CommonPositionEventInput & {
    readonly sharesBefore: number;
    readonly ratio: number;
  },
): PaperEvent {
  requireIdentity(input.id, "event id");
  requireIdentity(input.symbol, "symbol");
  requireIdentity(input.forecastId, "forecast id");
  requirePositive(input.sharesBefore, "shares before split");
  requirePositive(input.ratio, "split ratio");
  const sharesAfter = input.sharesBefore * input.ratio;
  const sharesDelta = sharesAfter - input.sharesBefore;
  if (!Number.isInteger(sharesAfter) || !Number.isInteger(sharesDelta)) {
    throw new Error("split produces unsupported fractional paper shares");
  }
  return {
    id: input.id,
    type: "split",
    symbol: input.symbol,
    forecastId: input.forecastId,
    cashDelta: 0,
    sharesDelta,
    reason: `confirmed split ratio ${input.ratio}`,
    createdAt: input.createdAt,
  };
}

export function createCashDividendEvent(
  input: CommonPositionEventInput & {
    readonly shares: number;
    readonly cashPerShare: number;
  },
): PaperEvent {
  requireIdentity(input.id, "event id");
  requireIdentity(input.symbol, "symbol");
  requireIdentity(input.forecastId, "forecast id");
  requirePositive(input.shares, "shares");
  requirePositive(input.cashPerShare, "cash per share");
  return {
    id: input.id,
    type: "cash_dividend",
    symbol: input.symbol,
    forecastId: input.forecastId,
    cashDelta: input.shares * input.cashPerShare,
    sharesDelta: 0,
    price: input.cashPerShare,
    createdAt: input.createdAt,
  };
}

function validateEvent(event: PaperPortfolioEvent): void {
  requireIdentity(event.id, "event id");
  if (
    !Number.isFinite(event.cashDelta) ||
    !Number.isFinite(event.sharesDelta)
  ) {
    throw new Error(`paper event ${event.id} has a non-finite delta`);
  }
  if ((event.sharesDelta !== 0 || event.type === "mark") && !event.symbol) {
    throw new Error(`paper event ${event.id} requires a symbol`);
  }
  if (
    event.price !== undefined &&
    (!Number.isFinite(event.price) || event.price <= 0)
  ) {
    throw new Error(`paper event ${event.id} has an invalid price`);
  }
  const approximatelyEqual = (left: number, right: number) =>
    Math.abs(left - right) <=
    1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
  if (event.type === "entry") {
    if (
      !event.price ||
      !Number.isInteger(event.sharesDelta) ||
      event.sharesDelta <= 0 ||
      !approximatelyEqual(event.cashDelta, -event.sharesDelta * event.price)
    ) {
      throw new Error(`paper entry ${event.id} has inconsistent deltas`);
    }
  }
  if (["exit", "stop", "expiry"].includes(event.type)) {
    if (
      !event.price ||
      !Number.isInteger(event.sharesDelta) ||
      event.sharesDelta >= 0 ||
      !approximatelyEqual(event.cashDelta, -event.sharesDelta * event.price)
    ) {
      throw new Error(`paper exit ${event.id} has inconsistent deltas`);
    }
  }
  if (
    event.type === "mark" &&
    (event.cashDelta !== 0 || event.sharesDelta !== 0 || !event.price)
  ) {
    throw new Error(`paper mark ${event.id} has inconsistent deltas`);
  }
  if (
    event.type === "split" &&
    (event.cashDelta !== 0 ||
      !Number.isInteger(event.sharesDelta) ||
      event.sharesDelta === 0)
  ) {
    throw new Error(`paper split ${event.id} has inconsistent deltas`);
  }
  if (
    event.type === "cash_dividend" &&
    (event.cashDelta <= 0 || event.sharesDelta !== 0 || !event.price)
  ) {
    throw new Error(`paper dividend ${event.id} has inconsistent deltas`);
  }
}

function eventSignature(event: PaperPortfolioEvent): string {
  return JSON.stringify([
    event.id,
    event.type,
    event.symbol ?? null,
    event.forecastId ?? null,
    event.cashDelta,
    event.sharesDelta,
    event.price ?? null,
    event.correctionOfEventId ?? null,
    event.reason ?? null,
    event.createdAt,
  ]);
}

export function projectPaperPortfolio(
  events: readonly PaperPortfolioEvent[],
): PaperPortfolioProjection {
  let cash = 0;
  const positions = new Map<string, MutablePosition>();
  const seen = new Map<string, string>();
  const appliedEventIds: string[] = [];
  const duplicateEventIds: string[] = [];

  for (const event of events) {
    const signature = eventSignature(event);
    const existingSignature = seen.get(event.id);
    if (existingSignature !== undefined) {
      if (existingSignature !== signature) {
        throw new Error(`paper event id collision for ${event.id}`);
      }
      duplicateEventIds.push(event.id);
      continue;
    }
    validateEvent(event);
    seen.set(event.id, signature);
    appliedEventIds.push(event.id);
    cash += event.cashDelta;

    if (!event.symbol) continue;
    const existing = positions.get(event.symbol) ?? {
      symbol: event.symbol,
      shares: 0,
      markPrice: 0,
      forecastIds: new Set<string>(),
    };
    const previousShares = existing.shares;
    const previousValue = previousShares * existing.markPrice;
    const nextShares = previousShares + event.sharesDelta;
    if (nextShares < 0) {
      throw new Error(`paper event ${event.id} would create a short position`);
    }
    if (event.type === "split" && previousShares <= 0) {
      throw new Error(`split event ${event.id} has no open position`);
    }
    if (
      event.type === "cash_dividend" &&
      event.price !== undefined &&
      Math.abs(event.cashDelta - previousShares * event.price) >
        1e-8 * Math.max(1, Math.abs(event.cashDelta))
    ) {
      throw new Error(`dividend event ${event.id} does not match open shares`);
    }

    existing.shares = nextShares;
    if (event.type === "split" && nextShares > 0) {
      existing.markPrice = previousValue / nextShares;
    } else if (event.price !== undefined && event.type !== "cash_dividend") {
      existing.markPrice = event.price;
    }
    if (event.forecastId) existing.forecastIds.add(event.forecastId);
    positions.set(event.symbol, existing);
  }

  const positionRecord: Record<
    string,
    {
      symbol: string;
      shares: number;
      markPrice: number;
      marketValue: number;
      forecastIds: readonly string[];
    }
  > = {};
  let marketValue = 0;
  for (const [symbol, position] of [...positions.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const value = position.shares * position.markPrice;
    marketValue += value;
    positionRecord[symbol] = {
      symbol,
      shares: position.shares,
      markPrice: position.markPrice,
      marketValue: value,
      forecastIds: [...position.forecastIds].sort(),
    };
  }

  return {
    cash,
    marketValue,
    equity: cash + marketValue,
    positions: positionRecord,
    appliedEventIds,
    duplicateEventIds,
    projectionVersion: "paper-portfolio-v1",
  };
}
