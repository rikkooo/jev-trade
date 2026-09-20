import { parseServerEnv } from "./env";

/**
 * Database role selection is compile-time/server-module owned. HTTP headers,
 * cookies, request bodies, and user credentials never reach this boundary.
 */
export type RuntimeDatabaseRole = "operator" | "worker" | "public";

const roleEnvironmentKey: Readonly<Record<RuntimeDatabaseRole, string>> = {
  operator: "OPERATOR_DATABASE_URL",
  worker: "WORKER_DATABASE_URL",
  public: "PUBLIC_DATABASE_URL",
};

function databaseUrlForRole(
  role: RuntimeDatabaseRole,
  source: Record<string, string | undefined> = process.env,
): string {
  const environment = parseServerEnv(source);
  const key = roleEnvironmentKey[role] as keyof typeof environment;
  const url = environment[key];
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      `${roleEnvironmentKey[role]} is required for the ${role} database role`,
    );
  }
  return url;
}

export function operatorDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  return databaseUrlForRole("operator", source);
}

export function workerDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  return databaseUrlForRole("worker", source);
}

export function publicDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  return databaseUrlForRole("public", source);
}
