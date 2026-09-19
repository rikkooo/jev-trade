import { describe, expect, it, vi } from "vitest";

import { handleInternalCronRequest } from "./route-handler";

const config = {
  cronSecret: "s".repeat(32),
  durableWrites: true,
};

function get(headers: Record<string, string> = {}) {
  return new Request("https://jev-trade.example/api/internal/cron", {
    method: "GET",
    headers,
  });
}

describe("internal cron route boundary", () => {
  it("requires Vercel's bearer auth and scheduler user agent", async () => {
    for (const request of [
      get(),
      get({ authorization: `Bearer ${config.cronSecret}` }),
    ]) {
      const response = await handleInternalCronRequest(
        request,
        config,
        vi.fn(),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toHaveProperty("error.code");
    }
  });

  it("fails closed before executing when durable writes are disabled", async () => {
    const execute = vi.fn();
    const response = await handleInternalCronRequest(
      get({
        authorization: `Bearer ${config.cronSecret}`,
        "user-agent": "vercel-cron/1.0",
      }),
      { ...config, durableWrites: false },
      execute,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "DURABLE_WRITES_DISABLED",
        message: "Scheduled mutations are disabled for this deployment.",
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a safe receipt without reflecting credentials", async () => {
    const execute = vi.fn().mockResolvedValue({
      invocationId: "run_1",
      claimed: 2,
      succeeded: 2,
      failed: 0,
      released: 0,
      stopReason: "QUEUE_EMPTY",
    });
    const response = await handleInternalCronRequest(
      get({
        authorization: `Bearer ${config.cronSecret}`,
        "user-agent": "vercel-cron/1.0",
      }),
      { ...config, now: () => new Date("2026-09-21T22:07:00.000Z") },
      execute,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(config.cronSecret);
    expect(JSON.parse(body)).toMatchObject({ ok: true, claimed: 2 });
    expect(execute).toHaveBeenCalledWith({
      idempotencyKey: "vercel-cron:/api/internal/cron:2026-09-21T22:00:00.000Z",
    });
  });

  it("rejects browser-origin POSTs because operator replay is a separate contract", async () => {
    const response = await handleInternalCronRequest(
      new Request("https://jev-trade.example/api/internal/cron", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.cronSecret}`,
          origin: "https://jev-trade.example",
          "user-agent": "vercel-cron/1.0",
          "x-idempotency-key": "operator-replay-1",
        },
      }),
      config,
      vi.fn(),
    );
    expect(response.status).toBe(405);
  });

  it("does not reflect backend errors or server credentials", async () => {
    const response = await handleInternalCronRequest(
      get({
        authorization: `Bearer ${config.cronSecret}`,
        "user-agent": "vercel-cron/1.0",
      }),
      config,
      async () => {
        throw new Error(`database failed with ${config.cronSecret}`);
      },
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain(config.cronSecret);
    expect(body).toContain("JOB_BACKEND_UNAVAILABLE");
  });
});
