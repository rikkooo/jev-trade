function argument(name: string): string {
  const position = process.argv.indexOf(`--${name}`);
  const value = position < 0 ? undefined : process.argv[position + 1];
  if (!value?.trim()) throw new Error(`--${name} is required`);
  return value.trim();
}

const operationId = argument("operation-id");
const idempotencyKey = argument("idempotency-key");
const reason = argument("reason");
const requestedBy = argument("requested-by");

if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
  throw new Error("--idempotency-key has an invalid format");
}

process.stdout.write(
  `${JSON.stringify(
    {
      contractVersion: "operator-replay-v1",
      operationId,
      idempotencyKey,
      reason,
      requestedBy,
      preparedAt: new Date().toISOString(),
      mutationApplied: false,
      instruction:
        "Submit this contract through the authenticated operator adapter after durable writes are enabled.",
    },
    null,
    2,
  )}\n`,
);
