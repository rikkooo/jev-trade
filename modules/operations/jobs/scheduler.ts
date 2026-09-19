import { toTimestamp } from "./clock";
import type { JobOperation, JobQueue } from "./types";

export interface ExchangeSessionWindow {
  readonly session: string;
  readonly closeAt: string;
  readonly expectedBarAt: string;
}

export interface SymbolBarAvailability {
  readonly symbol: string;
  readonly latestCompletedBarSession: string | null;
}

export interface EodEnqueueInput {
  readonly now: string;
  readonly sessions: readonly ExchangeSessionWindow[];
  readonly symbols: readonly SymbolBarAvailability[];
  readonly maxAttempts: number;
}

export interface DelayedBar {
  readonly symbol: string;
  readonly expectedSession: string;
  readonly latestCompletedBarSession: string | null;
}

const ISO_SESSION = /^\d{4}-\d{2}-\d{2}$/;

function validateSessions(
  sessions: readonly ExchangeSessionWindow[],
): readonly ExchangeSessionWindow[] {
  let previousSession = "";
  let previousClose = Number.NEGATIVE_INFINITY;
  return sessions.map((window) => {
    if (
      !ISO_SESSION.test(window.session) ||
      window.session <= previousSession
    ) {
      throw new Error("exchange sessions must be unique ascending ISO dates");
    }
    const closeAt = toTimestamp(window.closeAt, "session closeAt");
    const expectedBarAt = toTimestamp(
      window.expectedBarAt,
      "session expectedBarAt",
    );
    if (window.closeAt.slice(0, 10) !== window.session) {
      throw new Error("session closeAt must fall on its exchange date");
    }
    if (expectedBarAt < closeAt || closeAt <= previousClose) {
      throw new Error("session availability must follow its ordered close");
    }
    previousSession = window.session;
    previousClose = closeAt;
    return { ...window };
  });
}

export function eligibleSessionsAfter(
  cutoffSession: string,
  sessions: readonly Pick<ExchangeSessionWindow, "session">[],
): string[] {
  if (!ISO_SESSION.test(cutoffSession))
    throw new Error("invalid cutoff session");
  const normalized = sessions.map((item) => item.session);
  if (
    normalized.some((session) => !ISO_SESSION.test(session)) ||
    new Set(normalized).size !== normalized.length ||
    normalized.some(
      (session, index) => index > 0 && session <= normalized[index - 1]!,
    )
  ) {
    throw new Error("exchange sessions must be unique and ascending");
  }
  return normalized.filter((session) => session > cutoffSession).sort();
}

export function nthEligibleSession(
  cutoffSession: string,
  horizonSessions: number,
  sessions: readonly Pick<ExchangeSessionWindow, "session">[],
): string {
  if (!Number.isInteger(horizonSessions) || horizonSessions < 1) {
    throw new Error("horizonSessions must be a positive integer");
  }
  if (!sessions.some((item) => item.session === cutoffSession)) {
    throw new Error("cutoff session is absent from the exchange calendar");
  }
  const target = eligibleSessionsAfter(cutoffSession, sessions)[
    horizonSessions - 1
  ];
  if (target === undefined) {
    throw new Error("calendar does not cover the forecast horizon");
  }
  return target;
}

export function enqueueAvailableEodEvaluations(
  queue: JobQueue,
  input: EodEnqueueInput,
): {
  readonly targetSession: string | null;
  readonly enqueued: readonly JobOperation[];
  readonly delayed: readonly DelayedBar[];
} {
  const nowMs = toTimestamp(input.now, "scheduler time");
  const sessions = validateSessions(input.sessions);
  const target = [...sessions]
    .reverse()
    .find(
      (window) =>
        toTimestamp(window.expectedBarAt, "session expectedBarAt") <= nowMs,
    );
  if (target === undefined) {
    return { targetSession: null, enqueued: [], delayed: [] };
  }

  const enqueued: JobOperation[] = [];
  const delayed: DelayedBar[] = [];
  const seen = new Set<string>();
  for (const availability of [...input.symbols].sort((left, right) =>
    left.symbol.localeCompare(right.symbol),
  )) {
    const symbol = availability.symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || seen.has(symbol)) {
      throw new Error("symbols must be unique normalized market symbols");
    }
    seen.add(symbol);
    if (availability.latestCompletedBarSession !== target.session) {
      delayed.push({
        symbol,
        expectedSession: target.session,
        latestCompletedBarSession: availability.latestCompletedBarSession,
      });
      continue;
    }
    enqueued.push(
      queue.enqueue({
        operationKey: `eod:${symbol}:${target.session}`,
        kind: "eod_evaluation",
        payload: { symbol, cutoffSession: target.session },
        availableAt: target.expectedBarAt,
        maxAttempts: input.maxAttempts,
      }).job,
    );
  }
  return { targetSession: target.session, enqueued, delayed };
}

