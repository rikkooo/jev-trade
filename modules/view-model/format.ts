const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatCurrency(value: number): string {
  return currency.format(value);
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatUtc(value: string): string {
  return `${dateTime.format(new Date(value))} UTC`;
}

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
