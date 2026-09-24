import postgres from "postgres";

import {
  operatorDatabaseUrl,
  workerDatabaseUrl,
} from "@/modules/config/database";
import type { LedgerSqlClient } from "@/modules/ledger/postgres";

import { fromDatabaseError } from "../errors";
import {
  EvidenceLabOperatorStore,
  EvidenceLabWorkerStore,
} from "../registry/postgres";

export interface ClosableSqlClient extends LedgerSqlClient {
  close(): Promise<void>;
}

/**
 * Server-only PostgreSQL client. Driver errors are converted to typed
 * Evidence Lab errors so connection details never reach callers or logs.
 */
export function createPostgresSqlClient(url: string): ClosableSqlClient {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  return {
    async query(statement, parameters = []) {
      try {
        const rows = await sql.unsafe(
          statement,
          parameters as postgres.ParameterOrJSON<never>[],
        );
        return { rows: [...rows] as never };
      } catch (error: unknown) {
        throw fromDatabaseError(error);
      }
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

export interface OpenStore<Store> {
  readonly store: Store;
  close(): Promise<void>;
}

/** Binds the operator store to `OPERATOR_DATABASE_URL`; nothing else can select it. */
export function openOperatorStore(
  environment: Record<string, string | undefined> = process.env,
): OpenStore<EvidenceLabOperatorStore> {
  const client = createPostgresSqlClient(operatorDatabaseUrl(environment));
  return { store: new EvidenceLabOperatorStore(client), close: client.close };
}

/** Binds the worker store to `WORKER_DATABASE_URL`; nothing else can select it. */
export function openWorkerStore(
  environment: Record<string, string | undefined> = process.env,
): OpenStore<EvidenceLabWorkerStore> {
  const client = createPostgresSqlClient(workerDatabaseUrl(environment));
  return { store: new EvidenceLabWorkerStore(client), close: client.close };
}
