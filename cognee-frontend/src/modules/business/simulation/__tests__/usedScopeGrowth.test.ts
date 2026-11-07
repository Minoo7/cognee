import { renderHook } from "@testing-library/react";
import { computeBrainState } from "../../computeBrainState";
import { projectUsedBrain, indexRecordedUsage, type UsageScope } from "../../recordedNodeUsage";
import type { BrainState } from "../../sceneTypes";
import { useBusinessSimulation } from "../useBusinessSimulation";

const tick = () => {};

test("scope transitions and new usage never announce ingestion, while real graph growth still does", () => {
  const full = computeBrainState([{ id: "a", stage: "entity" }, { id: "b", stage: "entity" }], []);
  const onGrowth = jest.fn();
  const { rerender } = renderHook(({ scope, brain }: { scope: UsageScope; brain: BrainState }) => {
    useBusinessSimulation(brain.entities, brain.semanticLinks, brain.anchors, brain.importanceMax,
      tick, scope === "all" ? onGrowth : undefined, null, scope === "used" ? "one:used" : "one");
  }, { initialProps: { scope: "all" satisfies UsageScope, brain: full } });
  rerender({ scope: "used", brain: projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["a"] }])) });
  rerender({ scope: "used", brain: projectUsedBrain(full, indexRecordedUsage([{ node_ids: ["a", "b"] }])) });
  rerender({ scope: "all", brain: full });
  expect(onGrowth).not.toHaveBeenCalled();
  const grown = computeBrainState([...full.entities, { id: "c", stage: "entity" }], []);
  rerender({ scope: "all", brain: grown });
  expect(onGrowth).toHaveBeenCalledTimes(1);
  expect(onGrowth.mock.calls[0][0].map((n: { id: string }) => n.id)).toEqual(["c"]);
});
