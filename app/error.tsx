"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page_render_failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="state-page">
      <p className="eyebrow">SYSTEM STATUS</p>
      <h1>This view could not be loaded.</h1>
      <p>Published records remain unchanged. Retry the read when ready.</p>
      <button className="button button-primary" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
