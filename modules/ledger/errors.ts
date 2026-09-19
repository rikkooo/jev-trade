export class LedgerInvariantError extends Error {
  readonly code = "LEDGER_INVARIANT";

  constructor(message: string) {
    super(message);
    this.name = "LedgerInvariantError";
  }
}

export class LedgerConflictError extends Error {
  readonly code = "LEDGER_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "LedgerConflictError";
  }
}

export class LedgerNotFoundError extends Error {
  readonly code = "LEDGER_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "LedgerNotFoundError";
  }
}
