"use client";
import { useEffect, useState } from "react";
import { AsciiFrame } from "@/app/(app)/dashboard/partials/redesign/AsciiFrame";
import { FONT, T } from "@/app/(app)/dashboard/partials/redesign/mono";
import { useCogniInstance } from "@/modules/tenant/TenantProvider";
import { channelForSessionId, listSessions, type SessionRow } from "@/modules/sessions/getSessions";
import type { SessionIdentity } from "@/modules/sessions/sessionOperations";
import { useSessionCoverage } from "@/modules/sessions/useSessionCoverage";
import type { CoverageCategory } from "@/modules/sessions/sessionCoverage";
import NeutralButton from "@/ui/elements/NeutralButton";

function Category({ title, item }: { title: string; item: CoverageCategory }) {
  return <section aria-label={title} style={{ border: `1px solid ${T.frame}`, borderRadius: 10, padding: 16, background: T.chromeAlt }}>
    <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
    <p>Received and currently retained: {item.received.state === "counted" ? item.received.count : item.received.state.replaceAll("_", " ")}</p>
    <p>Recorded persistence checkpoint: {item.checkpoint.state === "recorded" ? item.checkpoint.count : item.checkpoint.state.replaceAll("_", " ")}</p>
    {item.checkpoint.state === "recorded" && <p>Checkpoint date: {item.checkpoint.updated_at ?? "unavailable"}</p>}
    <p>Difference from recorded checkpoint: {item.comparison.state === "difference" ? item.comparison.count : item.comparison.state.replaceAll("_", " ")}</p>
  </section>;
}

