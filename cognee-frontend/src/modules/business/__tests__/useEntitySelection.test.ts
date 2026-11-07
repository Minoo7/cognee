import { act, renderHook } from "@testing-library/react";
import { computeBrainState } from "../computeBrainState";
import { projectUsedBrain, indexRecordedUsage } from "../recordedNodeUsage";
import { useEntitySelection } from "../useEntitySelection";

const full = computeBrainState([{ id: "a", stage: "entity" }, { id: "b", stage: "entity", name: "B" }], [
  { source: "a", target: "b", edge_class: "semantic" },
]);

test("event eviction clears selection and path permanently, including when All is restored", () => {
  const { result, rerender } = renderHook(({ brain }) => useEntitySelection(brain.semanticLinks, brain.entityById), { initialProps: { brain: full } });
  act(() => result.current.selectEntity(full.entityById.a));
  act(() => result.current.handleCanvasSelect(full.entityById.b, true));
  expect(result.current.pathHops).toBe(1);
  rerender({ brain: projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["b"] }])) });
  expect(result.current.selectedEntity).toBeNull();
  expect(result.current.pathTargetName).toBeNull();
  expect(result.current.pathIds.size).toBe(0);
  rerender({ brain: full });
  expect(result.current.selectedEntity).toBeNull();
});

test("evicting only the path target clears the path while retaining a visible selection", () => {
  const { result, rerender } = renderHook(({ brain }) => useEntitySelection(brain.semanticLinks, brain.entityById), { initialProps: { brain: full } });
  act(() => result.current.selectEntity(full.entityById.a));
  act(() => result.current.handleCanvasSelect(full.entityById.b, true));
  rerender({ brain: projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["a"] }])) });
  expect(result.current.selectedEntity).toBe(full.entityById.a);
  expect(result.current.pathTargetName).toBeNull();
  expect(result.current.pathEdgeKeys.size).toBe(0);
});
