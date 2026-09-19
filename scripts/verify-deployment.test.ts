import { describe, expect, it } from "vitest";

import {
  argumentsFromCli,
  type VerificationOptions,
  verifyDeployment,
} from "./verify-deployment";

const REVISION = "abcdef1234567890";
const CANONICAL = "https://jev-trade.dev";

interface RemoteFixtureOptions {
  readonly credentialFree?: boolean;
  readonly revision?: string;
  readonly hsts?: boolean;
  readonly canonical?: string;
  readonly canonicalTrailingSlash?: boolean;
  readonly unrelatedCanonicalHref?: string;
}

function remoteFixtureFetch({
  credentialFree = true,
  revision = REVISION.slice(0, 12),
  hsts = true,
  canonical = CANONICAL,
  canonicalTrailingSlash = true,
  unrelatedCanonicalHref,
}: RemoteFixtureOptions = {}) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    const path = url.pathname;
    const method = init?.method ?? "GET";
    if (path === "/") {
      return new Response(
        `Synthetic fixture release <link rel="canonical" href="${canonical}${canonicalTrailingSlash ? "/" : ""}">${unrelatedCanonicalHref ? `<a href="${unrelatedCanonicalHref}">home</a>` : ""}`,
        {
          status: 200,
          headers: {
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            ...(hsts
              ? { "Strict-Transport-Security": "max-age=31536000" }
              : {}),
          },
        },
      );
    }
    if (path === "/api/health") {
      return Response.json({
        mode: "fixture",
        capabilities: {
          database: false,
          durableWrites: false,
          publicMarketData: false,
          liveJudgments: false,
        },
        fixtureSafety: { credentialFree },
        deployment: { revision },
      });
    }
    if (path === "/health/ready") {
      return Response.json({ status: "ready" });
    }
    if (
      method === "POST" &&
      ["/api/v1/picks", "/api/v1/analytics/events"].includes(path)
    ) {
      return Response.json(
        { error: { code: "DURABLE_WRITES_DISABLED" } },
        { status: 503 },
      );
    }
    if (
      path === "/forecasts/01K5D3JEVACME5SPRINT0001" ||
      path === "/forecasts/01K5D3JEVACME5SPRINT0001/share" ||
      path === "/api/v1/forecasts/01K5D3JEVACME5SPRINT0001"
    ) {
      return new Response("not found", { status: 404 });
    }
    if (path === "/stocks/acme") {
      return new Response("Blind fixture stock page", { status: 200 });
    }
    if (path === "/api/v1/fixture-reveal/01K5D3JEVACME5SPRINT0001") {
      return Response.json(
        { forecast: { id: "01K5D3JEVACME5SPRINT0001" } },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (path === "/robots.txt") {
      return new Response(`Sitemap: ${canonical}/sitemap.xml`);
    }
    if (path === "/sitemap.xml") {
      return new Response(`<url><loc>${canonical}/</loc></url>`);
    }
    if (path === "/api/internal/cron") {
      return new Response("unauthorized", { status: 401 });
    }
    throw new Error(
      `unexpected deployment-verifier request: ${method} ${path}`,
    );
  };
}

function remoteOptions(): VerificationOptions {
  return {
    origin: new URL("https://immutable.vercel.app"),
    expectedRevision: REVISION,
    canonicalOrigin: new URL(CANONICAL),
  };
}

describe("deployment verifier", () => {
  it("requires artifact identity arguments for a remote origin", () => {
    expect(() =>
      argumentsFromCli(["https://immutable.vercel.app"], {}),
    ).toThrow("--expected-revision");
    expect(() =>
      argumentsFromCli(
        ["https://immutable.vercel.app", "--expected-revision", REVISION],
        {},
      ),
    ).toThrow("--canonical-origin");
  });

  it("records every remote release gate only after it executes", async () => {
    const receipt = await verifyDeployment(
      remoteOptions(),
      remoteFixtureFetch(),
      () => new Date("2026-09-19T12:00:00.000Z"),
    );

    expect(receipt).toMatchObject({
      ok: true,
      expectedRevision: REVISION.slice(0, 12),
      canonicalOrigin: CANONICAL,
      checkedAt: "2026-09-19T12:00:00.000Z",
    });
    expect(receipt.checks).toEqual(
      expect.arrayContaining([
        "https-strict-transport-security",
        "credential-free-fixture",
        "revision-identity",
        "canonical-metadata",
      ]),
    );
  });

  it("accepts an equivalent root canonical without a trailing slash", async () => {
    const receipt = await verifyDeployment(
      remoteOptions(),
      remoteFixtureFetch({ canonicalTrailingSlash: false }),
    );

    expect(receipt.checks).toContain("canonical-metadata");
  });

  it("rejects slashless canonical drift even when another link uses the expected origin", async () => {
    await expect(
      verifyDeployment(
        remoteOptions(),
        remoteFixtureFetch({
          canonical: "https://wrong.example",
          canonicalTrailingSlash: false,
          unrelatedCanonicalHref: CANONICAL,
        }),
      ),
    ).rejects.toThrow("canonical origin");
  });

  it("does not claim remote-only evidence for a local artifact", async () => {
    const receipt = await verifyDeployment(
      {
        origin: new URL("http://127.0.0.1:3000"),
        expectedRevision: null,
        canonicalOrigin: null,
      },
      remoteFixtureFetch({ credentialFree: false, hsts: false }),
    );

    expect(receipt.checks).not.toEqual(
      expect.arrayContaining([
        "https-strict-transport-security",
        "credential-free-fixture",
        "revision-identity",
        "canonical-metadata",
      ]),
    );
  });

  it.each([
    {
      name: "privileged credentials",
      fixture: { credentialFree: false },
      message: "privileged credential",
    },
    {
      name: "revision drift",
      fixture: { revision: "000000000000" },
      message: "does not match reviewed revision",
    },
    {
      name: "missing HSTS",
      fixture: { hsts: false },
      message: "Strict-Transport-Security",
    },
    {
      name: "canonical drift",
      fixture: { canonical: "https://wrong.example" },
      message: "canonical origin",
    },
  ])("rejects $name", async ({ fixture, message }) => {
    await expect(
      verifyDeployment(remoteOptions(), remoteFixtureFetch(fixture)),
    ).rejects.toThrow(message);
  });
});
