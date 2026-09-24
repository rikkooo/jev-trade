import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

function optionalString(minimumLength = 1) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(minimumLength).optional(),
  );
}

export const RUNTIME_DATABASE_URL_KEYS = [
  "OPERATOR_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "PUBLIC_DATABASE_URL",
] as const;

export const serverEnvSchema = z
  .object({
    APP_MODE: z.enum(["fixture", "live"]).default("fixture"),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    PUBLIC_MARKET_DATA: booleanString.default(false),
    DURABLE_WRITES: booleanString.default(false),
    DATABASE_URL: optionalString(),
    DATABASE_MIGRATION_URL: optionalString(),
    OPERATOR_DATABASE_URL: optionalString(),
    WORKER_DATABASE_URL: optionalString(),
    PUBLIC_DATABASE_URL: optionalString(),
    OPENROUTER_API_KEY: optionalString(20),
    AI_GATEWAY_API_KEY: optionalString(20),
    CRON_SECRET: optionalString(32),
    MARKET_DATA_API_KEY: optionalString(),
    OPERATOR_TOKEN: optionalString(32),
    DATA_RIGHTS_RECORD_ID: optionalString(),
    PUBLIC_DISCLOSURE_VERSION: optionalString(),
    VERCEL_GIT_COMMIT_SHA: optionalString(),
    VERCEL_ENV: optionalString(),
  })
  .superRefine((env, ctx) => {
    // Durable mode uses role-specific connections only (#15). A single
    // shared runtime connection cannot express the privilege matrix.
    if (env.DURABLE_WRITES) {
      for (const key of RUNTIME_DATABASE_URL_KEYS) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "is required when DURABLE_WRITES=true",
          });
        }
      }
      if (env.DATABASE_URL) {
        ctx.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message:
            "is retired; configure OPERATOR_DATABASE_URL, WORKER_DATABASE_URL, and PUBLIC_DATABASE_URL",
        });
      }
    }

    const configuredRoleUrls = RUNTIME_DATABASE_URL_KEYS.filter(
      (key) => env[key],
    );
    const distinctRoleUrls = new Set(
      configuredRoleUrls.map((key) => env[key]?.trim()),
    );
    if (distinctRoleUrls.size !== configuredRoleUrls.length) {
      ctx.addIssue({
        code: "custom",
        path: ["OPERATOR_DATABASE_URL"],
        message: "each runtime database role needs its own credential",
      });
    }
    if (
      env.DATABASE_MIGRATION_URL &&
      distinctRoleUrls.has(env.DATABASE_MIGRATION_URL.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_MIGRATION_URL"],
        message: "the migration owner credential cannot be a runtime role",
      });
    }

    if (env.DURABLE_WRITES && env.APP_MODE !== "live") {
      ctx.addIssue({
        code: "custom",
        path: ["DURABLE_WRITES"],
        message: "requires APP_MODE=live",
      });
    }

    if (env.PUBLIC_MARKET_DATA && env.APP_MODE !== "live") {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_MARKET_DATA"],
        message: "requires APP_MODE=live",
      });
    }

    if (env.PUBLIC_MARKET_DATA && !env.DURABLE_WRITES) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_MARKET_DATA"],
        message: "requires DURABLE_WRITES=true",
      });
    }

    if (env.PUBLIC_MARKET_DATA && !env.MARKET_DATA_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["MARKET_DATA_API_KEY"],
        message: "is required when PUBLIC_MARKET_DATA=true",
      });
    }

    if (env.PUBLIC_MARKET_DATA && !env.DATA_RIGHTS_RECORD_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["DATA_RIGHTS_RECORD_ID"],
        message: "is required when PUBLIC_MARKET_DATA=true",
      });
    }

    if (env.PUBLIC_MARKET_DATA && !env.PUBLIC_DISCLOSURE_VERSION) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_DISCLOSURE_VERSION"],
        message: "is required when PUBLIC_MARKET_DATA=true",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let parsed: ServerEnv | undefined;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const fields = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join(", ");
    throw new Error(`Invalid server configuration: ${fields}`);
  }

  return result.data;
}

export function getServerEnv(): ServerEnv {
  parsed ??= parseServerEnv(process.env);
  return parsed;
}

export function resetEnvForTests(): void {
  parsed = undefined;
}
