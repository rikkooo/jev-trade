import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("fixture reveal route", () => {
  it("returns the full projection only for an eligible fixture forecast", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/fixture-reveal/id"),
      {
        params: Promise.resolve({ id: "01K5D3JEVACME5SPRINT0001" }),
      },
    );
    const body = (await response.json()) as {
      forecast?: {
        id?: string;
        action?: string;
        judgment?: { probabilities?: unknown };
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.forecast?.id).toBe("01K5D3JEVACME5SPRINT0001");
    expect(body.forecast?.action).toBe("UP");
    expect(body.forecast?.judgment?.probabilities).toEqual({
      up: 0.62,
      flat: 0.23,
      down: 0.15,
    });
  });

  it("does not reveal ineligible or unknown fixture forecasts", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/fixture-reveal/id"),
      {
        params: Promise.resolve({ id: "01K4MESA1SPRINTRES00001" }),
      },
    );
    expect(response.status).toBe(404);
  });
});
