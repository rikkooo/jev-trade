import { LedgerInvariantError } from "./errors";
import type {
  ForecastOutcome,
  ForecastStatus,
  LedgerProjection,
  LedgerState,
} from "./types";

export function rebuildLedgerProjection(state: LedgerState): LedgerProjection {
  const knownForecasts = new Set(
    state.forecasts.map((forecast) => forecast.id),
  );
  const forecastStatusById: Record<string, ForecastStatus> = {};
  const eventForecastById = new Map<string, string>();

  for (const event of state.forecastEvents) {
    if (!knownForecasts.has(event.forecastId)) {
      throw new LedgerInvariantError(`Forecast event ${event.id} is orphaned`);
    }
    if (eventForecastById.has(event.id)) {
      throw new LedgerInvariantError(
        `Forecast event ID ${event.id} is duplicated`,
      );
    }

    const current = forecastStatusById[event.forecastId];
    if (event.type === "published") {
      if (current !== undefined) {
        throw new LedgerInvariantError(
          `Forecast ${event.forecastId} was published twice`,
        );
      }
      forecastStatusById[event.forecastId] = "published";
    } else if (event.type === "resolved" || event.type === "void") {
      if (current !== "published") {
        throw new LedgerInvariantError(
          `Forecast ${event.forecastId} cannot move from ${current ?? "missing"} to ${event.type}`,
        );
      }
      forecastStatusById[event.forecastId] = event.type;
    } else {
      if (current !== "resolved" && current !== "void") {
        throw new LedgerInvariantError(
          `Forecast ${event.forecastId} cannot be corrected before a terminal event`,
        );
      }
      if (event.referencesEventId === undefined) {
        throw new LedgerInvariantError(
          `Correction event ${event.id} needs a reference`,
        );
      }
      if (eventForecastById.get(event.referencesEventId) !== event.forecastId) {
        throw new LedgerInvariantError(
          `Correction event ${event.id} must reference the same forecast`,
        );
      }
    }
    eventForecastById.set(event.id, event.forecastId);
  }

  for (const forecastId of knownForecasts) {
    if (forecastStatusById[forecastId] === undefined) {
      throw new LedgerInvariantError(
        `Forecast ${forecastId} has no publication event`,
      );
    }
  }

  const outcomeById = new Map<string, ForecastOutcome>();
  const activeOutcomeByForecast: Record<string, ForecastOutcome> = {};
  for (const outcome of state.outcomes) {
    if (!knownForecasts.has(outcome.forecastId)) {
      throw new LedgerInvariantError(`Outcome ${outcome.id} is orphaned`);
    }
    if (outcomeById.has(outcome.id)) {
      throw new LedgerInvariantError(`Outcome ID ${outcome.id} is duplicated`);
    }

    const current = activeOutcomeByForecast[outcome.forecastId];
    if (outcome.correctionOfOutcomeId === undefined) {
      if (current !== undefined) {
        throw new LedgerInvariantError(
          `Forecast ${outcome.forecastId} has duplicate active outcomes`,
        );
      }
    } else {
      const corrected = outcomeById.get(outcome.correctionOfOutcomeId);
      if (
        corrected === undefined ||
        corrected.forecastId !== outcome.forecastId ||
        current?.id !== corrected.id
      ) {
        throw new LedgerInvariantError(
          `Outcome ${outcome.id} does not correct the active outcome`,
        );
      }
    }
    outcomeById.set(outcome.id, outcome);
    activeOutcomeByForecast[outcome.forecastId] = outcome;
  }

  let cash = 0;
  const sharesBySymbol: Record<string, number> = {};
  const paperEventIds = new Set<string>();
  for (const event of state.paperEvents) {
    if (paperEventIds.has(event.id)) {
      throw new LedgerInvariantError(
        `Paper event ID ${event.id} is duplicated`,
      );
    }
    if (
      event.correctionOfEventId !== undefined &&
      !paperEventIds.has(event.correctionOfEventId)
    ) {
      throw new LedgerInvariantError(
        `Paper event ${event.id} has an unknown reference`,
      );
    }
    if (
      !Number.isFinite(event.cashDelta) ||
      !Number.isFinite(event.sharesDelta)
    ) {
      throw new LedgerInvariantError(
        `Paper event ${event.id} has a non-finite delta`,
      );
    }
    cash += event.cashDelta;
    if (event.symbol !== undefined) {
      sharesBySymbol[event.symbol] =
        (sharesBySymbol[event.symbol] ?? 0) + event.sharesDelta;
    } else if (event.sharesDelta !== 0) {
      throw new LedgerInvariantError(
        `Paper event ${event.id} changes shares without a symbol`,
      );
    }
    paperEventIds.add(event.id);
  }

  return {
    forecastStatusById,
    activeOutcomeByForecast,
    cash: Object.is(cash, -0) ? 0 : cash,
    sharesBySymbol,
  };
}
