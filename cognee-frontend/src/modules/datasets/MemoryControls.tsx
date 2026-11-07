"use client";
import Input from "@/ui/elements/Input";
import Select from "@/ui/elements/Select";
import CloseIcon from "@/ui/icons/CloseIcon";
import ModalShell from "@/ui/elements/ModalShell";
import type { MemoryDocuments } from "./useMemoryDocuments";
import styles from "./memoryReader.module.css";

export default function MemoryControls({ memory }: { memory: MemoryDocuments }) {
  const selected = memory.selected && memory.summary(memory.selected);
  return <>
    <div className={styles.toolbar}>
      <label className={styles.field}>Agent
        <Select aria-label="Memory agent" value={memory.agent} onChange={e => memory.setAgent(e.target.value)}>
          {["All", "OpenClaw", "Codex", "Claude", "Unknown", "Pending"].map(v => <option key={v}>{v}</option>)}
        </Select>
      </label>
      <label className={styles.field}>Type
        <Select aria-label="Memory type" value={memory.type} onChange={e => memory.setType(e.target.value)}>
          {["All", "Lesson", "Transcript", "Trace", "Report", "Unknown", "Pending"].map(v => <option key={v}>{v}</option>)}
        </Select>
      </label>
      <label className={`${styles.field} ${styles.search}`}>Search
        <Input aria-label="Search loaded memories" placeholder="Search loaded documents" value={memory.search} onChange={e => memory.setSearch(e.target.value)} />
      </label>
    </div>
    <div className={styles.scope}>
      <span role="status">{memory.filtered.length} matches among {memory.loaded} loaded <span className={styles.coverage}>· {memory.previewed} previewed · {memory.pending} pending · {memory.failed} preview errors</span></span>
      {memory.canPreview && <button className={styles.button} onClick={memory.previewNext}>Preview next 50</button>}
    </div>
    {selected && <ModalShell label="Memory reader" width={820} onClose={memory.close}>
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>Saved memory</p><h2 className={styles.title}>{selected.title}</h2></div>
        <button className={`${styles.button} ${styles.close}`} aria-label="Close memory reader" onClick={memory.close}><CloseIcon width={24} height={24} color="currentColor" /></button>
      </div>
      <div className={styles.metadata}>
        <span className={styles.badge}>{selected.kind}</span><span className={`${styles.badge} ${styles.agent}`}>{selected.agent}</span>
        {selected.sessionId ? <a className={styles.source} href={`/sessions?session=${encodeURIComponent(selected.sessionId)}`}>Source session ↗</a> : <span className={styles.unknown}>Source session unknown</span>}
      </div>
      <div className={styles.content}>
        <p className={styles.caption}>Stored text · shown exactly as saved</p>
        {!memory.body || memory.body.kind === "loading" ? <p className={styles.message}>Loading memory…</p> : memory.body.kind === "error" ? <div role="alert" className={styles.message}>Could not load memory. <button className={styles.button} onClick={memory.retry}>Retry</button></div> : <pre className={styles.body}>{memory.body.text}</pre>}
      </div>
    </ModalShell>}
  </>;
}
