"use client";

import type { RecordedRun } from "@/modules/sessions/sessionOperations";

export default function RecordedRunCard({ run }: { run: RecordedRun }) {
  return (
    <article style={{ border: "1px solid rgba(188,155,255,0.35)", borderRadius: 10, padding: 14, fontSize: 12, overflowWrap: "anywhere" }}>
      <strong style={{ color: "#BC9BFF" }}>{run.operation_name ?? run.pipeline_name ?? "Name not recorded"}</strong>
      <div>Kind: {run.kind} · Status: {run.status ?? "not recorded"} · Outcome: {run.outcome ?? "not recorded"}</div>
      <div>Background: {run.background === null ? "not recorded" : String(run.background)} · Origin: {run.origin ?? "not recorded"}</div>
      <div>Recorded: {run.created_at ?? "not recorded"}</div>
      <div>Started: {run.started_at ?? "not recorded"} · Ended: {run.ended_at ?? "not recorded"}</div>
      {run.error_class && <div>Error class: {run.error_class}</div>}
    </article>
  );
}
