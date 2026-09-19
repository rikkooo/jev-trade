const REQUIRED_HEADERS = {
  "content-security-policy": "default-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function deploymentOrigin(raw: string | undefined): URL {
  invariant(raw, "Usage: pnpm verify:deployment -- <deployment-origin>");
  const origin = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  invariant(
    origin.protocol === "https:" || (local && origin.protocol === "http:"),
    "Deployment origin must use HTTPS unless it is local.",
  );
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  return origin;
}

async function response(origin: URL, path: string, init?: RequestInit) {
  return fetch(new URL(path, origin), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

async function main() {
  const argumentsAfterScript = process.argv.slice(2);
  const rawOrigin =
    argumentsAfterScript[0] === "--"
      ? argumentsAfterScript[1]
      : argumentsAfterScript[0];
  const origin = deploymentOrigin(rawOrigin);
  const home = await response(origin, "/");
  invariant(home.status === 200, `Home returned ${home.status}.`);
  const homeText = await home.text();
  invariant(
    homeText.includes("Synthetic fixture release"),
    "Home is missing the fixture disclosure.",
  );

  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    invariant(
      home.headers.get(name)?.includes(expected),
      `Home is missing the required ${name} header.`,
    );
  }

  const healthResponse = await response(origin, "/api/health");
  invariant(healthResponse.status === 200, "Health endpoint is unavailable.");
  const health = (await healthResponse.json()) as {
    mode?: string;
    capabilities?: Record<string, boolean>;
  };
  invariant(health.mode === "fixture", "Deployment is not in fixture mode.");
  for (const capability of [
    "durableWrites",
    "publicMarketData",
    "liveJudgments",
  ]) {
    invariant(
      health.capabilities?.[capability] === false,
      `${capability} must be false in the public fixture.`,
    );
  }

  const pick = await response(origin, "/api/v1/picks", { method: "POST" });
  invariant(pick.status === 503, `Fixture pick route returned ${pick.status}.`);
  const pickBody = (await pick.json()) as { error?: { code?: string } };
  invariant(
    pickBody.error?.code === "DURABLE_WRITES_DISABLED",
    "Fixture pick route did not fail closed.",
  );

  const cron = await response(origin, "/api/internal/cron");
  invariant(cron.status === 401, `Cron route returned ${cron.status}.`);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      origin: origin.origin,
      mode: health.mode,
      checkedAt: new Date().toISOString(),
      checks: [
        "fixture-disclosure",
        "security-headers",
        "safe-capabilities",
        "public-writes-fail-closed",
        "cron-auth-fail-closed",
      ],
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "deployment verification failed"}\n`,
  );
  process.exitCode = 1;
});
