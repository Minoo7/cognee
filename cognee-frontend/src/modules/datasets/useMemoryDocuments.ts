"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { CogneeInstance } from "../instances/types";
import { classifyMemory, isBinaryMemoryRow, type MemoryRow } from "./memoryDocument";
import { parseIndexedPassages, type IndexedPassage } from "./memorySearch";

export const MEMORY_REQUEST_TIMEOUT_MS = 30_000;
export type BodyState = { kind: "loading" } | { kind: "ready"; text: string } | { kind: "error"; reason: string };
type IndexedState = { kind: "idle" } | { kind: "loading"; query: string } | { kind: "ready"; query: string; passages: IndexedPassage[] } | { kind: "error"; query: string; reason: string };

function boundedRead<T>(controller: AbortController, read: () => Promise<T>): Promise<T> {
  let cleanup = () => {};
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Request cancelled"));
    const timer = setTimeout(() => { reject(new Error("Request timed out. Retry to load again.")); controller.abort(); }, MEMORY_REQUEST_TIMEOUT_MS);
    controller.signal.addEventListener("abort", abort, { once: true });
    cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", abort); };
    if (controller.signal.aborted) { cleanup(); abort(); return; }
    read().then(resolve, reject);
  }).finally(() => cleanup());
}

export default function useMemoryDocuments<T extends MemoryRow>(instance: CogneeInstance | null, dataset: string | null, rows: T[], revision = 0, total?: number | null) {
  const [, redraw] = useReducer(n => n + 1, 0);
  const scope = useMemo(() => {
    const scope = { revision, cache: new Map<string, BodyState>(), controllers: new Map<string, AbortController>(), queue: new Set<string>(), active: 0, live: true,
      previewIds: new Set<string>(), selectedId: null as string | null, stopped: false, indexed: { kind: "idle" } as IndexedState, searchController: null as AbortController | null, externalIds: new Set<string>(), binaryIds: new Set<string>() };
    function cancel(id: string) {
      const controller = scope.controllers.get(id);
      scope.controllers.delete(id);
      scope.queue.delete(id);
      scope.cache.delete(id);
      controller?.abort();
    }
    function pump() {
      if (!scope.live || !instance || !dataset) return;
      let started = false;
      while (scope.active < 4 && scope.queue.size) {
        const id = scope.queue.values().next().value;
        if (!id) break;
        scope.queue.delete(id);
        const controller = new AbortController();
        scope.controllers.set(id, controller);
        scope.cache.set(id, { kind: "loading" });
        scope.active++; started = true;
        boundedRead(controller, async () => {
          const res = await instance.fetch(`/v1/datasets/${encodeURIComponent(dataset)}/data/${encodeURIComponent(id)}/raw`, { signal: controller.signal });
          if (!res.ok) throw new Error("Body unavailable");
          const mime = res.headers?.get("Content-Type")?.split(";")[0].trim().toLowerCase();
          if (scope.externalIds.has(id) && mime && !mime.startsWith("text/") && mime !== "application/json") { await res.body?.cancel(); throw new Error("This source is not a text document. Open the original file in Cognee instead."); }
          return res.text();
        }).then(text => { if (scope.live && scope.controllers.get(id) === controller) scope.cache.set(id, { kind: "ready", text }); })
          .catch(error => { if (scope.live && scope.controllers.get(id) === controller) scope.cache.set(id, { kind: "error", reason: error instanceof Error ? error.message : "Body unavailable" }); })
          .finally(() => {
            scope.active--;
            if (scope.controllers.get(id) === controller) scope.controllers.delete(id);
            if (scope.live) { pump(); redraw(); }
          });
      }
      if (started) redraw();
    }
    function request(id: string, retry = false, prioritize = false) {
      if (scope.binaryIds.has(id)) return;
      if (retry) cancel(id);
      if (!scope.cache.has(id)) {
        if (prioritize) scope.queue = new Set([id, ...scope.queue]);
        else scope.queue.add(id);
      }
      pump();
    }
    function stop() {
      scope.stopped = true;
      for (const id of new Set([...scope.queue, ...scope.controllers.keys()])) if (id !== scope.selectedId) cancel(id);
      redraw();
    }
    function searchIndexed(query: string) {
      if (!instance || !dataset || !query.trim()) return;
      scope.searchController?.abort();
      const controller = new AbortController(); scope.searchController = controller;
      scope.indexed = { kind: "loading", query }; redraw();
      boundedRead(controller, async () => {
        const res = await instance.fetch("/v1/search", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ search_type: "CHUNKS_LEXICAL", query, dataset_ids: [dataset], top_k: 15 }) });
        if (!res.ok) throw new Error("Indexed search unavailable");
        return parseIndexedPassages(await res.json());
      }).then(passages => { if (scope.live && scope.searchController === controller) scope.indexed = { kind: "ready", query, passages }; })
        .catch(error => { if (scope.live && scope.searchController === controller) scope.indexed = { kind: "error", query, reason: error instanceof Error ? error.message : "Indexed search unavailable" }; })
        .finally(() => { if (scope.live) redraw(); });
    }
    return Object.assign(scope, { request, cancel, stop, searchIndexed });
  }, [instance, dataset, revision]);
  const [previewWindow, setPreviewWindow] = useState({ scope, size: 50 });
  const [selection, setSelection] = useState<{ scope: typeof scope; row: MemoryRow; external: boolean; trigger: HTMLElement | null } | null>(null);
  const [agent, setAgent] = useState("All");
  const [type, setType] = useState("All");
  const [query, setQuery] = useState({ instance, dataset, value: "" });
  const search = query.instance === instance && query.dataset === dataset ? query.value : "";
  const size = previewWindow.scope === scope ? previewWindow.size : 50;
  const eligible = rows.filter(row => classifyMemory(row) !== null);
  useEffect(() => {
    scope.live = true;
    return () => {
      scope.live = false; scope.queue.clear(); scope.controllers.forEach(c => c.abort()); scope.controllers.clear(); scope.cache.clear(); scope.searchController?.abort();
    };
  }, [scope]);
  useEffect(() => {
    const ids = new Set(rows.map(row => row.id));
    if (selection?.scope === scope && !selection.external && !ids.has(selection.row.id)) { scope.selectedId = null; setSelection(null); }
    for (const id of new Set([...scope.queue, ...scope.cache.keys()])) if (!ids.has(id) && id !== scope.selectedId) scope.cancel(id);
    scope.previewIds = new Set(rows.filter(row => classifyMemory(row) !== null).slice(0, size).map(row => row.id));
    if (!scope.stopped) for (const id of scope.previewIds) scope.request(id);
  }, [scope, rows, size, selection]);
  const summary = (row: MemoryRow) => {
    const body = scope.cache.get(row.id);
    const memory = classifyMemory(row, body?.kind === "ready" ? body.text : undefined);
    return memory && body?.kind === "error" ? { ...memory, title: !row.label && !memory.sessionId && memory.kind !== "Report" ? "Unreadable memory" : memory.title, kind: "Unreadable" as const, agent: memory.agent === "Pending" ? "Unreadable" as const : memory.agent } : memory;
  };
  const filtered = rows.filter(row => {
    const memory = summary(row); const body = scope.cache.get(row.id);
    return (agent === "All" || memory?.agent === agent) && (type === "All" || memory?.kind === type) && (!search || `${row.name} ${memory?.title ?? ""} ${body?.kind === "ready" ? body.text : ""}`.toLowerCase().includes(search.toLowerCase()));
  });
  const selected = selection?.scope === scope ? selection.external ? selection.row : rows.some(row => row.id === selection.row.id) ? selection.row : undefined : undefined;
  function select(row: MemoryRow, external: boolean) {
    if (scope.selectedId && scope.selectedId !== row.id && (!scope.previewIds.has(scope.selectedId) || scope.stopped)) scope.cancel(scope.selectedId);
    scope.selectedId = row.id;
    setSelection({ scope, row, external, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null }); if (isBinaryMemoryRow(row)) { scope.binaryIds.add(row.id); scope.cache.set(row.id, {kind:"error",reason:"This source is not a text document. Open the original file in Cognee instead."}); } else { if (external) scope.externalIds.add(row.id); scope.request(row.id, false, true); } redraw();
  }
  return { filtered, summary, agent, setAgent, type, setType, search,
    setSearch: (value: string) => { scope.searchController?.abort(); scope.searchController = null; scope.indexed = { kind: "idle" }; setQuery({ instance, dataset, value }); },
    isAll: agent === "All" && type === "All" && !search, total,
    loaded: rows.length, previewed: eligible.filter(row => scope.cache.get(row.id)?.kind === "ready").length,
    pending: scope.queue.size + scope.controllers.size,
    notRead: eligible.filter(row => !scope.cache.has(row.id) && !scope.queue.has(row.id)).length,
    failed: eligible.filter(row => scope.cache.get(row.id)?.kind === "error").length,
    canPreview: eligible.length > size || scope.stopped,
    previewNext: () => { scope.stopped = false; setPreviewWindow({ scope, size: size + 50 }); },
    previewing: scope.queue.size > 0 || scope.controllers.size > 0, stopPreviews: scope.stop,
    open: (id: string) => { const row = eligible.find(row => row.id === id); if (row) select(row, false); },
    openSource: (id: string) => { const row = rows.find(row => row.id === id); select(row ? { ...row, sourceRequested: true } : { id, name: "Metadata unavailable", metadataUnavailable: true }, !row); },
    close: () => { const trigger = selection?.trigger; if (scope.selectedId && scope.cache.get(scope.selectedId)?.kind !== "ready" && (!scope.previewIds.has(scope.selectedId) || scope.stopped)) scope.cancel(scope.selectedId); scope.selectedId = null; setSelection(null); requestAnimationFrame(() => trigger?.focus()); },
    selected, body: selected ? scope.cache.get(selected.id) : undefined,
    retry: () => { if (selected) { scope.request(selected.id, true, true); redraw(); } },
    indexed: scope.indexed, searchIndexed: () => scope.searchIndexed(search),
  };
}
export type MemoryDocuments = ReturnType<typeof useMemoryDocuments>;
