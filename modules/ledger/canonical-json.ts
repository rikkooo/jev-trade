import { createHash } from "node:crypto";

import { LedgerInvariantError } from "./errors";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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
      throw new LedgerInvariantError(
        "Canonical JSON accepts only finite numbers",
      );
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (typeof value !== "object") {
    throw new LedgerInvariantError(
      `Canonical JSON cannot encode a value of type ${typeof value}`,
    );
  }

  if (seen.has(value)) {
    throw new LedgerInvariantError(
      "Canonical JSON cannot encode cyclic values",
    );
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new LedgerInvariantError(
            "Canonical JSON arrays cannot contain holes",
          );
        }
      }
      if (
        Object.keys(value).some(
          (key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length,
        )
      ) {
        throw new LedgerInvariantError(
          "Canonical JSON arrays cannot have named properties",
        );
      }
      return `[${value.map((entry) => serialize(entry, seen)).join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new LedgerInvariantError(
        "Canonical JSON accepts only plain objects",
      );
    }

    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry, seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
