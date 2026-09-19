import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getPublicOrigin } from "@/modules/config/public-origin";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getPublicOrigin(),
  title: {
    default: "Jev Trade · Market judgment lab",
    template: "%s · Jev Trade",
  },
  description:
    "A synthetic market simulation that freezes Jev judgments, applies deterministic risk rules, and makes every decision auditable.",
  applicationName: "Jev Trade",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Jev Trade",
    title: "Jev Trade · Market judgment lab",
    description:
      "A synthetic market simulation with frozen Jev judgments, deterministic risk rules, and an auditable scorecard.",
  },
  twitter: {
    card: "summary",
    title: "Jev Trade · Market judgment lab",
    description:
      "Synthetic market judgments, deterministic risk rules, and an auditable scorecard.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070a0d",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
