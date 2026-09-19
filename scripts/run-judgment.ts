import {
  FixtureJevProvider,
  OpenRouterJevProvider,
  buildJudgmentRequest,
  sanitizeJudgmentError,
  type JevProvider,
} from "@/modules/judgment";
import { buildDemoCompactState } from "@/modules/judgment/fixtures/demo-state";

const flags = new Set(
  process.argv.slice(2).filter((argument) => argument !== "--"),
);
const allowedFlags = new Set(["--live", "--scored"]);

async function run(): Promise<void> {
  if ([...flags].some((flag) => !allowedFlags.has(flag))) {
    throw new Error("Usage: pnpm judgment:run [--live] [--scored]");
  }

  const live = flags.has("--live");
  const scored = flags.has("--scored");
  if (scored && !live) {
    throw new Error("--scored requires --live");
  }

  let provider: JevProvider;
  if (live) {
    if (process.env.JEV_LIVE !== "1") {
      throw new Error("Live judgment requires both --live and JEV_LIVE=1");
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
      throw new Error("OPENROUTER_API_KEY is required for a live run");
    provider = new OpenRouterJevProvider({ apiKey });
  } else {
    provider = new FixtureJevProvider();
  }

  const request = buildJudgmentRequest({
    marketState: buildDemoCompactState(),
    strategyMode: "position",
    horizonSessions: 20,
    evaluationMode: scored ? "scored" : "sandbox",
  });
  const result = await provider.evaluate(request);

  process.stdout.write(
    `${JSON.stringify(
      {
        runMode: live ? "live-openrouter" : "fixture-offline",
        liveJev: result.liveJev,
        publishable: result.publishable,
        evaluationMode: result.evaluationMode,
        contractVersion: result.contractVersion,
        questionSetVersion: result.questionSetVersion,
        requestHash: result.requestHash,
        receipt: result.receipt,
        answers: result.answers,
      },
      null,
      2,
    )}\n`,
  );
}

run().catch((error: unknown) => {
  const output =
    error instanceof Error &&
    !("code" in error && typeof (error as { code?: unknown }).code === "string")
      ? { name: "ConfigurationError", message: error.message }
      : sanitizeJudgmentError(error);
  process.stderr.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 1;
});
