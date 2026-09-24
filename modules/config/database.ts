import { parseServerEnv } from "./env";

/**
 * Runtime database roles. Each DAL module binds one role at build time; no
 * header, cookie, body, query parameter, or user credential reaches this
 * boundary, so a request cannot select or override a database role. The
 * migration owner is not a runtime role and can never be returned here.
 */
export type RuntimeDatabaseRole = "operator" | "worker" | "public";

export const RUNTIME_DATABASE_ROLE_KEYS = {
  operator: "OPERATOR_DATABASE_URL",
  worker: "WORKER_DATABASE_URL",
  public: "PUBLIC_DATABASE_URL",
} as const satisfies Record<RuntimeDatabaseRole, string>;

export class DatabaseRoleConfigurationError extends Error {
  readonly code = "DATABASE_ROLE_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "DatabaseRoleConfigurationError";
  }
}

function databaseUrlForRole(
  role: RuntimeDatabaseRole,
  source: Record<string, string | undefined>,
): string {
  if (!Object.hasOwn(RUNTIME_DATABASE_ROLE_KEYS, role)) {
    throw new DatabaseRoleConfigurationError("unknown runtime database role");
  }
  // parseServerEnv enforces distinct role URLs and migration-owner separation.
  const environment = parseServerEnv(source);
  const key = RUNTIME_DATABASE_ROLE_KEYS[role];
  const url = environment[key];
  if (!url) {
    throw new DatabaseRoleConfigurationError(
      `${key} is required for the ${role} database role`,
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
