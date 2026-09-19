import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  FlaskConical,
  LayoutGrid,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsConsent } from "./analytics-consent";

const navigation = [
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { href: "/scorecard", label: "Scorecard", icon: BarChart3 },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
] as const;

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="app-rail" aria-label="Primary">
        <Link className="brand-mark" href="/" aria-label="Jev Trade home">
          <FlaskConical aria-hidden="true" />
          <span>JT</span>
        </Link>
        <nav className="rail-nav">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-mode" aria-label="Application mode">
          <span className="mode-dot" aria-hidden="true" />
          Fixture
        </div>
      </aside>

      <div className="app-stage">
        <header className="topbar">
          <Link className="wordmark" href="/">
            <LayoutGrid aria-hidden="true" />
            <span>Jev Trade</span>
          </Link>
          <div className="topbar-context">
            <span className="simulation-pill">SIMULATION</span>
            <span className="topbar-data">
              Synthetic fixture data · no live feed
            </span>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          <p>
            Jev Trade is a market-judgment simulation. It does not execute
            trades or provide investment advice.
          </p>
          <nav aria-label="Footer">
            <Link href="/methodology#disclosures">Disclosures</Link>
            <Link href="/methodology#data-timing">Data timing</Link>
            <Link href="/methodology#privacy">Privacy</Link>
          </nav>
        </footer>
      </div>

      <nav className="mobile-nav" aria-label="Mobile primary">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link href={href} key={href}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <AnalyticsConsent />
    </div>
  );
}
