"use client";

// Shown when a page or an action fails unexpectedly.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty">
      <h1>Something went wrong</h1>
      <p>It may be a temporary problem. Try again, or reload the page.</p>
      <button type="button" className="button primary" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
