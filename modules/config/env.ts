import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const serverEnvSchema = z
  .object({
    APP_MODE: z.enum(["fixture", "live"]).default("fixture"),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    PUBLIC_MARKET_DATA: booleanString.default(false),
    DURABLE_WRITES: booleanString.default(false),
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_MIGRATION_URL: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(20).optional(),
    CRON_SECRET: z.string().min(32).optional(),
    MARKET_DATA_API_KEY: z.string().min(1).optional(),
    OPERATOR_TOKEN: z.string().min(32).optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DURABLE_WRITES && !env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "is required when DURABLE_WRITES=true",
      });
    }

    if (env.PUBLIC_MARKET_DATA && env.APP_MODE !== "live") {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_MARKET_DATA"],
        message: "requires APP_MODE=live",
      });
    }

    if (env.PUBLIC_MARKET_DATA && !env.MARKET_DATA_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["MARKET_DATA_API_KEY"],
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
