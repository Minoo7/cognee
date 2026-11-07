"use client";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import type { ComponentProps } from "react";
import { isSafeMarkdownLink } from "./decision";

const mono = 'ui-monospace, Menlo, Monaco, "Cascadia Mono", monospace';
const body = { fontSize: 14, color: "#EDECEA", lineHeight: 24, marginTop: 0, marginBottom: 14 };
const markdownStyle = {
  paragraph: body,
  h1: { ...body, fontSize: 20, fontWeight: "700", lineHeight: 29, marginTop: 20, marginBottom: 12 },
  h2: { ...body, fontSize: 17, fontWeight: "700", lineHeight: 26, marginTop: 18, marginBottom: 10 },
  h3: { ...body, fontSize: 15, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  h4: { ...body, fontSize: 14, fontWeight: "700", marginTop: 14 },
  h5: { ...body, fontSize: 14, fontWeight: "700" },
  h6: { ...body, fontSize: 14, fontWeight: "700" },
  strong: { color: "#F5F2FA", fontWeight: "bold" },
  em: { color: "#EDECEA" },
  list: { ...body, marginLeft: 26, itemSpacing: 6 },
  code: { fontFamily: mono, fontSize: 12, color: "#D9BEFF", backgroundColor: "#2B2437", borderColor: "#494052" },
  codeBlock: { ...body, fontFamily: mono, fontSize: 12, lineHeight: 21, color: "#DCE1F0", backgroundColor: "#16151C", borderWidth: 1, borderColor: "#39333F", borderRadius: 8, padding: 16, marginTop: 4, marginBottom: 16 },
  link: { color: "#C9AAFF", underline: true },
  blockquote: { ...body, color: "#D5CADF", borderColor: "#A17BD9", borderWidth: 3, gapWidth: 10, padding: 10, borderRadius: 4, backgroundColor: "#211D28" },
  thematicBreak: { color: "#494052", height: 1, marginTop: 20, marginBottom: 20 },
  table: { ...body, fontSize: 13, lineHeight: 22, borderWidth: 1, borderColor: "#494052", borderRadius: 6, headerBackgroundColor: "#30273D", headerTextColor: "#F1E9FC", rowEvenBackgroundColor: "#1D1A23", rowOddBackgroundColor: "#24202B", cellPaddingHorizontal: 14, cellPaddingVertical: 10, marginTop: 4, marginBottom: 16 },
  taskList: { checkedColor: "#C9AAFF", checkedTextColor: "#D5CADF" },
} satisfies NonNullable<ComponentProps<typeof EnrichedMarkdownText>["markdownStyle"]>;

export default function EnrichedView({ text }: { text: string }) {
  return <EnrichedMarkdownText markdown={text} markdownStyle={markdownStyle} md4cFlags={{ latexMath: false, admonitions: false }} enableTaskListItemToggle={false} containerStyle={{ minWidth: 0 }} onLinkPress={({ url }) => {
    if (!url.startsWith("#") && isSafeMarkdownLink(url)) window.open(url, "_blank", "noopener,noreferrer");
  }} />;
}
