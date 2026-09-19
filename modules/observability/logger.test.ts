import { describe, expect, it } from "vitest";
import { sanitizeForLog } from "./logger";

describe("sanitizeForLog", () => {
  it("redacts nested credentials and headers", () => {
    expect(
      sanitizeForLog({
        requestId: "safe-id",
        authorization: "Bearer private",
        nested: { api_key: "private", symbol: "ACME" },
      }),
    ).toEqual({
      requestId: "safe-id",
      authorization: "[REDACTED]",
      nested: { api_key: "[REDACTED]", symbol: "ACME" },
    });
  });
});
