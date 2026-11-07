import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Nodes } from "mdast";

export type CompatibilityReason = "entity" | "html" | "media" | "footnote" | "spoiler" | "link" | "classification";
export type MarkdownDecision = { kind: "empty" } | { kind: "enriched" } | { kind: "compatible"; reasons: CompatibilityReason[] };

export function isSafeMarkdownLink(url: string): boolean {
  if (!url || /[\u0000-\u0020\u007f-\u009f\\]/.test(url)) return false;
  if (url.startsWith("#")) return true;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "mailto:" ? parsed.pathname.length > 0 : Boolean(parsed.hostname);
  } catch { return false; }
}

function sourceMayRequestMedia(text: string) {
  return /<\s*\/?\s*(?:img|video|audio|source|iframe|object|embed|picture)\b/i.test(text) || /!\[/.test(text);
}

export function decideMarkdown(text: string): MarkdownDecision {
  if (!text.trim()) return { kind: "empty" };
  const reasons = new Set<CompatibilityReason>();
  if (sourceMayRequestMedia(text)) reasons.add("media");
  if (/&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/.test(text)) reasons.add("entity");
  try {
    const tree = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
    const visit = (node: Nodes): void => {
      if (node.type === "footnoteDefinition" || node.type === "footnoteReference") reasons.add("footnote");
      if (node.type === "html") reasons.add("html");
      if (node.type === "image" || node.type === "imageReference") reasons.add("media");
      if ((node.type === "link" || node.type === "definition") && !isSafeMarkdownLink(node.url)) reasons.add("link");
      if (node.type === "text" && node.value.includes("||")) reasons.add("spoiler");
      if ("children" in node) node.children.forEach(visit);
    };
    visit(tree);
  } catch { reasons.add("classification"); }
  return reasons.size ? { kind: "compatible", reasons: [...reasons] } : { kind: "enriched" };
}