export default function Page() {
  const { cogniInstance, isInitializing } = useCogniInstance();
  const [offset, setOffset] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [inventory, setInventory] = useState<{ instance: typeof cogniInstance; offset: number; rows: SessionRow[];
    more: boolean; loading: boolean; error: boolean } | null>(null);
  const [selection, setSelection] = useState<{ instance: typeof cogniInstance; identity: SessionIdentity } | null>(null);
  useEffect(() => {
    if (!cogniInstance || isInitializing) return;
    const readSelection = () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session");
      const userId = params.get("owner");
      setSelection(sessionId && userId ? { instance: cogniInstance, identity: { sessionId, userId } } : null);
    };
    readSelection();
    window.addEventListener("popstate", readSelection);
    return () => window.removeEventListener("popstate", readSelection);
  }, [cogniInstance, isInitializing]);
  const identity = selection?.instance === cogniInstance ? selection.identity : null;
  const coverage = useSessionCoverage(cogniInstance, identity);
  useEffect(() => {
    if (!cogniInstance || isInitializing) return;
    let active = true;
    const controller = new AbortController();
    setInventory({ instance: cogniInstance, offset, rows: [], more: false, loading: true, error: false });
    listSessions(cogniInstance, { range: "all", limit: 50, offset }, { signal: controller.signal }).then((page) => {
      if (active) setInventory({ instance: cogniInstance, offset, rows: page.sessions,
        more: page.has_more, loading: false, error: !!page.failed });
    }).catch(() => {
      if (active) setInventory({ instance: cogniInstance, offset, rows: [], more: false, loading: false, error: true });
    });
    return () => { active = false; controller.abort(); };
  }, [cogniInstance, isInitializing, offset, nonce]);
  const page = inventory?.instance === cogniInstance && inventory.offset === offset ? inventory : null;
  const params = identity ? new URLSearchParams({ session: identity.sessionId, owner: identity.userId }) : null;
  return <div style={{ ...FONT, minHeight: "100%", padding: "24px 32px 32px", color: T.text }}>
    <AsciiFrame label="Memory Coverage" minHeight={320}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Memory Coverage</h1>
        <p>Records this server received and currently retains, alongside recorded persistence checkpoints.</p>
        <nav style={{ display: "flex", gap: 16 }}><a style={{ color: T.lavender, textDecoration: "underline" }} href="/sessions">Sessions</a> · <a style={{ color: T.lavender, textDecoration: "underline" }} href="/activity">Activity</a></nav>
        <section aria-label="Choose a session" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Choose a session</h2>
          <NeutralButton onClick={() => setNonce((n) => n + 1)} disabled={isInitializing || !cogniInstance || !!page?.loading}>Refresh sessions</NeutralButton>
          {isInitializing && <p role="status">Connecting to Cognee…</p>}
          {!isInitializing && !cogniInstance && <p role="alert">No Cognee instance is connected. <a style={{ color: T.lavender, textDecoration: "underline" }} href="/local-login">Sign in</a></p>}
          {cogniInstance && !isInitializing && (!page || page.loading) && <p role="status">Loading sessions…</p>}
          {page?.error && <p role="alert">Unable to read sessions. <NeutralButton onClick={() => setNonce((n) => n + 1)}>Retry sessions</NeutralButton></p>}
          {page && !page.loading && !page.error && page.rows.length === 0 && <p>No sessions on this page.</p>}
          {page?.rows.map((row) => {
            const selected = identity?.sessionId === row.session_id && identity.userId === row.user_id;
            return <div key={JSON.stringify([row.user_id, row.session_id])}>
            <NeutralButton aria-label={`${row.session_id} · ${row.user_id}`} aria-pressed={selected}
              style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", padding: 14, ...(selected ? { background: T.purpleSoft, color: T.lavender, borderColor: T.lavender } : {}) }}
              onClick={() => {
                setSelection({ instance: cogniInstance, identity: { sessionId: row.session_id, userId: row.user_id } });
                window.history.replaceState(null, "", `/memory-gap-analysis?${new URLSearchParams({ session: row.session_id, owner: row.user_id })}`);
              }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 5, overflowWrap: "anywhere", minWidth: 0 }}>
                <strong>{channelForSessionId(row.session_id)} · {row.session_id}</strong>
                <span style={{ fontSize: 11 }}>Owner {row.user_id}</span>
                {row.last_activity_at && <span style={{ fontSize: 11 }}>Last active {row.last_activity_at}</span>}
              </span>
            </NeutralButton>
          </div>;})}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><NeutralButton disabled={offset === 0 || !page || page.loading} onClick={() => setOffset((n) => Math.max(0, n - 50))}>Previous sessions</NeutralButton>
          <NeutralButton disabled={!page?.more || page.loading} onClick={() => setOffset((n) => n + 50)}>Next sessions</NeutralButton></div>
        </section>
        {identity && <section aria-label="Selected session coverage">
          <p>Session {identity.sessionId} · Owner {identity.userId}</p>
          <a style={{ color: T.lavender, textDecoration: "underline" }} href={`/sessions?${params}`}>View session</a> · <a style={{ color: T.lavender, textDecoration: "underline" }} href={`/activity?${params}`}>View recorded processing in Activity</a>
          <div><NeutralButton onClick={coverage.refresh} disabled={coverage.loading}>Refresh coverage</NeutralButton></div>
          {coverage.loading && <p role="status">Loading coverage…</p>}
          {coverage.error && <p role="alert">{coverage.error} <NeutralButton onClick={coverage.refresh}>Retry coverage</NeutralButton></p>}
          {coverage.stale && <p role="status">Stale coverage. Refresh to observe current facts.</p>}
          {coverage.data && <>
            <p>Observed at {coverage.data.observed_at} · Dataset {coverage.data.dataset_id ?? "no dataset"}</p>
            <Category title="Q/A records" item={coverage.data.qa} />
            <Category title="Tool traces" item={coverage.data.trace} />
          </>}
        </section>}
        <p>Reads are ordered and independent, not a transactional snapshot. Expiry or deletion followed by new records can make counts equal without persistence. A numeric difference does not identify individual records.</p>
        <p>A missing checkpoint may mean expired context. A checkpoint may advance before a later improve step fails. Checkpoints are owner/session scoped, not dataset membership or proof that graph documents still exist today.</p>
        <p>Retained records do not prove all client turns arrived. This server cannot report turns it never received or the client replay backlog.</p>
      </div>
    </AsciiFrame>
  </div>;
}
