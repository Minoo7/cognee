"use client";

import { useSearchParams } from "next/navigation";
import { AsciiFrame } from "@/app/(app)/dashboard/partials/redesign/AsciiFrame";
import { FONT, T } from "@/app/(app)/dashboard/partials/redesign/mono";
import SkeletonBar from "@/ui/elements/SkeletonBar";
import { useCogniInstance } from "@/modules/tenant/TenantProvider";
import { BACKGROUND_NOTICE, HISTORY_NOTICE } from "@/modules/sessions/sessionOperations";
import { useRecordedRuns } from "../sessions/partials/useSessionProcessing";

export default function Page() {
  const { cogniInstance, isInitializing } = useCogniInstance();
  const params = useSearchParams();
  const sessionId = params.get("session");
  const userId = params.get("owner");
  const invalidScope = (sessionId !== null || userId !== null) && (!sessionId || !userId);
  const identity = sessionId && userId ? { sessionId, userId } : undefined;
  const history = useRecordedRuns(invalidScope ? null : cogniInstance, identity);
  const cell = { padding: "10px 12px", verticalAlign: "top", borderBottom: `1px solid ${T.frame}`, overflowWrap: "anywhere" as const };
  return (
    <div style={{ ...FONT, minHeight: "100%", padding: "24px 32px 32px" }}>
      <AsciiFrame label="Activity" minHeight={320} meta="Native recorded operations and pipelines">
        {invalidScope ? <p role="alert">Session filtering requires both session and owner. <a href="/activity">View all accessible records</a></p> : <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={history.refresh} disabled={history.loading || isInitializing}>Refresh</button>
            {identity && <span>Session: {identity.sessionId} · Owner: {identity.userId} · <a href="/activity">Clear filter</a></span>}
          </div>
          {(isInitializing || history.loading) && <div role="status">Loading activity…<SkeletonBar width={220} /></div>}
          {history.error && <p role="alert">{history.error} <button onClick={history.refresh}>Retry</button></p>}
          {history.stale && <p role="status">Stale records retained after a read failure.</p>}
          {!history.loading && !history.error && history.rows.length === 0 && <p>{identity ? "No linked processing records available." : "No recorded activity available."}</p>}
          {history.rows.length > 0 && <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
              <caption style={{ textAlign: "left", color: T.muted }}>Raw ledger rows · {history.rows.length} loaded · no parent/child usage totals</caption>
              <thead><tr>{["Name / kind", "User / origin", "Dataset", "Linked sessions", "Status / outcome", "Timing", "Recorded metrics"].map((name) => <th key={name} scope="col" style={cell}>{name}</th>)}</tr></thead>
              <tbody>{history.rows.map((row) => <tr key={row.id}>
                <td style={cell}><strong>{row.operation_name ?? row.pipeline_name ?? "not recorded"}</strong><div>{row.kind}</div><div>Row: {row.id}</div><div>Run: {row.pipeline_run_id ?? "not recorded"}</div><div>Parent operation: {row.parent_operation_id ?? "not recorded"}</div></td>
                <td style={cell}>{row.user_id ?? "not recorded"}<div>Origin: {row.origin ?? "not recorded"}</div></td>
                <td style={cell}>{row.dataset_name ?? "Name not recorded"}<div>{row.dataset_id ?? "ID not recorded"}</div></td>
                <td style={cell}>{row.session_ids.length === 0 ? "not recorded" : row.session_ids.map((id) => <div key={id}>{row.user_id ? <a href={`/sessions?${new URLSearchParams({ session: id, owner: row.user_id })}`}>{id}</a> : id}</div>)}</td>
                <td style={cell}>Status: {row.status ?? "not recorded"}<div>Outcome: {row.outcome ?? "not recorded"}</div><div>Background: {row.background === null ? "not recorded" : String(row.background)}</div>{row.error_class && <div>Error class: {row.error_class}</div>}</td>
                <td style={cell}>Recorded: {row.created_at ?? "not recorded"}<div>Started: {row.started_at ?? "not recorded"}</div><div>Ended: {row.ended_at ?? "not recorded"}</div></td>
                <td style={cell}>Tokens in: {row.tokens_in ?? "not measured"}<div>Tokens out: {row.tokens_out ?? "not measured"}</div><div>Embedding tokens: {row.embedding_tokens ?? "not measured"}</div></td>
              </tr>)}</tbody>
            </table>
          </div>}
          {history.nextOffset !== null && <button style={{ marginTop: 12, alignSelf: "flex-start" }} onClick={history.loadMore} disabled={history.loading}>Load more</button>}
          <p style={{ color: T.muted, fontSize: 12 }}>{history.nextOffset !== null ? "Partial history: more pages may be available. " : "End of currently accessible pages once loading completes. "}{HISTORY_NOTICE}</p>
          <p style={{ color: T.muted, fontSize: 12 }}>{BACKGROUND_NOTICE} Status and outcome values, including noop and unknown values, are displayed literally. Null metrics mean not measured; zero means measured zero.</p>
        </>}
      </AsciiFrame>
    </div>
  );
}
