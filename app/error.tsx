"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="route-error">
      <AlertCircle size={34} aria-hidden="true" />
      <p className="view-eyebrow">Workspace interrupted</p>
      <h1>The workspace could not finish rendering</h1>
      <p>
        Your browser-local draft has not been deleted. Try rendering the workspace
        again, or reload the page to restore the last saved draft.
      </p>
      <button className="primary-button" onClick={reset}>
        <RotateCcw size={16} />
        Try again
      </button>
      {error.digest && <small>Reference: {error.digest}</small>}
    </main>
  );
}
