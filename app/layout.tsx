import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: {
    default: "Jev Trade · Market judgment lab",
    template: "%s · Jev Trade",
  },
  description:
    "A transparent market simulation that freezes Jev judgments, applies deterministic risk rules, and scores the outcomes.",
  applicationName: "Jev Trade",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090d12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
