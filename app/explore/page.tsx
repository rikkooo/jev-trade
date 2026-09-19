import type { Metadata } from "next";

import { ForecastCard } from "@/components/forecast-card";
import { SymbolSearch } from "@/components/symbol-search";
import { getUniverse } from "@/modules/view-model";

export const metadata: Metadata = { title: "Explore fixture universe" };

export default function ExplorePage() {
  const universe = getUniverse();
  return (
    <div className="page-wrap">
      <header className="page-header">
        <p className="eyebrow">OPERATOR-APPROVED DEMO UNIVERSE</p>
        <h1>Explore every fixture state</h1>
        <p>
          These fictional symbols demonstrate current, resolved, stale,
          incomplete, failed, corrected, and void behavior without live market
          data.
        </p>
      </header>
      <SymbolSearch universe={universe} />
      <div className="state-key" aria-label="Fixture state key">
        <span>8 fictional symbols</span>
        <span>7 lifecycle states</span>
        <span>0 live quotes</span>
        <span>0 public writes</span>
      </div>
      <section
        className="forecast-grid forecast-grid-three"
        aria-label="Fixture symbol universe"
      >
        {universe.map((stock) => (
          <ForecastCard stock={stock} key={stock.forecastId} />
        ))}
      </section>
    </div>
  );
}
