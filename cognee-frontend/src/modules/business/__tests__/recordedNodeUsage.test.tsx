import { render, screen } from "@testing-library/react";
import { computeBrainState } from "../computeBrainState";
import { indexRecordedUsage, projectUsedBrain } from "../recordedNodeUsage";
import NodePanel from "../panels/NodePanel";
import { hitTestEntity, hitTestTypeNode } from "../canvas/businessHitTest";
import { inLens } from "../canvas/businessEntityLayer";
import type { BusinessGraphNode } from "../types";

const node = (id: string, stage: string, source: string): BusinessGraphNode => ({ id, name: id, stage, belongs_to_set: [source] });
const edge = (source: string, target: string, relation = "related") => ({ source, target, relation, edge_class: "semantic" });

function fixture() {
  return computeBrainState([
    node("used", "entity", "a"), node("zero", "entity", "hidden-source"),
    node("other", "entity", "b"), node("third", "entity", "a"),
    node("zero-record", "document", "hidden-source"), node("used-record", "document", "b"),
    node("kind-a", "type", "a"), node("kind-b", "type", "b"), node("kind-zero", "type", "hidden-source"),
  ], [
    edge("used", "zero"), edge("used", "other"), edge("used", "third"),
    edge("zero-record", "used"), edge("used-record", "zero"),
    edge("used", "kind-a", "is_a"), edge("other", "kind-b", "is_a"),
    edge("third", "kind-b", "is_a"), edge("zero", "kind-zero", "is_a"),
  ]);
}

test("buckets every event kind once per node, matching the panel count and list", () => {
  const event = { kind: "improve", node_ids: ["used", "used"], question: "improved answer" };
  const usage = indexRecordedUsage([event, { kind: "search" }, { node_ids: [] }]);
  expect(usage.get("used")).toEqual([event]);
  render(<NodePanel entity={{ id: "used" }} usage={usage} docCount={0} connectionCount={0}
    onClose={jest.fn()} pathTargetName={null} pathHops={null} onClearPath={jest.fn()} onSimulateRemoval={jest.fn()} />);
  expect(screen.getByText("Used in 1 answer")).toBeInTheDocument();
  expect(screen.getByText(/improved answer/)).toBeInTheDocument();
});

test("keeps a positive isolated node and record with a hidden anchor, without dangling links or zero records", () => {
  const full = fixture();
  const used = projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["used", "used-record"] }]));
  expect(used.entities.map((n) => n.id)).toEqual(["used"]);
  expect(used.entities[0]).toBe(full.entities[0]);
  expect(used.semanticLinks).toEqual([]);
  expect(used.docLinks).toEqual([]);
  expect(used.plumbingNodes.map((n) => n.id)).toEqual(["used-record"]);
  expect(used.plumbingEntityId).toBe(full.plumbingEntityId);
  expect(used.entityById[used.plumbingEntityId["used-record"]]).toBeUndefined();
  expect(used.entityById.zero).toBeUndefined();
  expect(used.connectedIds).toBe(full.connectedIds);
  expect(used.hub).toBeNull();
  full.entityById.zero.x = 900; full.entityById.zero.y = 900;
  expect(hitTestEntity(used.entities, 900, 900, 2)).toBeNull();
  expect(hitTestTypeNode(used.typeNodes, 900, 900)).toBeNull();
});

test("recomputes types, links, sources, counts and hub while preserving world objects", () => {
  const full = fixture();
  const used = projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["used", "other", "third", "used-record"] }]));
  expect(used.typeNodes.map((n) => [n.name, n.members.map((m) => m.id), n.sets])).toEqual([
    ["kind-a", ["used"], { a: 1 }], ["kind-b", ["other", "third"], { a: 1, b: 1 }],
  ]);
  expect(used.typeLinks).toEqual([{ a: "kind-a", b: "kind-b", relation: "related", count: 2 }]);
  expect(used.sourceNames).toEqual(["a", "b"]);
  expect(used.setEntityCount).toEqual({ a: 2, b: 1 });
  expect(used.setDocCount).toEqual({ b: 1 });
  expect(used.setMemberCount).toEqual({ a: 2, b: 2 });
  expect(used.hub).toMatchObject({ entityId: "used", degree: 2, sourceCount: 2 });
  expect(used.anchors).toBe(full.anchors);
  expect(used.setColor).toBe(full.setColor);
  expect(used.byId).toBe(full.byId);
  expect(used.importanceMax).toBe(full.importanceMax);
  expect(inLens(used.entityById.used, new Set(["a"]))).toBe(true);
  expect(inLens(used.entityById.other, new Set(["a"]))).toBe(false);
  expect(used.entities).toHaveLength(3);
});

test("no recorded usage produces a genuinely empty projected graph", () => {
  const used = projectUsedBrain(fixture(), indexRecordedUsage([]));
  expect(used.entities).toEqual([]);
  expect(used.plumbingNodes).toEqual([]);
  expect(used.typeNodes).toEqual([]);
  expect(used.sourceNames).toEqual([]);
});
