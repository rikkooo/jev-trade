const REDACTED = "[REDACTED]";
const SECRET_KEY = /(authorization|cookie|secret|token|api[_-]?key|password)/i;

function sanitize(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export type LogContext = Record<string, unknown>;

export function log(
  level: "info" | "warn" | "error",
  event: string,
  context: LogContext = {},
): void {
  const safeContext = sanitize(context) as LogContext;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeContext,
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export const sanitizeForLog = sanitize;
