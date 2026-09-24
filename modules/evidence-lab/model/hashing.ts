import {
  canonicalJson,
  sha256Text,
  type JsonValue,
} from "@/modules/ledger/canonical-json";

import { invalid } from "../errors";
import { compareCodeUnits } from "./primitives";

/**
 * Evidence Lab hashing reuses the locale-independent ledger canonicalizer.
 * `modules/judgment/canonical.ts` is locale-sensitive (#31) and must never be
 * used for Phase Two evidence.
 */
export const EVIDENCE_LAB_HASH_RECIPE =
  "jev-evidence-lab-canonical-json/v1" as const;
export const COMMAND_REQUEST_RECIPE =
  "jev-evidence-lab-command-request/v1" as const;
export const REGISTRY_ROOT_RECIPE =
  "jev-evidence-lab-registry-root/v1" as const;
export const ADMISSION_MANIFEST_RECIPE =
  "jev-evidence-lab-admission-manifest/v1" as const;
export const NORMALIZED_STATE_RECIPE =
  "jev-evidence-lab-normalized-state/v1" as const;

export type EvidenceLabRecordKind =
  | "operator_audit_event"
  | "registry_entry"
  | "registry_event"
  | "cohort"
  | "cohort_event"
  | "cohort_forecast_lock"
  | "source_revision"
  | "evidence_state"
  | "publication_receipt";

export interface Sealed {
  readonly canonicalPayload: string;
  readonly contentHash: string;
}

export type SealedRecord<T> = T & Sealed;

function hasNulOrLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const ASTRAL = /[\uD800-\uDFFF]/;

/**
 * PostgreSQL re-serializes every hashed payload and rejects any byte
 * difference. Values it cannot reproduce exactly (exponent-form numbers,
 * NUL, lone surrogates, or astral-plane object keys whose code-unit order
 * differs from byte order) are refused before hashing.
 */
export function assertDatabaseCanonical(value: unknown, path = "$"): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || /e/i.test(JSON.stringify(value))) {
      invalid(`${path} must be a finite number without exponent notation`);
    }
    return;
  }
  if (typeof value === "string") {
    if (hasNulOrLoneSurrogate(value)) {
      invalid(`${path} contains a character PostgreSQL JSON cannot store`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertDatabaseCanonical(entry, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (ASTRAL.test(key) || hasNulOrLoneSurrogate(key)) {
        invalid(`${path} has a key outside the canonical key alphabet`);
      }
      assertDatabaseCanonical(entry, `${path}.${key}`);
    }
    return;
  }
  invalid(`${path} is not JSON`);
}

export function canonicalEnvelope(
  kind: EvidenceLabRecordKind,
  payload: JsonValue,
): string {
  assertDatabaseCanonical(payload);
  return canonicalJson({ recipe: EVIDENCE_LAB_HASH_RECIPE, kind, payload });
}

export function seal<T extends object>(
  kind: EvidenceLabRecordKind,
  payload: T,
): SealedRecord<T> {
  const canonicalPayload = canonicalEnvelope(
    kind,
    payload as unknown as JsonValue,
  );
  return Object.freeze({
    ...payload,
    canonicalPayload,
    contentHash: sha256Text(canonicalPayload),
  });
}

/** Splits a sealed record into its hashed payload and verifies the seal. */
export function verifySeal<T extends Sealed>(
  kind: EvidenceLabRecordKind,
  record: T,
): Omit<T, keyof Sealed> {
  const { canonicalPayload, contentHash, ...payload } = record;
  const expected = canonicalEnvelope(kind, payload as unknown as JsonValue);
  if (expected !== canonicalPayload) {
    invalid(`${kind} canonical payload does not match its immutable fields`);
  }
  if (sha256Text(canonicalPayload) !== contentHash) {
    invalid(`${kind} content hash does not match its canonical payload`);
  }
  return payload;
}

export function commandRequestHash(input: {
  readonly command: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetContentHash: string;
}): string {
  return sha256Text(
    canonicalJson({
      recipe: COMMAND_REQUEST_RECIPE,
      command: input.command,
      targetKind: input.targetKind,
      targetId: input.targetId,
      targetContentHash: input.targetContentHash,
    }),
  );
}

export interface RegistryRootEntry {
  readonly slot: string;
  readonly kind: string;
  readonly entryId: string;
  readonly contentHash: string;
}

export function registryRootHash(
  entries: readonly RegistryRootEntry[],
): string {
  const sorted = [...entries]
    .map(({ slot, kind, entryId, contentHash }) => ({
      slot,
      kind,
      entryId,
      contentHash,
    }))
    .sort((left, right) => compareCodeUnits(left.slot, right.slot));
  return sha256Text(
    canonicalJson({ recipe: REGISTRY_ROOT_RECIPE, entries: sorted }),
  );
}

export interface AdmissionReference {
  readonly sourceRevisionId: string;
  readonly sourceContentHash: string;
}

export function admissionManifestHash(
  admissions: readonly AdmissionReference[],
): string {
  const sorted = [...admissions]
    .map(({ sourceRevisionId, sourceContentHash }) => ({
      sourceRevisionId,
      sourceContentHash,
    }))
    .sort((left, right) =>
      compareCodeUnits(left.sourceRevisionId, right.sourceRevisionId),
    );
  return sha256Text(
    canonicalJson({ recipe: ADMISSION_MANIFEST_RECIPE, admissions: sorted }),
  );
}

export function normalizedStateHash(state: JsonValue): string {
  assertDatabaseCanonical(state);
  return sha256Text(canonicalJson({ recipe: NORMALIZED_STATE_RECIPE, state }));
}
