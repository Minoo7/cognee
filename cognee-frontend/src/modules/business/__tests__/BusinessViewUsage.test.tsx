import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { computeBrainState } from "../computeBrainState";
import { indexRecordedUsage } from "../recordedNodeUsage";
import BusinessView from "@/app/(app)/business/BusinessView";
import BusinessCanvas from "../canvas/BusinessCanvas";
import type { Spotlight } from "../canvas/businessDraw";
import type { useBusinessQaSurface } from "../useBusinessQaSurface";

const mockFull = computeBrainState([
  { id: "used", name: "Used", stage: "entity", belongs_to_set: ["a"] },
  { id: "hidden", name: "Hidden", stage: "entity", belongs_to_set: ["b"] },
  { id: "document", name: "Used document", stage: "document", belongs_to_set: ["a"] },
], [{ source: "used", target: "hidden", edge_class: "semantic" }]);
const mockLive = {
  events: [], usage: indexRecordedUsage([{ kind: "improve", node_ids: ["used"] }]),
  usageReady: true, live: true, latestSearchEvent: null, consumeLatestSearchEvent: jest.fn(), answeredIds: new Set(),
};
let mockSetSpotlight: Parameters<typeof useBusinessQaSurface>[5];
let mockCanvasProps: ComponentProps<typeof BusinessCanvas>;
jest.mock("../canvas/BusinessCanvas", () => ({ __esModule: true, default: (props: ComponentProps<typeof BusinessCanvas>) => { mockCanvasProps = props; return null; } }));
jest.mock("../useBusinessScene", () => ({ useBusinessScene: () => ({ brainState: mockFull, activeDatasetId: "one", layerData: {}, setActiveDatasetId: jest.fn(), contentError: null }) }));
jest.mock("../useBrains", () => ({ useBrains: () => ({ data: null }) }));
jest.mock("../useBusinessLiveUpdates", () => ({ useBusinessLiveUpdates: () => mockLive }));
jest.mock("../useBusinessQaSurface", () => ({ useBusinessQaSurface: (...args: Parameters<typeof useBusinessQaSurface>) => { mockSetSpotlight = args[5]; return {}; } }));
jest.mock("../useBusinessTour", () => ({ useBusinessTour: () => ({ isPlaying: false }) }));
jest.mock("../useBusinessAutoInsights", () => ({ useBusinessAutoInsights: () => {} }));
jest.mock("../useNarration", () => ({ useNarration: () => ({ display: { text: null }, narrate: jest.fn() }) }));
jest.mock("../panels/ScrollFadeContainer", () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => children }));
jest.mock("../panels/AnswerCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/SessionMemoryCard", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/BrainSwitcher", () => ({ __esModule: true, default: () => null }));
jest.mock("@mantine/notifications", () => ({ notifications: { show: jest.fn() } }));

beforeEach(() => {
  mockLive.events = [];
  mockLive.usage = indexRecordedUsage([{ kind: "improve", node_ids: ["used"] }]);
  mockLive.usageReady = true;
  mockLive.live = true;
});

const instance = { name: "fixture", instanceId: "fixture", fetch: jest.fn() };

test("All passes the original brain by identity, Used projects search and canvas, restoring All changes world identity", () => {
  render(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  expect(mockCanvasProps.brainState).toBe(mockFull);
  expect(mockCanvasProps.worldKey).toBe("one");
  fireEvent.click(screen.getByRole("button", { name: "Used in answers · 1" }));
  expect(mockCanvasProps.brainState?.entities.map((node) => node.id)).toEqual(["used"]);
  expect(mockCanvasProps.worldKey).toBe("one:used");
  expect(mockCanvasProps.onGrowth).toBeUndefined();
  expect(screen.getByRole("button", { name: "Used in answers · 1" })).toHaveAttribute("aria-pressed", "true");
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Hidden" } });
  expect(screen.queryByRole("button", { name: /^Hidden/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Used in answers · 1" }));
  expect(mockCanvasProps.brainState).toBe(mockFull);
  expect(mockCanvasProps.worldKey).toBe("one");
});

test("loading, empty and reconnecting usage messages leave the toggle clickable", () => {
  mockLive.usage = indexRecordedUsage([]);
  mockLive.usageReady = false;
  const { rerender } = render(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  const toggle = () => screen.getByRole("button", { name: /^Used in answers/ });
  expect(toggle()).toHaveTextContent("Used in answers · …");
  expect(screen.getByText("loading recorded usage…")).toBeInTheDocument();
  fireEvent.click(toggle());
  expect(screen.getByText("loading recorded usage…")).toBeInTheDocument();
  mockLive.usageReady = true;
  rerender(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  expect(screen.getByText("No recorded answer usage yet")).toBeInTheDocument();
  mockLive.live = false;
  rerender(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  expect(screen.getByText(/live feed reconnecting, usage may be incomplete/)).toBeInTheDocument();
  expect(screen.queryByText("No recorded answer usage yet")).toBeNull();
  expect(toggle()).toHaveTextContent("Used in answers · …");
  fireEvent.click(toggle());
  expect(toggle()).toHaveAttribute("aria-pressed", "false");
  expect(mockCanvasProps.brainState).toBe(mockFull);
});


test("an answer spotlight containing document IDs survives event updates and clears on scope changes", () => {
  const { rerender } = render(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^Used in answers/ }));
  const answer: Spotlight = { startedAt: Date.now(), source: "answer", ids: new Set(["used", "document"]), until: Date.now() + 9000 };
  act(() => mockSetSpotlight(answer));
  expect(mockCanvasProps.spotlight).toBe(answer);
  mockLive.usage = indexRecordedUsage([{ kind: "search", node_ids: ["used", "document"] }]);
  rerender(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  expect(mockCanvasProps.spotlight).toBe(answer);
  fireEvent.click(screen.getByRole("button", { name: /^Used in answers/ }));
  expect(mockCanvasProps.spotlight).toBeNull();
});


test("the usage count includes independently used records", () => {
  mockLive.usage = indexRecordedUsage([{ kind: "search", node_ids: ["document"] }]);
  render(<MantineProvider forceColorScheme="dark"><BusinessView cogniInstance={instance} /></MantineProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Used in answers · 1" }));
  expect(mockCanvasProps.brainState?.entities).toHaveLength(0);
  expect(mockCanvasProps.brainState?.plumbingNodes.map((node) => node.id)).toEqual(["document"]);
  expect(screen.queryByText("No recorded answer usage yet")).toBeNull();
});
