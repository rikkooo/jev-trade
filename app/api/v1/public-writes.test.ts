import { describe, expect, it } from "vitest";

import { POST as postAnalytics } from "./analytics/events/route";
import { POST as postPick } from "./picks/route";

describe("fixture public write routes", () => {
  it.each([
    ["pick", postPick, "Fixture picks are stored only in this browser."],
    ["analytics", postAnalytics, "Fixture analytics are not uploaded."],
  ])("fails %s writes closed", async (_name, handler, message) => {
    const response = await handler();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "DURABLE_WRITES_DISABLED", message },
    });
  });
});
