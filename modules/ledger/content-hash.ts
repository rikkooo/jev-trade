import { canonicalJson, sha256Text, type JsonValue } from "./canonical-json";

export const LEDGER_CONTENT_HASH_RECIPE =
  "jev-ledger-canonical-json/v1" as const;

export interface LedgerHashEnvelope {
  readonly recipe: typeof LEDGER_CONTENT_HASH_RECIPE;
  readonly kind: "market_snapshot" | "judgment_run" | "policy_decision";
  readonly payload: JsonValue;
}

export function ledgerHashEnvelope(
  kind: LedgerHashEnvelope["kind"],
  payload: JsonValue,
): LedgerHashEnvelope {
  return { recipe: LEDGER_CONTENT_HASH_RECIPE, kind, payload };
}

export function computeLedgerContentHash(
  kind: LedgerHashEnvelope["kind"],
  payload: JsonValue,
): { readonly canonicalPayload: string; readonly contentHash: string } {
  const canonicalPayload = canonicalJson(ledgerHashEnvelope(kind, payload));
  return { canonicalPayload, contentHash: sha256Text(canonicalPayload) };
}
