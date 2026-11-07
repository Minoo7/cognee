import isMemoryBlobName from "./isMemoryBlobName";
import { channelForSessionId } from "../sessions/getSessions";

export const MEMORY_KINDS = ["Lesson", "Transcript", "Trace", "Report", "Unknown", "Pending", "Unreadable"] as const;
export const MEMORY_AGENTS = ["OpenClaw", "Codex", "Claude", "Unknown", "Pending", "Unreadable"] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemoryAgent = typeof MEMORY_AGENTS[number];
export interface MemoryRow {
  sourceRequested?: boolean; metadataUnavailable?: boolean; id: string; name: string; extension?: string; mimeType?: string; externalMetadata?: unknown;
  createdAt?: string; updatedAt?: string; label?: string; dataSize?: number; size?: number; rawDataLocation?: string;
}
interface MemoryRowDTO extends MemoryRow {
  originalExtension?: string; original_extension?: string; originalMimeType?: string; original_mime_type?: string;
  size_bytes?: number; file_size?: number;
}
export function mapMemoryRow(row: MemoryRowDTO): MemoryRow {
  return { id: row.id, name: row.name || row.rawDataLocation?.split("/").pop() || row.id,
    extension: row.originalExtension || row.original_extension || row.extension,
    mimeType: row.originalMimeType || row.original_mime_type || row.mimeType,
    size: row.dataSize ?? row.size ?? row.size_bytes ?? row.file_size, dataSize: row.dataSize,
    createdAt: row.createdAt, updatedAt: row.updatedAt, label: row.label,
    rawDataLocation: row.rawDataLocation, externalMetadata: row.externalMetadata, metadataUnavailable: row.metadataUnavailable };
}
export interface MemorySummary {
  kind: MemoryKind; agent: MemoryAgent; title: string; snippet: string; sessionId: string | null; agentEvidence: string;
  provenance: { id: string; name: string; label?: string; savedAt?: string; updatedAt?: string; recordedDate?: string; size?: number; location?: string };
}
function conciseTitle(value: string) {
  const line = value.replace(/\s+/g, " ").trim();
  if (line.length <= 80) return line;
  const cut = line.lastIndexOf(" ", 79);
  return Array.from(line.slice(0, cut > 40 ? cut : 79)).filter(c => !/^[\uD800-\uDFFF]$/.test(c)).join("") + "…";
}
export function isBinaryMemoryRow(row: MemoryRow) {
  return Boolean(row.extension && !["txt", "md"].includes(row.extension.toLowerCase()) || row.mimeType && !row.mimeType.startsWith("text/") && !["application/json", "application/octet-stream"].includes(row.mimeType));
}
export function classifyMemory(row: MemoryRow, body?: string): MemorySummary | null {
  const metadata = row.externalMetadata;
  const tags = metadata && typeof metadata === "object" && "node_set" in metadata && Array.isArray(metadata.node_set)
    ? metadata.node_set.filter((tag): tag is string => typeof tag === "string") : [];
  const kinds = new Set<MemoryKind>();
  if (tags.some(t => t === "session_learnings" || t.startsWith("session_learnings:"))) kinds.add("Lesson");
  if (tags.includes("user_sessions_from_cache")) kinds.add("Transcript");
  if (tags.includes("agent_trace_feedbacks")) kinds.add("Trace");
  const report = row.name.match(/^memory_dreaming_(.+)_(\d{4}-\d{2}-\d{2})-md$/);
  const binary = isBinaryMemoryRow(row);
  if (!row.metadataUnavailable && !row.sourceRequested && (binary || (!isMemoryBlobName(row.name) && !report && kinds.size === 0))) return null;
  const ids = new Set(tags.filter(t => t.startsWith("session_learnings:")).map(t => t.slice(18)).filter(Boolean));
  const headingId = body?.match(/^(?:# Session learning \(session ([^\s)]+)\)|Session ID:[ \t]*(\S+))/);
  const bodyId = headingId?.[1] ?? headingId?.[2];
  if (bodyId) ids.add(bodyId);
  const sessionId = ids.size === 1 ? [...ids][0] : null;
  let kind: MemoryKind = kinds.size === 1 ? [...kinds][0] : kinds.size > 1 ? "Unknown" : body === undefined && !row.metadataUnavailable ? "Pending" : "Unknown";
  if (!kinds.size && (report || body?.startsWith("# memory/dreaming/"))) kind = "Report";
  else if (!kinds.size && headingId?.[1]) kind = "Lesson";
  else if (!kinds.size && body && markers(body).some(m => m.kind === "trace")) kind = "Trace";
  else if (!kinds.size && body && markers(body).some(m => m.kind === "turn")) kind = "Transcript";
  const channel = sessionId ? channelForSessionId(sessionId.toLowerCase()) : "";
  const agent: MemoryAgent = channel.includes("Claude") ? "Claude" : channel === "Codex" ? "Codex" : channel === "OpenClaw" ? "OpenClaw" : body === undefined && !sessionId && ids.size === 0 && !report && !row.metadataUnavailable ? "Pending" : "Unknown";
  const lines = body?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) ?? [];
  const contentLines = lines.filter(line => !/^(# Session learning|Session ID:|# memory\/dreaming\/|Answer:|Date:|Session date:|Report date:)/.test(line));
  const content = (kind === "Transcript" ? contentLines.find(line => /^Question:/.test(line)) : undefined)
    ?? contentLines.find(line => /^#{1,6}\s+/.test(line)) ?? contentLines[0];
  const decoded = kind === "Trace" && body ? presentMemory(body, kind).blocks.flatMap(block => block.kind === "trace" ? block.output.flatMap(piece => piece.kind === "text" && piece.text.trim() ? [piece.text] : []) : []) : [];
  const traceText = decoded.join("\n");
  const traceTitle = traceText.split(/\r?\n/).map(line => line.replace(/^#+\s*/, "").trim()).find(Boolean);
  const header = body?.split(/^(?:Question:|Answer:|[^\r\n]+? Output:|```|~~~|# )/m)[0];
  const title = row.label || (report ? `Dreaming ${report[1]} · ${report[2]}` : traceTitle || content?.replace(/^(?:Question:\s*|#+\s*)/, "").split(" Output: ")[0] || `${kind === "Pending" ? "Memory" : kind} · ${sessionId ?? (body === undefined ? "Preview pending" : body.length ? "Unknown source" : "Empty memory")}`);
  const agentEvidence = ids.size > 1 ? `Conflicting session IDs: ${[...ids].join(", ")}` : sessionId ? (agent === "Unknown" ? `Recorded session ID ${sessionId} maps to ${channel}; it does not identify Claude, Codex or OpenClaw` : `${channel} from recorded session ID ${sessionId}`) : "No recorded session ID or agent ownership in document metadata";
  return { kind, agent, title: conciseTitle(title), snippet: (traceText || content || "").slice(0, 280), sessionId, agentEvidence,
    provenance: { id: row.id, name: row.name, label: row.label, savedAt: row.createdAt, updatedAt: row.updatedAt,
      size: row.dataSize ?? row.size, location: row.rawDataLocation?.split(/[\\/]/).pop(),
      recordedDate: report?.[2] ?? body?.match(/^# memory\/dreaming\/[^\r\n]*?(\d{4}-\d{2}-\d{2})(?:\.md)?[ \t]*\r?$/m)?.[1] ?? header?.match(/^(?:Date|Session date|Report date):[ \t]*(.+)$/m)?.[1] } };

}

export type TraceOutput = { kind: "literal"; source: string } | { kind: "text"; source: string; label: string; text: string };
export type MemoryBlock =
  | { kind: "markdown"; source: string }
  | { kind: "literal"; source: string; reason: string }
  | { kind: "turn"; source: string; role: "Question" | "Answer"; text: string }
  | { kind: "trace"; source: string; tool: string; output: TraceOutput[]; reason?: string };
export interface MemoryPresentation { raw: string; blocks: MemoryBlock[] }

function markers(raw: string) {
  const found: { start: number; prefix: string; kind: "trace" | "turn"; label: string }[] = [];
  let fence: { char: string; length: number } | undefined;
  let start = 0;
  for (const line of raw.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const edge = line.match(/^ {0,3}(`{3,}|~{3,})(.*)/);
    if (edge) {
      if (!fence) fence = { char: edge[1][0], length: edge[1].length };
      else if (edge[1][0] === fence.char && edge[1].length >= fence.length && !edge[2].trim()) fence = undefined;
    } else if (!fence) {
      const turn = line.match(/^(Question|Answer):[ \t]*/);
      const trace = line.match(/^([^\r\n]+?) Output:[ \t]*/);
      if (turn) found.push({ start, prefix: turn[0], kind: "turn", label: turn[1] });
      else if (trace) found.push({ start, prefix: trace[0], kind: "trace", label: trace[1] });
    }
    start += line.length;
  }
  return found;
}

function jsonStringTokens() { return /"(?:[^"\\]|\\.)*"/g; }
function traceOutput(source: string): { output: TraceOutput[]; reason?: string } {
  try { JSON.parse(source); } catch {
    const start = source.match(/^\s*\{\s*"(stdout|stderr|content)"\s*:\s*"/);
    if (start) {
      const tail = source.slice(start[0].length);
      const prefix = tail.match(/^(?:[^"\\\r\n]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*/)?.[0] ?? "";
      if (prefix && tail[prefix.length] !== '"') {
        const text: unknown = JSON.parse('"' + prefix + '"');
        if (typeof text === "string") return { output: [{kind:"literal",source:start[0]}, {kind:"text",source:prefix,label:start[1],text}, {kind:"literal",source:tail.slice(prefix.length)}], reason: "Incomplete stored output. Decoded only the valid string prefix; the cut and original remain in Raw." };
      }
    }
    return { output: [{ kind: "literal", source }], reason: "Output is plain text or incomplete/invalid JSON. Preserved literally." };
  }
  return decodeKnownTextFields(source);
}
function decodeKnownTextFields(source: string): { output: TraceOutput[] } {
  const strings = jsonStringTokens();
  const output: TraceOutput[] = [];
  let last = 0;
  let token: RegExpExecArray | null;
  let contentDepth: number | undefined;
  let depth = 0;
  let scanned = 0;
  let key = "";
  while ((token = strings.exec(source))) {
    const gap = source.slice(scanned, token.index);
    for (const char of gap) {
      if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
      if ((char === "}" || char === "]") && contentDepth !== undefined && depth < contentDepth) contentDepth = undefined;
    }
    scanned = strings.lastIndex;
    const decoded: unknown = JSON.parse(token[0]);
    const tail = source.slice(scanned);
    if (/^\s*:/.test(tail)) {
      key = typeof decoded === "string" ? decoded : "";
      if (key === "content" && /^\s*:\s*[\[{]/.test(tail)) contentDepth = depth + 1;
    } else if (typeof decoded === "string") {
      const directText = /^\s*:\s*$/.test(gap) && (["stdout", "stderr", "content"].includes(key) || (key === "text" && contentDepth !== undefined));
      const contentItem = contentDepth !== undefined && /[\[,]\s*$/.test(gap);
      if (!directText && !contentItem) { key = ""; continue; }
      if (last < token.index) output.push({ kind: "literal", source: source.slice(last, token.index) });
      output.push({ kind: "text", source: token[0], label: directText ? key : "content", text: decoded });
      last = strings.lastIndex;
      key = "";
    }
  }
  if (last < source.length) output.push({ kind: "literal", source: source.slice(last) });
  return { output };
}

export function presentMemory(raw: string, kind: MemoryKind): MemoryPresentation {
  if (kind === "Lesson" || kind === "Report") return { raw, blocks: [{ kind: "markdown", source: raw }] };
  const boundaries = markers(raw).filter(m => kind === "Trace" ? m.kind === "trace" : kind === "Transcript" ? m.kind === "turn" : false);
  const blocks: MemoryBlock[] = [];
  if (!boundaries.length) return { raw, blocks: [{ kind: "literal", source: raw, reason: "No unambiguous structured boundaries. Preserved literally." }] };
  if (boundaries[0].start) blocks.push({ kind: "literal", source: raw.slice(0, boundaries[0].start), reason: "Recorded header" });
  boundaries.forEach((mark, i) => {
    const source = raw.slice(mark.start, boundaries[i + 1]?.start ?? raw.length);
    const text = source.slice(mark.prefix.length);
    if (mark.kind === "turn") blocks.push({ kind: "turn", source, role: mark.label === "Question" ? "Question" : "Answer", text });
    else blocks.push({ kind: "trace", source, tool: mark.label, ...traceOutput(text) });
  });
  return { raw, blocks };
}
