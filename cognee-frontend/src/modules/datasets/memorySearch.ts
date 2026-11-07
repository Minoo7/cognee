export interface IndexedPassage { text: string; documentId: string | null; name?: string }
export function parseIndexedPassages(wire: unknown): IndexedPassage[] {
  const passages: IndexedPassage[] = [];
  function read(value: unknown, depth: number) {
    if (depth > 4) throw new Error("Unexpected indexed search nesting");
    if (Array.isArray(value)) { value.forEach(item => read(item, depth + 1)); return; }
    if (!value || typeof value !== "object") throw new Error("Unexpected indexed search response");
    if ("error" in value && value.error) throw new Error("Indexed search could not read this dataset");
    if ("search_result" in value) { read(value.search_result, depth + 1); return; }
    if (!("text" in value) || typeof value.text !== "string") throw new Error("Indexed passage text unavailable");
    const id = "document_id" in value && typeof value.document_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.document_id) ? value.document_id : null;
    passages.push({ text: value.text, documentId: id, name: "document_name" in value && typeof value.document_name === "string" ? value.document_name : undefined });
  }
  read(wire, 0);
  return passages;
}
