"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { CogneeInstance } from "../instances/types";
import { classifyMemory, type MemoryRow } from "./memoryDocument";

export type BodyState = { kind: "loading" } | { kind: "ready"; text: string } | { kind: "error" };
export default function useMemoryDocuments<T extends MemoryRow>(instance: CogneeInstance | null, dataset: string | null, rows: T[], revision = 0) {
  const [, redraw] = useReducer(n => n + 1, 0);
  const scope = useMemo(() => {
    const scope = { instance, dataset, revision, cache: new Map<string, BodyState>(), controllers: new Map<string, AbortController>(), queue: new Set<string>(), active: 0, live: true };
    function pump() {
      if (!scope.live || !instance || !dataset) return;
      while (scope.active < 4 && scope.queue.size) {
        const id = scope.queue.values().next().value;
        if (!id) break;
        scope.queue.delete(id);
        const controller = new AbortController();
        scope.controllers.set(id, controller);
        scope.cache.set(id, { kind: "loading" });
        scope.active++;
        instance.fetch(`/v1/datasets/${encodeURIComponent(dataset)}/data/${encodeURIComponent(id)}/raw`, { signal: controller.signal })
          .then(async res => { if (!res.ok) throw new Error("Body unavailable"); return res.text(); })
          .then(text => { if (scope.live && !controller.signal.aborted) scope.cache.set(id, { kind: "ready", text }); })
          .catch(() => { if (scope.live && !controller.signal.aborted) scope.cache.set(id, { kind: "error" }); })
          .finally(() => { scope.active--; if (scope.controllers.get(id) === controller) scope.controllers.delete(id); if (scope.live) { pump(); redraw(); } });
      }
    }
    function request(id: string, retry = false, prioritize = false) {
      if (retry) scope.cache.delete(id);
      if (!scope.cache.has(id)) {
        if (prioritize) scope.queue = new Set([id, ...scope.queue]);
        else scope.queue.add(id);
      }
      pump();
    }
    return Object.assign(scope, { request });
  }, [instance, dataset, revision]);
  const [previewWindow, setPreviewWindow] = useState({ scope, size: 50 });
  const [selection, setSelection] = useState<{ scope: typeof scope; id: string; trigger: HTMLElement | null } | null>(null);
  const [agent, setAgent] = useState("All");
  const [type, setType] = useState("All");
  const [search, setSearch] = useState("");
  const size = previewWindow.scope === scope ? previewWindow.size : 50;
  const eligible = rows.filter(row => classifyMemory(row) !== null);
  const previewable = eligible.filter(row => classifyMemory(row)?.kind !== "Report");
  useEffect(() => {
    scope.live = true;
    return () => { scope.live = false; scope.queue.clear(); scope.controllers.forEach(c => c.abort()); scope.cache.clear(); };
  }, [scope]);
  useEffect(() => {
    const ids = new Set(rows.map(row => row.id));
    setSelection(previous => previous?.scope === scope && !ids.has(previous.id) ? null : previous);
    for (const id of scope.queue) if (!ids.has(id)) scope.queue.delete(id);
    for (const id of scope.cache.keys()) if (!ids.has(id)) { scope.controllers.get(id)?.abort(); scope.queue.delete(id); scope.cache.delete(id); }
    for (const row of rows.filter(row => { const memory = classifyMemory(row); return memory !== null && memory.kind !== "Report"; }).slice(0, size)) scope.request(row.id);
  }, [scope, rows, size]);
  const summary = (row: MemoryRow) => { const body = scope.cache.get(row.id); return classifyMemory(row, body?.kind === "ready" ? body.text : undefined); };
  const filtered = rows.filter(row => {
    const memory = summary(row);
    return (agent === "All" || memory?.agent === agent) && (type === "All" || memory?.kind === type) && (!search || `${row.name} ${memory?.title ?? ""} ${memory?.snippet ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  });
  const selected = selection?.scope === scope ? rows.find(row => row.id === selection.id) : undefined;
  return { filtered, summary, agent, setAgent, type, setType, search, setSearch, isAll: agent === "All" && type === "All" && !search,
    loaded: rows.length, previewed: previewable.filter(row => scope.cache.get(row.id)?.kind === "ready").length, pending: previewable.filter(row => !scope.cache.has(row.id) || scope.cache.get(row.id)?.kind === "loading").length,
    failed: previewable.filter(row => scope.cache.get(row.id)?.kind === "error").length,
    canPreview: previewable.length > size, previewNext: () => setPreviewWindow({ scope, size: size + 50 }),
    open: (id: string) => { if (eligible.some(row => row.id === id)) { setSelection({ scope, id, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null }); scope.request(id, false, true); redraw(); } },
    close: () => { const trigger = selection?.trigger; setSelection(null); requestAnimationFrame(() => trigger?.focus()); }, selected, body: selected ? scope.cache.get(selected.id) : undefined,
    retry: () => { if (selected) { scope.request(selected.id, true); redraw(); } },
  };
}
export type MemoryDocuments = ReturnType<typeof useMemoryDocuments>;
