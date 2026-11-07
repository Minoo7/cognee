import isMemoryBlobName from "./isMemoryBlobName";
import { channelForSessionId } from "../sessions/getSessions";

export interface MemoryRow { id: string; name: string; extension?: string; mimeType?: string; externalMetadata?: unknown }
export type MemoryKind = "Lesson" | "Transcript" | "Trace" | "Report" | "Unknown" | "Pending";
export type MemoryAgent = "OpenClaw" | "Codex" | "Claude" | "Unknown" | "Pending";
export interface MemorySummary { kind: MemoryKind; agent: MemoryAgent; title: string; snippet: string; sessionId: string | null }

export function classifyMemory(row: MemoryRow, body?: string): MemorySummary | null {
  const metadata = row.externalMetadata;
  const tags = metadata && typeof metadata === "object" && "node_set" in metadata && Array.isArray(metadata.node_set)
    ? metadata.node_set.filter((tag): tag is string => typeof tag === "string") : [];
  const kinds = new Set<MemoryKind>();
  if (tags.some(t => t === "session_learnings" || t.startsWith("session_learnings:"))) kinds.add("Lesson");
  if (tags.includes("user_sessions_from_cache")) kinds.add("Transcript");
  if (tags.includes("agent_trace_feedbacks")) kinds.add("Trace");
  const report = row.name.match(/^memory_dreaming_(.+)_(\d{4}-\d{2}-\d{2})-md$/);
  const binary = row.extension && !["txt", "md"].includes(row.extension.toLowerCase()) || row.mimeType && !row.mimeType.startsWith("text/") && row.mimeType !== "application/octet-stream";
  if (binary || (!isMemoryBlobName(row.name) && !report && kinds.size === 0)) return null;
  const ids = new Set(tags.filter(t => t.startsWith("session_learnings:")).map(t => t.slice(18)).filter(Boolean));
  const headingId = body?.match(/^(?:# Session learning \(session ([^\s)]+)\)|Session ID:\s*(\S+))/);
  const bodyId = headingId?.[1] ?? headingId?.[2];
  if (bodyId) ids.add(bodyId);
  const sessionId = ids.size === 1 ? [...ids][0] : null;
  let kind: MemoryKind = kinds.size === 1 ? [...kinds][0] : kinds.size > 1 ? "Unknown" : body === undefined ? "Pending" : "Unknown";
  if (report || body?.startsWith("# memory/dreaming/")) kind = "Report";
  else if (!kinds.size && headingId) kind = headingId[1] ? "Lesson" : "Transcript";
  const channel = sessionId ? channelForSessionId(sessionId.toLowerCase()) : "";
  const agent: MemoryAgent = channel.includes("Claude") ? "Claude" : channel === "Codex" ? "Codex" : channel === "OpenClaw" ? "OpenClaw" : body === undefined && !sessionId && ids.size === 0 && !report ? "Pending" : "Unknown";
  const lines = body?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) ?? [];
  const content = lines.find(line => !/^(# Session learning|Session ID:|# memory\/dreaming\/|Answer:)/.test(line));
  const title = report ? `Dreaming ${report[1]} · ${report[2]}` : content?.replace(/^Question:\s*/, "").slice(0, 160) || `${kind === "Pending" ? "Memory" : kind} · ${sessionId ?? (body === undefined ? "Preview pending" : body.length ? "Unknown source" : "Empty memory")}`;
  return { kind, agent, title, snippet: content?.slice(0, 280) ?? "", sessionId };
}
