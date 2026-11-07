import { computeHubInsight, countBySet, setsOf } from "./computeBrainState";
import { topImportanceCut } from "./canvas/businessEntityLayer";
import type { BrainState, TypeLink } from "./sceneTypes";
import type { SessionEvent } from "./types";

export type UsageScope = "all" | "used";
export type RecordedNodeUsage = ReadonlyMap<string, readonly SessionEvent[]>;

export function indexRecordedUsage(events: readonly SessionEvent[]): RecordedNodeUsage {
  const usage = new Map<string, SessionEvent[]>();
  for (const event of events) {
    for (const id of new Set(event.node_ids)) {
      const bucket = usage.get(id);
      if (bucket) bucket.push(event);
      else usage.set(id, [event]);
    }
  }
  return usage;
}

export function projectUsedBrain(full: BrainState, usage: RecordedNodeUsage): BrainState {
  const entities = full.entities.filter((node) => usage.has(node.id));
  const entityById = Object.fromEntries(entities.map((node) => [node.id, node]));
  const plumbingNodes = full.plumbingNodes.filter((node) => usage.has(node.id));
  const keptIds = new Set([...entities, ...plumbingNodes].map((node) => node.id));
  const semanticLinks = full.semanticLinks.filter((link) => keptIds.has(link._sid) && keptIds.has(link._tid));
  const docLinks = full.docLinks.filter((link) => keptIds.has(link._sid) && keptIds.has(link._tid));
  const typeByMember = new Map<string, string>();
  const typeNodes = full.typeNodes.flatMap((type) => {
    type.members.forEach((node) => typeByMember.set(node.id, type.name));
    const members = type.members.filter((node) => usage.has(node.id));
    return members.length ? [{ ...type, members, sets: countBySet(members), _visible: undefined }] : [];
  });
  const typeLinksByKey = new Map<string, TypeLink>();
  for (const link of semanticLinks) {
    const a = typeByMember.get(link._sid) ?? "other";
    const b = typeByMember.get(link._tid) ?? "other";
    if (a === b) continue;
    const relation = link.relation || "related";
    const key = JSON.stringify([a, b, relation]);
    const bucket = typeLinksByKey.get(key);
    if (bucket) bucket.count += 1;
    else typeLinksByKey.set(key, { a, b, relation, count: 1 });
  }
  const keptNodes = [...entities, ...plumbingNodes];
  const setMemberCount = countBySet(keptNodes);
  const sourceNames = [...new Set(keptNodes.flatMap(setsOf))].filter((name) => !full.isSessionSet(name));
  return {
    ...full,
    entities,
    entityById,
    plumbingNodes,
    semanticLinks,
    docLinks,
    typeNodes,
    typeLinks: [...typeLinksByKey.values()],
    sourceNames,
    setEntityCount: countBySet(entities),
    setDocCount: countBySet(plumbingNodes.filter((node) => node.stage === "document")),
    setMemberCount,
    importanceCut: topImportanceCut(entities),
    hub: computeHubInsight(semanticLinks, full.byId),
  };
}
