import { pathToFileURL } from "node:url";

const REQUIRED_HEADERS = {
  "content-security-policy": "default-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

const BLIND_FORECAST_ID = "01K5D3JEVACME5SPRINT0001";
const HIDDEN_CALL_MARKERS = [
  "UP leads the distribution",
  "62%",
  "CODE-OWNED POLICY ACTION",
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizedOrigin(raw: string, label: string): URL {
  const origin = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  invariant(
    origin.protocol === "https:" || (local && origin.protocol === "http:"),
    `${label} must use HTTPS unless it is local.`,
  );
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  return origin;
}

export interface VerificationOptions {
  readonly origin: URL;
  readonly expectedRevision: string | null;
  readonly canonicalOrigin: URL | null;
}

export function argumentsFromCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): VerificationOptions {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const rawOrigin = args.shift();
  invariant(
    rawOrigin,
    "Usage: pnpm verify:deployment -- <origin> [--expected-revision <git-sha>] [--canonical-origin <origin>]",
  );
  let expectedRevision = environment.EXPECTED_REVISION ?? null;
  let rawCanonical = environment.CANONICAL_ORIGIN ?? null;
  while (args.length > 0) {
    const flag = args.shift();
    const value = args.shift();
    invariant(value, `${flag ?? "option"} requires a value.`);
    if (flag === "--expected-revision") expectedRevision = value;
    else if (flag === "--canonical-origin") rawCanonical = value;
    else throw new Error(`Unknown deployment verification option: ${flag}`);
  }
  if (expectedRevision !== null) {
    invariant(
      /^[0-9a-f]{7,40}$/i.test(expectedRevision),
      "Expected revision must be a 7-40 character Git SHA.",
    );
  }
  const origin = normalizedOrigin(rawOrigin, "Deployment origin");
  const local = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  invariant(
    local || expectedRevision !== null,
    "A reviewed --expected-revision is required for a remote deployment.",
  );
  invariant(
    local || rawCanonical !== null,
    "A --canonical-origin is required for a remote deployment.",
  );
  return {
    origin,
    expectedRevision,
    canonicalOrigin:
      rawCanonical === null
        ? null
        : normalizedOrigin(rawCanonical, "Canonical origin"),
  };
}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

async function response(
  origin: URL,
  path: string,
  fetcher: Fetcher,
  init?: RequestInit,
) {
  return fetcher(new URL(path, origin), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

function assertNoHiddenCall(body: string, label: string): void {
  for (const marker of HIDDEN_CALL_MARKERS) {
    invariant(
      !body.includes(marker),
      `${label} leaked the hidden call marker.`,
    );
  }
}

async function assertDisabledWrite(
  origin: URL,
  path: string,
  fetcher: Fetcher,
): Promise<void> {
  const result = await response(origin, path, fetcher, { method: "POST" });
  invariant(result.status === 503, `${path} returned ${result.status}.`);
  const body = (await result.json()) as { error?: { code?: string } };
  invariant(
    body.error?.code === "DURABLE_WRITES_DISABLED",
    `${path} did not fail closed.`,
  );
}

export interface DeploymentVerificationReceipt {
  readonly ok: true;
  readonly origin: string;
  readonly canonicalOrigin: string | null;
  readonly expectedRevision: string | null;
  readonly checkedAt: string;
  readonly checks: readonly string[];
}

export async function verifyDeployment(
  { origin, expectedRevision, canonicalOrigin }: VerificationOptions,
  fetcher: Fetcher = fetch,
  now: () => Date = () => new Date(),
): Promise<DeploymentVerificationReceipt> {
  const local = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  invariant(
    local || expectedRevision !== null,
    "A reviewed --expected-revision is required for a remote deployment.",
  );
  invariant(
    local || canonicalOrigin !== null,
    "A --canonical-origin is required for a remote deployment.",
  );
  const checks: string[] = [];
  const home = await response(origin, "/", fetcher);
  invariant(home.status === 200, `Home returned ${home.status}.`);
  const homeText = await home.text();
  invariant(
    homeText.includes("Synthetic fixture release"),
    "Home is missing the fixture disclosure.",
  );
  checks.push("fixture-disclosure");
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    invariant(
      home.headers.get(name)?.includes(expected),
      `Home is missing the required ${name} header.`,
    );
  }
  checks.push("security-headers");
  const contentSecurityPolicy =
    home.headers.get("content-security-policy") ?? "";
  invariant(
    !contentSecurityPolicy.includes("'unsafe-eval'"),
    "Production Content-Security-Policy must not allow unsafe-eval.",
  );
  checks.push("production-csp");
  if (!local) {
    invariant(
      home.headers
        .get("strict-transport-security")
        ?.includes("max-age=31536000"),
      "Production deployment is missing Strict-Transport-Security.",
    );
    checks.push("https-strict-transport-security");
  }

  const healthResponse = await response(origin, "/api/health", fetcher);
  invariant(healthResponse.status === 200, "Health endpoint is unavailable.");
  const health = (await healthResponse.json()) as {
    mode?: string;
    capabilities?: Record<string, boolean>;
    fixtureSafety?: { credentialFree?: boolean };
    deployment?: { revision?: string };
  };
  invariant(health.mode === "fixture", "Deployment is not in fixture mode.");
  for (const capability of [
    "database",
    "durableWrites",
    "publicMarketData",
    "liveJudgments",
  ]) {
    invariant(
      health.capabilities?.[capability] === false,
      `${capability} must be false in the public fixture.`,
    );
  }
  checks.push("safe-capabilities");
  if (!local) {
    invariant(
      health.fixtureSafety?.credentialFree === true,
      "Remote fixture deployment contains a privileged credential.",
    );
    checks.push("credential-free-fixture");
  }
  if (expectedRevision !== null) {
    const expectedShortRevision = expectedRevision.toLowerCase().slice(0, 12);
    invariant(
      health.deployment?.revision?.toLowerCase() === expectedShortRevision,
      `Deployment revision does not match reviewed revision ${expectedShortRevision}.`,
    );
    checks.push("revision-identity");
  }

  const ready = await response(origin, "/health/ready", fetcher);
  invariant(ready.status === 200, `Readiness route returned ${ready.status}.`);
  invariant(
    ((await ready.json()) as { status?: string }).status === "ready",
    "Readiness route did not report ready.",
  );
  checks.push("readiness");

  await assertDisabledWrite(origin, "/api/v1/picks", fetcher);
  await assertDisabledWrite(origin, "/api/v1/analytics/events", fetcher);
  checks.push("public-writes-fail-closed");

  for (const path of [
    `/forecasts/${BLIND_FORECAST_ID}`,
    `/forecasts/${BLIND_FORECAST_ID}/share`,
    `/api/v1/forecasts/${BLIND_FORECAST_ID}`,
  ]) {
    const result = await response(origin, path, fetcher);
    invariant(result.status === 404, `${path} returned ${result.status}.`);
    assertNoHiddenCall(await result.text(), path);
  }
  const blindStock = await response(origin, "/stocks/acme", fetcher);
  invariant(blindStock.status === 200, "Blind stock page is unavailable.");
  assertNoHiddenCall(await blindStock.text(), "Blind stock page");
  checks.push("blind-nondisclosure");

  const reveal = await response(
    origin,
    `/api/v1/fixture-reveal/${BLIND_FORECAST_ID}`,
    fetcher,
  );
  invariant(reveal.status === 200, `Fixture reveal returned ${reveal.status}.`);
  invariant(
    reveal.headers.get("cache-control")?.includes("private") &&
      reveal.headers.get("cache-control")?.includes("no-store"),
    "Fixture reveal is not private and no-store.",
  );
  invariant(
    ((await reveal.json()) as { forecast?: { id?: string } }).forecast?.id ===
      BLIND_FORECAST_ID,
    "Fixture reveal returned the wrong forecast.",
  );
  checks.push("fixture-reveal-private-no-store");

  if (canonicalOrigin !== null) {
    const canonical = canonicalOrigin.origin;
    invariant(
      homeText.includes(`href="${canonical}/"`),
      "Home canonical metadata does not match the configured canonical origin.",
    );
    const robots = await response(origin, "/robots.txt", fetcher);
    invariant(robots.status === 200, "robots.txt is unavailable.");
    invariant(
      (await robots.text()).includes(`Sitemap: ${canonical}/sitemap.xml`),
      "robots.txt does not name the canonical sitemap.",
    );
    const sitemap = await response(origin, "/sitemap.xml", fetcher);
    invariant(sitemap.status === 200, "sitemap.xml is unavailable.");
    invariant(
      (await sitemap.text()).includes(`<loc>${canonical}/`),
      "sitemap.xml does not use the canonical origin.",
    );
    checks.push("canonical-metadata");
  }

  const cron = await response(origin, "/api/internal/cron", fetcher);
  invariant(cron.status === 401, `Cron route returned ${cron.status}.`);
  checks.push("cron-auth-fail-closed");

  return {
    ok: true,
    origin: origin.origin,
    canonicalOrigin: canonicalOrigin?.origin ?? null,
    expectedRevision: expectedRevision?.slice(0, 12) ?? null,
    checkedAt: now().toISOString(),
    checks,
  };
}

async function main() {
  const options = argumentsFromCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(await verifyDeployment(options))}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "deployment verification failed"}\n`,
    );
    process.exitCode = 1;
  });
}
