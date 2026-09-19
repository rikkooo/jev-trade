"use client";

import { useEffect, useState } from "react";

import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "./browser-storage";

const CONSENT_KEY = "jev-trade.analytics.consent.v1";
const ID_KEY = "jev-trade.analytics.id.v1";
const ID_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

type Consent = "unknown" | "accepted" | "declined";

function createBrowserId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

interface BrowserIdentity {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

function createIdentity(now = Date.now()): BrowserIdentity {
  return {
    id: createBrowserId(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ID_TTL_MS).toISOString(),
  };
}

function ensureCurrentIdentity(): void {
  const now = Date.now();
  const raw = readBrowserStorage(ID_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw) as Partial<BrowserIdentity>;
      if (
        typeof stored.id === "string" &&
        typeof stored.expiresAt === "string" &&
        Date.parse(stored.expiresAt) > now
      ) {
        return;
      }
    } catch {
      // Invalid legacy values are replaced only after affirmative consent.
    }
  }
  writeBrowserStorage(ID_KEY, JSON.stringify(createIdentity(now)));
}

export function AnalyticsConsent() {
  const [consent, setConsent] = useState<Consent>("unknown");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const stored = readBrowserStorage(CONSENT_KEY);
    if (stored === "accepted" || stored === "declined") {
      if (stored === "accepted") ensureCurrentIdentity();
      // Browser storage is the source of truth after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConsent(stored);
      setExpanded(false);
    }
  }, []);

  function accept() {
    writeBrowserStorage(CONSENT_KEY, "accepted");
    ensureCurrentIdentity();
    setConsent("accepted");
    setExpanded(false);
  }

  function decline() {
    writeBrowserStorage(CONSENT_KEY, "declined");
    removeBrowserStorage(ID_KEY);
    setConsent("declined");
    setExpanded(false);
  }

  if (!expanded && consent !== "unknown") {
    return (
      <button
        className="consent-status"
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Review analytics preference"
      >
        <span
          className={
            consent === "accepted" ? "status-dot-on" : "status-dot-off"
          }
        />
        Analytics are {consent === "accepted" ? "on" : "off"}
      </button>
    );
  }

  return (
    <section className="consent-panel" aria-labelledby="consent-title">
      <div>
        <p className="eyebrow">OPTIONAL PRODUCT ANALYTICS</p>
        <h2 id="consent-title">Help measure the experiment?</h2>
        <p>
          Accepting creates a random browser ID stored locally. In this fixture
          release, no analytics are uploaded. Declining never blocks the app.
        </p>
      </div>
      <div className="consent-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={accept}
        >
          Accept analytics
        </button>
        <button className="button button-quiet" type="button" onClick={decline}>
          Decline analytics
        </button>
      </div>
    </section>
  );
}
