"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StockSummaryView } from "@/modules/view-model";

export function SymbolSearch({
  universe,
  compact = false,
}: {
  readonly universe: readonly StockSummaryView[];
  readonly compact?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toUpperCase();
  const match = universe.find((item) => item.symbol === normalized);
  return (
    <form
      className={`symbol-search${compact ? " symbol-search-compact" : ""}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (match) router.push(`/stocks/${match.symbol.toLowerCase()}`);
      }}
    >
      <label htmlFor={compact ? "compact-symbol-search" : "symbol-search"}>
        Find a fixture symbol
      </label>
      <div className="search-control">
        <Search aria-hidden="true" />
        <input
          id={compact ? "compact-symbol-search" : "symbol-search"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try ACME, NOVA, MESA…"
          list="fixture-symbols"
          autoComplete="off"
        />
        <button type="submit" disabled={!match}>
          Open
        </button>
      </div>
      <datalist id="fixture-symbols">
        {universe.map((item) => (
          <option value={item.symbol} key={item.symbol}>
            {item.company}
          </option>
        ))}
      </datalist>
      {normalized && !match ? (
        <p className="field-hint" role="status">
          No matching synthetic fixture symbol.
        </p>
      ) : null}
    </form>
  );
}
