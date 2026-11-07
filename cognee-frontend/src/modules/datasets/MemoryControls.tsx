"use client";
import { useState } from "react";
import MarkdownContent from "@/ui/elements/MarkdownContent";
import { MEMORY_AGENTS, MEMORY_KINDS, presentMemory, type MemoryBlock } from "./memoryDocument";
import Input from "@/ui/elements/Input";
import Select from "@/ui/elements/Select";
import CloseIcon from "@/ui/icons/CloseIcon";
import ModalShell from "@/ui/elements/ModalShell";
import type { MemoryDocuments } from "./useMemoryDocuments";
import styles from "./memoryReader.module.css";

export default function MemoryControls({ memory }: { memory: MemoryDocuments }) {
  const [rawView, setRawView] = useState<string | null>(null);
  const selected = memory.selected && memory.summary(memory.selected);
  return <>
    <div className={styles.toolbar}>
      <label className={styles.field}>Agent
        <Select aria-label="Memory agent" value={memory.agent} onChange={e => memory.setAgent(e.target.value)}>
          {["All", ...MEMORY_AGENTS].map(v => <option key={v}>{v}</option>)}
        </Select>
      </label>
      <label className={styles.field}>Type
        <Select aria-label="Memory type" value={memory.type} onChange={e => memory.setType(e.target.value)}>
          {["All", ...MEMORY_KINDS].map(v => <option key={v}>{v}</option>)}
        </Select>
      </label>
      <label className={`${styles.field} ${styles.search}`}>Search
        <Input aria-label="Search loaded memories" placeholder="Search loaded documents" value={memory.search} onChange={e => memory.setSearch(e.target.value)} />
      </label>
    </div>
    <div className={styles.scope}>
      <span role="status">{memory.filtered.length} matches among {memory.loaded} loaded rows{memory.total != null && memory.total >= 0 ? ` of ${memory.total} in dataset` : " · dataset total unknown"} <span className={styles.coverage}>· {memory.previewed} complete bodies searched · {memory.pending} loading · {memory.notRead ?? 0} not read · {memory.failed} preview errors</span></span>
      {memory.previewing && <button className={styles.button} onClick={memory.stopPreviews}>Stop previews</button>}
      {memory.canPreview && <button className={styles.button} onClick={memory.previewNext}>Preview next 50</button>}
    </div>
    <div className={styles.indexed}>
      <button className={styles.button} disabled={!memory.search.trim() || memory.indexed.kind === "loading"} onClick={memory.searchIndexed}>Search indexed passages</button>
      <p className={styles.caption}>Keyword ranking · processed text only · incomplete coverage · saved to search history. Client cancellation does not prove server cancellation.</p>
      {memory.indexed.kind === "loading" && <p role="status">Searching indexed passages…</p>}
      {memory.indexed.kind === "error" && <p role="alert">{memory.indexed.reason}</p>}
      {memory.indexed.kind === "ready" && <div aria-label="Ranked indexed passages">
        <p>Indexed results for “{memory.indexed.query}” · {memory.indexed.passages.length} passages</p>
        {memory.indexed.passages.map((hit, i) => <article className={styles.block} key={i}>
          <p>Rank {i + 1} · {hit.name || "Source name unavailable"}</p><pre className={styles.literal}>{hit.text}</pre>
          {hit.documentId ? <button className={styles.button} onClick={() => { setRawView(null); if (hit.documentId) memory.openSource(hit.documentId); }}>Open source document</button> : <p>Source unavailable · no valid document_id recorded</p>}
        </article>)}
      </div>}
    </div>
    {selected && memory.selected && <ModalShell label="Memory reader" width={820} onClose={memory.close}>
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>{memory.selected.sourceRequested || memory.selected.metadataUnavailable ? "Source document" : `Saved ${selected.kind.toLowerCase()}`}</p><h2 className={styles.title}>{selected.title}</h2></div>
        <button className={`${styles.button} ${styles.close}`} aria-label="Close memory reader" onClick={memory.close}><CloseIcon width={24} height={24} color="currentColor" /></button>
      </div>
      <div className={styles.metadata}>
        <span className={styles.badge}>{selected.kind}</span><span className={`${styles.badge} ${styles.agent}`}>{selected.agent}</span>
        {selected.sessionId ? <a className={styles.source} href={`/sessions?session=${encodeURIComponent(selected.sessionId)}`}>Source session ↗</a> : <span className={styles.unknown}>Source session unknown</span>}
      </div>
      <p className={styles.caption}>{selected.agentEvidence}</p>
      <dl className={styles.provenance}>
        {Object.entries({ "Document ID": selected.provenance.id, "Original name": selected.provenance.name,
          "Label": selected.provenance.label, "Saved": selected.provenance.savedAt, "Updated": selected.provenance.updatedAt,
          "Recorded session/report date": selected.provenance.recordedDate, "Size in bytes": selected.provenance.size,
          "Location basename": selected.provenance.location }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Not recorded"}</dd></div>)}
      </dl>
      <div className={styles.content}>
        <div className={styles.tabs}>
          <button className={styles.button} aria-pressed={rawView !== memory.selected.id} onClick={() => setRawView(null)}>Readable</button>
          <button className={styles.button} aria-pressed={rawView === memory.selected.id} onClick={() => setRawView(memory.selected?.id ?? null)}>Raw</button>
        </div>
        {!memory.body || memory.body.kind === "loading" ? <p className={styles.message}>Loading memory…</p> : memory.body.kind === "error" ? <div role="alert" className={styles.message}>Unreadable. {memory.body.reason} <button className={styles.button} onClick={memory.retry}>Retry</button></div> : rawView === memory.selected.id ? <><p className={styles.caption}>Stored text · shown exactly as saved</p><pre className={styles.body}>{memory.body.text}</pre></> : <div className={styles.readable}>
          {presentMemory(memory.body.text, selected.kind).blocks.map((block, i) => <Block key={i} block={block} />)}
        </div>}
      </div>
    </ModalShell>}
  </>;
}

function Block({ block }: { block: MemoryBlock }) {
  switch (block.kind) {
    case "markdown": return <MarkdownContent text={block.source} />;
    case "turn": return <section className={styles.block}><h3>{block.role}</h3><MarkdownContent text={block.text} /></section>;
    case "literal": return <section><p className={styles.caption}>{block.reason}</p><pre className={styles.literal}>{block.source}</pre></section>;
    case "trace": return <section className={styles.block}><h3>{block.tool}</h3>{block.reason && <p className={styles.caption}>{block.reason}</p>}
      {block.output.filter(piece => piece.kind !== "text" || piece.text.trim()).filter(piece => piece.kind === "text" || !block.output.some(p => p.kind === "text" && p.text.trim())).map((piece, i) => piece.kind === "text" ? <div key={i}><h4>{piece.label}</h4><pre className={styles.literal}>{piece.text}</pre></div> : <pre key={i} className={styles.literal}>{piece.source}</pre>)}
      {block.output.some(p => p.kind === "text" && p.text.trim()) && <details><summary>Original output structure</summary><pre className={styles.literal}>{block.source}</pre></details>}
    </section>;
  }
}
