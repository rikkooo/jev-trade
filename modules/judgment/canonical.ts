import { createHash } from "node:crypto";

import { JudgmentProviderError } from "./errors";

function serialize(value: unknown, seen: Set<object>): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new JudgmentProviderError("INVALID_REQUEST", false);
      }
      return `[${value.map((item) => serialize(item, seen)).join(",")}]`;
    }
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${serialize(child, seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export function canonicalHash(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
