"use client";

import SkeletonBar from "@/ui/elements/SkeletonBar";
import { BACKGROUND_NOTICE, HISTORY_NOTICE, latestSessionRecords, type SessionIdentity } from "@/modules/sessions/sessionOperations";
import type { useRecordedRuns } from "./useSessionProcessing";
import RecordedRunCard from "./RecordedRunCard";

export default function RecordedProcessingCard({ identity, history }: {
  identity: SessionIdentity; history: ReturnType<typeof useRecordedRuns>;
}) {
  const runs = latestSessionRecords(identity, history.rows);
  const params = new URLSearchParams({ session: identity.sessionId, owner: identity.userId });
  return (
    <section aria-label="Recorded processing" style={{ border: "1px solid rgba(188,155,255,0.35)", borderRadius: 10,
      padding: 16, display: "flex", flexDirection: "column", gap: 10,
      background: "linear-gradient(135deg, rgba(101,16,244,0.16), rgba(101,16,244,0.05))" }}>
      <strong style={{ fontSize: 12, color: "#BC9BFF" }}>Recorded processing</strong>
      <a href={`/activity?${params}`} style={{ color: "#BC9BFF" }}>View raw records in Activity</a>
      <button onClick={history.refresh} disabled={history.loading}>Refresh processing</button>
      {history.loading && <div role="status">Loading processing records…<SkeletonBar width={180} /></div>}
      {history.error && <div role="alert">{history.error} <button onClick={history.refresh}>Retry processing</button> {history.errorStatus === 401 && <a href="/local-login">Sign in</a>}</div>}
      {history.stale && <p role="status">Stale processing records retained after a read failure.</p>}
      {!history.loading && !history.error && runs.length === 0 && <p>No linked processing records available.</p>}
      {runs.map((run) => <RecordedRunCard key={run.id} run={run} />)}
      {history.nextOffset !== null && <button onClick={history.loadMore} disabled={history.loading}>Load more processing</button>}
      <p style={{ fontSize: 11, margin: 0 }}>{history.nextOffset !== null ? "Partial history: more pages may be available. " : "End of currently accessible pages. "}{HISTORY_NOTICE}</p>
      <p style={{ fontSize: 11, margin: 0 }}>{BACKGROUND_NOTICE} Outcomes including noop and unknown values are shown literally.</p>
    </section>
  );
}
