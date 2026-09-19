export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});

export class ManualClock implements Clock {
  #nowMs: number;

  constructor(now: string | Date) {
    this.#nowMs = toTimestamp(now, "clock time");
  }

  now(): Date {
    return new Date(this.#nowMs);
  }

  set(now: string | Date): void {
    this.#nowMs = toTimestamp(now, "clock time");
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("clock advance must be a non-negative finite number");
    }
    this.#nowMs += milliseconds;
  }
}

export function toTimestamp(value: string | Date, label: string): number {
  const milliseconds =
    value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} is invalid`);
  if (
    typeof value === "string" &&
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO instant`);
  }
  return milliseconds;
}

export function toIsoInstant(value: string | Date, label: string): string {
  return new Date(toTimestamp(value, label)).toISOString();
}