export function enqueueOpenPositionMonitoring(
  queue: JobQueue,
  input: {
    readonly cutoffSession: string;
    readonly availableAt: string;
    readonly maxAttempts: number;
    readonly positions: readonly {
      readonly positionId: string;
      readonly symbol: string;
      readonly lastMonitoredSession: string;
    }[];
  },
): readonly JobOperation[] {
  if (!ISO_SESSION.test(input.cutoffSession)) {
    throw new Error("invalid monitoring cutoff session");
  }
  return [...input.positions]
    .sort((left, right) => left.positionId.localeCompare(right.positionId))
    .filter((position) => {
      if (!ISO_SESSION.test(position.lastMonitoredSession)) {
        throw new Error("invalid last monitored session");
      }
      return position.lastMonitoredSession < input.cutoffSession;
    })
    .map((position) => {
      const positionId = position.positionId.trim();
      const symbol = position.symbol.trim().toUpperCase();
      if (!positionId || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
        throw new Error("open position identity is invalid");
      }
      return queue.enqueue({
        operationKey: `monitor:${positionId}:${input.cutoffSession}`,
        kind: "position_monitor",
        payload: {
          positionId,
          symbol,
          cutoffSession: input.cutoffSession,
        },
        availableAt: input.availableAt,
        maxAttempts: input.maxAttempts,
      }).job;
    });
}

export function enqueueDueOutcomeResolutions(
  queue: JobQueue,
  input: {
    readonly calendar: readonly Pick<ExchangeSessionWindow, "session">[];
    readonly latestAvailableSession: string;
    readonly availableAt: string;
    readonly maxAttempts: number;
    readonly forecasts: readonly {
      readonly forecastId: string;
      readonly symbol: string;
      readonly cutoffSession: string;
      readonly horizonSessions: number;
      readonly status: "published" | "resolved" | "void";
    }[];
  },
): readonly JobOperation[] {
  if (
    !ISO_SESSION.test(input.latestAvailableSession) ||
    !input.calendar.some(
      (session) => session.session === input.latestAvailableSession,
    )
  ) {
    throw new Error("latest available session is absent from the calendar");
  }
  let preparedCalendar:
    | {
        readonly sessions: readonly string[];
        readonly indexBySession: ReadonlyMap<string, number>;
      }
    | undefined;

  const targetSessionFor = (forecast: (typeof input.forecasts)[number]) => {
    if (
      !Number.isInteger(forecast.horizonSessions) ||
      forecast.horizonSessions < 1
    ) {
      throw new Error("horizonSessions must be a positive integer");
    }
    if (
      !input.calendar.some(({ session }) => session === forecast.cutoffSession)
    ) {
      throw new Error("cutoff session is absent from the exchange calendar");
    }
    if (preparedCalendar === undefined) {
      // Validate once at the same point the first published forecast would have
      // called nthEligibleSession, then reuse the ordered calendar for the batch.
      eligibleSessionsAfter(forecast.cutoffSession, input.calendar);
      const sessions = input.calendar.map(({ session }) => session);
      preparedCalendar = {
        sessions,
        indexBySession: new Map(
          sessions.map((session, index) => [session, index] as const),
        ),
      };
    }
    const cutoffIndex = preparedCalendar.indexBySession.get(
      forecast.cutoffSession,
    )!;
    const target =
      preparedCalendar.sessions[cutoffIndex + forecast.horizonSessions];
    if (target === undefined) {
      throw new Error("calendar does not cover the forecast horizon");
    }
    return target;
  };

  return [...input.forecasts]
    .sort((left, right) => left.forecastId.localeCompare(right.forecastId))
    .flatMap((forecast) => {
      if (forecast.status !== "published") return [];
      const targetSession = targetSessionFor(forecast);
      if (targetSession > input.latestAvailableSession) return [];
      const forecastId = forecast.forecastId.trim();
      const symbol = forecast.symbol.trim().toUpperCase();
      if (!forecastId || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
        throw new Error("forecast identity is invalid");
      }
      return [
        queue.enqueue({
          operationKey: `resolution:${forecastId}:${targetSession}`,
          kind: "outcome_resolution",
          payload: {
            forecastId,
            symbol,
            cutoffSession: forecast.cutoffSession,
            targetSession,
            horizonSessions: forecast.horizonSessions,
          },
          availableAt: input.availableAt,
          maxAttempts: input.maxAttempts,
        }).job,
      ];
    });
}

export function enqueueCorrectionReplays(
  queue: JobQueue,
  input: {
    readonly sourceRecordId: string;
    readonly reason: string;
    readonly requestedBy: string;
    readonly idempotencyKey: string;
    readonly affectedOperationIds: readonly string[];
    readonly now: string;
  },
): readonly JobOperation[] {
  const sourceRecordId = input.sourceRecordId.trim();
  const reason = input.reason.trim();
  const requestedBy = input.requestedBy.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    !sourceRecordId ||
    !reason ||
    !requestedBy ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)
  ) {
    throw new Error("correction replay contract is invalid");
  }
  return [...new Set(input.affectedOperationIds)].sort().map((operationId) => {
    const original = queue.get(operationId);
    if (original === undefined)
      throw new Error("affected operation is missing");
    return queue.enqueue({
      operationKey: `correction-replay:${idempotencyKey}:${original.id}`,
      kind: "correction_replay",
      payload: {
        sourceRecordId,
        reason,
        requestedBy,
        originalOperationKey: original.operationKey,
        originalKind: original.kind,
      },
      availableAt: input.now,
      maxAttempts: original.maxAttempts,
      replayOfOperationId: original.id,
    }).job;
  });
}
