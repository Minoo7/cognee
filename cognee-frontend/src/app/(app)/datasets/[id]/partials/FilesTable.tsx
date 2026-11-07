"use client";

import type { ReactElement } from "react";
import FileIcon, { getExtMeta } from "@/ui/elements/FileIcon";
import TrashIcon from "@/ui/elements/TrashIcon";
import { formatDate, formatFileSize } from "@/utils/fileFormat";
import styles from "@/modules/datasets/memoryReader.module.css";
import type { MemoryDocuments } from "@/modules/datasets/useMemoryDocuments";
import { capRows, MAX_RENDERED_ROWS } from "@/modules/datasets/maxRenderedRows";
import ProcessingBadge from "../../partials/ProcessingBadge";

export interface FileRow {
  completed?: boolean;
  id: string;
  name: string;
  extension?: string;
  size?: number;
  createdAt?: string;
}

function getTypeName(name: string, ext?: string): string {
  const e = (ext || name.split(".").pop() || "").toLowerCase();
  const names: Record<string, string> = { pdf: "PDF", docx: "DOCX", doc: "DOC", md: "Markdown", txt: "Text", csv: "CSV", json: "JSON" };
  return names[e] || e.toUpperCase();
}

export default function FilesTable({
  files,
  memory,
  search,
  filtering = false,
  loadError,
  onDelete,
  onUploadClick,
  onRetry,
  deletingId,
}: {
  files: FileRow[];
  memory?: MemoryDocuments;
  search: string;
  filtering?: boolean;
  loadError: boolean;
  onDelete: (id: string) => void;
  onUploadClick: () => void;
  onRetry: () => void;
  deletingId?: string | null;
}): ReactElement {
  if (loadError && files.length === 0) {
    return (
      <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48 }}>
        <span style={{ fontSize: 15, color: "#F87171" }}>Couldn&rsquo;t load files</span>
        <span style={{ fontSize: 13, color: "rgba(237,236,234,0.35)", textAlign: "center", maxWidth: 300 }}>Something went wrong reaching the server. Your files are safe — try again.</span>
        <button onClick={onRetry} className="cursor-pointer hover:bg-white/10" style={{ background: "rgba(255,255,255,0.06)", color: "#EDECEA", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500 }}>Retry</button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48 }}>
        <span style={{ fontSize: 15, color: "rgba(237,236,234,0.35)" }}>{search || filtering ? "No files match your search or filters" : "No files yet"}</span>
        {!search && !filtering && <button onClick={onUploadClick} className="cursor-pointer hover:bg-[#5A0ED6]" style={{ background: "#6510F4", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500 }}>Upload files</button>}
      </div>
    );
  }

  // The paging hook owns the live cap; this protects independent consumers.
  const { visible, hidden } = capRows(files);

  return (
    <div style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "12px 20px" }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(237,236,234,0.55)" }}>Name</span>
        <span style={{ width: 85, fontSize: 12, color: "rgba(237,236,234,0.55)" }}>Processing</span>
        <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "rgba(237,236,234,0.55)", flexShrink: 0 }}>Type</span>
        <span style={{ width: 80, fontSize: 12, fontWeight: 700, color: "rgba(237,236,234,0.55)", flexShrink: 0 }}>Size</span>
        <span style={{ width: 170, fontSize: 12, fontWeight: 700, color: "rgba(237,236,234,0.55)", flexShrink: 0 }}>Added</span>
        <span style={{ width: 40, flexShrink: 0 }} />
      </div>
      {visible.map((file, i) => {
        const summary = memory?.summary(file);
        const isMemory = !!summary;
        const meta = isMemory
          ? { fill: "rgba(188,155,255,0.20)", stroke: "#BC9BFF", text: "#BC9BFF", label: "MEM" }
          : getExtMeta(file.name, file.extension);
        const typeName = getTypeName(file.name, file.extension);
        const displayName = isMemory
          ? summary?.title
          : decodeURIComponent(file.name);
        return (
          <div
            key={file.id}
            className="hover:bg-white/10"
            style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none", transition: "background 150ms" }}
          >
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <FileIcon fill={meta.fill} stroke={meta.stroke} text={meta.text} label={meta.label} />
              {summary ? <button className={styles.opener} onClick={() => memory?.open(file.id)} title={summary.snippet}><span className={styles.rowTitle}>{displayName}</span>{summary.snippet && summary.snippet !== displayName && <small className={styles.snippet}>{summary.snippet}</small>}</button> : <span style={{ fontSize: 13, fontWeight: 500, color: "#EDECEA" }}>{displayName}</span>}
            </div>
            <span style={{ width: 85, flexShrink: 0 }}><ProcessingBadge completed={file.completed} /></span>
            <span style={{ width: 100, fontSize: 13, color: "rgba(237,236,234,0.55)", flexShrink: 0 }}>{summary ? <><span className={styles.badge}>{summary.kind}</span><span className={styles.snippet}>{summary.agent}</span></> : typeName}</span>
            <span style={{ width: 80, fontSize: 13, color: "rgba(237,236,234,0.55)", flexShrink: 0 }}>{formatFileSize(file.size)}</span>
            <span style={{ width: 170, fontSize: 13, color: "rgba(237,236,234,0.35)", flexShrink: 0 }}>{formatDate(file.createdAt, true)}</span>
            <div style={{ width: 40, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
              <button
                onClick={() => onDelete(file.id)}
                disabled={deletingId === file.id}
                className="cursor-pointer hover:opacity-100 rounded p-1"
                style={{ background: "none", border: "none", opacity: deletingId === file.id ? 0.3 : 0.5, transition: "opacity 150ms", cursor: deletingId === file.id ? "default" : "pointer" }}
                onMouseEnter={(e) => { if (deletingId !== file.id) e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { if (deletingId !== file.id) e.currentTarget.style.opacity = "0.5"; }}
                title="Delete file"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
      {hidden > 0 && (
        <div style={{ padding: "12px 20px", fontSize: 12, color: "rgba(237,236,234,0.35)", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          Showing {MAX_RENDERED_ROWS.toLocaleString()} of {files.length.toLocaleString()} files
        </div>
      )}
    </div>
  );
}
