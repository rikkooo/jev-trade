import Link from "next/link";

export default function NotFound() {
  return (
    <main className="state-page">
      <p className="eyebrow">404 · RECORD NOT FOUND</p>
      <h1>That market record is not in the ledger.</h1>
      <p>Check the symbol or return to the current simulation.</p>
      <Link className="button button-primary" href="/">
        Return to markets
      </Link>
    </main>
  );
}
