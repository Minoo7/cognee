"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { decideMarkdown, isSafeMarkdownLink } from "./markdown/decision";
import LegacyMarkdown from "./markdown/LegacyMarkdown";
import styles from "./markdown/markdown.module.css";

const EnrichedView = dynamic(() => import("./markdown/EnrichedView"), { ssr: false });
type RenderState = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; reason: string };

function Compatible({ text, reason, literal = false }: { text: string; reason: string; literal?: boolean }) {
  return <div data-markdown-renderer="compatible"><p className={styles.notice}>Compatibility view · {reason}</p><LegacyMarkdown text={text} literal={literal} /></div>;
}

export default function MarkdownContent({ text }: { text: string }) {
  const decision = useMemo(() => decideMarkdown(text), [text]);
  if (decision.kind === "empty") return null;
  if (decision.kind === "compatible") return <Compatible text={text} reason={`preserving unsupported content (${decision.reasons.join(", ")})`} literal={decision.reasons.includes("footnote")} />;
  return <ErrorBoundary key={text} fallback={<Compatible text={text} reason="Enriched could not load" />}><RenderSession key={text} text={text} /></ErrorBoundary>;
}

function RenderSession({ text }: { text: string }) {
  const [state, setState] = useState<RenderState>({ kind: "loading" });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let active = true;
    const timer = window.setTimeout(() => { if (active) setState({ kind: "failed", reason: "Enriched timed out" }); }, 8000);
    const inspect = () => {
      if (!active) return;
      const rendered = element.querySelector(".enrm-text");
      if (!rendered) return;
      for (const link of rendered.querySelectorAll("a[href]")) {
        if (!isSafeMarkdownLink(link.getAttribute("href") || "")) link.removeAttribute("href");
      }
      const rawFallback = rendered.querySelector(":scope > pre:not(:has(code))");
      if (rawFallback || rendered.querySelector("img,video,audio,source,iframe,object,embed,picture")) {
        window.clearTimeout(timer);
        setState({ kind: "failed", reason: "Enriched could not parse this document" });
      } else if (rendered.children.length === 0 || rendered.querySelector("p,h1,h2,h3,h4,h5,h6,ul,ol,table,pre > code,hr,blockquote")) {
        window.clearTimeout(timer);
        setState({ kind: "ready" });
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(element, { childList: true, subtree: true });
    inspect();
    return () => { active = false; observer.disconnect(); window.clearTimeout(timer); };
  }, []);
  if (state.kind === "failed") return <Compatible text={text} reason={state.reason} />;
  return <div className={styles.content} data-markdown-renderer="enriched" data-markdown-state={state.kind}>
    {state.kind === "loading" && <p role="status" className={styles.notice}>Formatting Markdown…</p>}
    <div ref={root} onClickCapture={event => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (link && !isSafeMarkdownLink(link.getAttribute("href") || "")) { event.preventDefault(); event.stopPropagation(); }
    }}><EnrichedView text={text} /></div>
  </div>;
}
