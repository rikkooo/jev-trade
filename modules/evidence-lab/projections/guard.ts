/**
 * Fail-closed leak detection for every projection that crosses a process
 * boundary. DTOs are allowlists; this guard is the second line, catching a
 * protected field by its key name or by its value even under a harmless key.
 */

export const PROTECTED_KEY_PATTERN =
  /(api[_-]?key|authori[sz]ation|credential|cookie|headers?$|password|passwd|secret|token|private[_-]?key|raw[_-]?(payload|prompt|response|body|source)|licensed[_-]?payload|protected[_-]?prompt|prompt[_-]?text|system[_-]?prompt|connection[_-]?string|database[_-]?url|actor[_-]?fingerprint|idempotency[_-]?key)/i;

interface ValuePattern {
  readonly name: string;
  readonly pattern: RegExp;
}

export const SECRET_VALUE_PATTERNS: readonly ValuePattern[] = [
  {
    name: "credentialed-connection-url",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^\s/@:]+:[^\s/@]+@/i,
  },
  { name: "url-userinfo", pattern: /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/i },
  { name: "bearer-token", pattern: /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { name: "provider-api-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  {
    name: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: "json-web-token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "credential-header",
    pattern:
      /\b(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-operator-token|x-cron-secret)\s*:/i,
  },
  {
    name: "secret-assignment",
    pattern:
      /\b(?:api[_-]?key|secret|token|password|passwd|cron[_-]?secret)\s*[:=]\s*["']?[^\s"']{8,}/i,
  },
];

export interface LeakFinding {
  readonly path: string;
  readonly reason: string;
}

export class ProjectionLeakError extends Error {
  readonly code = "PROJECTION_LEAK_BLOCKED";

  constructor(readonly findings: readonly LeakFinding[]) {
    // Paths and pattern names only: never the offending value.
    super(
      `projection blocked: ${findings
        .map((finding) => `${finding.path} (${finding.reason})`)
        .join(", ")}`,
    );
    this.name = "ProjectionLeakError";
  }
}

const SECRET_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "OPERATOR_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "PUBLIC_DATABASE_URL",
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "CRON_SECRET",
  "MARKET_DATA_API_KEY",
  "OPERATOR_TOKEN",
] as const;

const MINIMUM_PROTECTED_VALUE_LENGTH = 8;
const SAFE_PATH_SEGMENT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Exact configured secret values, and the password inside any configured URL. */
export function collectConfiguredSecrets(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const values = new Set<string>();
  for (const key of SECRET_ENVIRONMENT_KEYS) {
    const value = environment[key]?.trim();
    if (!value) continue;
    values.add(value);
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password) values.add(password);
    } catch {
      // Not a URL; the exact value is already protected.
    }
  }
  return [...values].filter(
    (value) => value.length >= MINIMUM_PROTECTED_VALUE_LENGTH,
  );
}

export interface ProjectionGuardOptions {
  /** Exact strings that must never appear: configured secrets, protected prompts, licensed payload text. */
  readonly protectedValues?: readonly string[];
}

export function findProtectedContent(
  value: unknown,
  options: ProjectionGuardOptions = {},
): readonly LeakFinding[] {
  const protectedValues = (options.protectedValues ?? []).filter(
    (candidate) => candidate.length >= MINIMUM_PROTECTED_VALUE_LENGTH,
  );
  const findings: LeakFinding[] = [];
  const textFindings = (text: string): string[] => {
    const reasons = SECRET_VALUE_PATTERNS.filter(({ pattern }) =>
      pattern.test(text),
    ).map(({ name }) => name);
    if (protectedValues.some((candidate) => text.includes(candidate))) {
      reasons.push("protected-value");
    }
    return reasons;
  };
  const inspectText = (text: string, path: string) => {
    for (const reason of textFindings(text)) findings.push({ path, reason });
  };
  const visit = (node: unknown, path: string, depth: number) => {
    if (depth > 64) {
      findings.push({ path, reason: "excessive-depth" });
      return;
    }
    if (typeof node === "string") {
      inspectText(node, path);
      return;
    }
    if (
      node === null ||
      typeof node === "number" ||
      typeof node === "boolean"
    ) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) =>
        visit(entry, `${path}[${index}]`, depth + 1),
      );
      return;
    }
    if (typeof node === "object") {
      Object.entries(node).forEach(([key, child], index) => {
        const keyReasons = textFindings(key);
        // A key that is itself protected, or is not a plain field name, is
        // never echoed into the error path.
        const childPath =
          keyReasons.length === 0 && SAFE_PATH_SEGMENT.test(key)
            ? `${path}.${key}`
            : `${path}[key ${index}]`;
        if (PROTECTED_KEY_PATTERN.test(key)) {
          findings.push({ path: childPath, reason: "protected-key" });
        }
        for (const reason of keyReasons) {
          findings.push({ path: `${childPath}#key`, reason });
        }
        visit(child, childPath, depth + 1);
      });
      return;
    }
    findings.push({ path, reason: "non-json-value" });
  };
  visit(value, "$", 0);
  return findings;
}

export function assertSafeProjection<T>(
  value: T,
  options: ProjectionGuardOptions = {},
): T {
  const findings = findProtectedContent(value, options);
  if (findings.length > 0) throw new ProjectionLeakError(findings);
  return value;
}
