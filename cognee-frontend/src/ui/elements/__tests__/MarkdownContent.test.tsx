import { act, render, screen, cleanup } from "@testing-library/react";
import MarkdownContent from "../MarkdownContent";

let output = "semantic";
jest.mock("next/dynamic", () => ({ __esModule: true, default: () => function Renderer({ text }: { text: string }) {
  if (output === "pending") return null;
  return <div className="enrm-text">{output === "raw" ? <pre>{text}</pre> : text === "---" ? <hr /> : text.startsWith("```") ? <pre><code>{text}</code></pre> : text.startsWith("|") ? <table><tbody><tr><td>cell</td></tr></tbody></table> : <h1>{text}</h1>}</div>;
} }));

const mutations = () => act(async () => { await Promise.resolve(); });
afterEach(() => { cleanup(); jest.useRealTimers(); output = "semantic"; });

test.each(["", "  \n\t"])("empty %j does not wait", text => {
 const { container } = render(<MarkdownContent text={text} />);
 expect(container).toBeEmptyDOMElement();
});
test.each(["# heading", "```\ncode\n```", "|table|", "---"])("semantic readiness %j", async text => {
 const { container } = render(<MarkdownContent text={text} />); await mutations();
 expect(container.querySelector('[data-markdown-state="ready"]')).not.toBeNull();
 expect(screen.queryByText(/Compatibility view/)).toBeNull();
});
test("four simultaneous readers complete independently", async () => {
 const { container } = render(<>{[1,2,3,4].map(i => <MarkdownContent key={i} text={`# document ${i}`} />)}</>); await mutations();
 expect(container.querySelectorAll('[data-markdown-state="ready"]')).toHaveLength(4);
});
test("unloaded renderer has a bounded labelled fallback", async () => {
 jest.useFakeTimers(); output = "pending"; render(<MarkdownContent text="# kept" />);
 await act(async () => { jest.advanceTimersByTime(8000); });
 expect(screen.getByText(/Compatibility view · Enriched timed out/)).toBeVisible(); expect(screen.getByRole("heading")).toHaveTextContent("kept");
});
test("silent parser fallback is labelled compatibility", async () => {
 output = "raw"; render(<MarkdownContent text="# preserved" />); await mutations();
 expect(screen.getByText(/Compatibility view · Enriched could not parse/)).toBeVisible();
});
test("source changes discard old timer and readiness", async () => {
 jest.useFakeTimers(); output="pending"; const {rerender,container}=render(<MarkdownContent text="# old" />);
 await act(async () => { jest.advanceTimersByTime(7000); });
 output="semantic"; rerender(<MarkdownContent text="# new" />); await mutations();
 await act(async () => { jest.advanceTimersByTime(9000); });
 expect(container.querySelector('[data-markdown-state="ready"]')).not.toBeNull(); expect(screen.getByRole("heading")).toHaveTextContent("new"); expect(screen.queryByText(/Compatibility view/)).toBeNull();
});
test("compatibility retains unsupported text and disables media and links", () => {
 const {container}=render(<MarkdownContent text={'# Keep\n\n||KEEP_SPOILER||\n\n<div>KEEP_HTML</div>\n\n![KEEP_ALT](https://evil.invalid/a) [KEEP_LINK](javascript:alert)'} />);
 expect(screen.getByText(/Compatibility view/)).toBeVisible(); expect(container.textContent).toContain('KEEP_SPOILER'); expect(container.textContent).toContain('<div>KEEP_HTML</div>'); expect(container.textContent).toContain('KEEP_ALT'); expect(container.querySelector('img,video,iframe,a[href]')).toBeNull();
});
test("footnote compatibility preserves the entire definition", () => {
 const text='Body[^1]\n\n[^1]: FOOTNOTE_SENTINEL';
 const {container}=render(<MarkdownContent text={text} />);
 expect(screen.getByText(/Compatibility view/)).toBeVisible();
 expect(container.textContent).toContain('FOOTNOTE_SENTINEL');
 expect(container.querySelector('pre')?.textContent).toBe(text);
});
