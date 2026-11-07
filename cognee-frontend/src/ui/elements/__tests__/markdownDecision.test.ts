import { decideMarkdown, isSafeMarkdownLink } from "../markdown/decision";

describe("Markdown render decision", () => {
  test.each(["", " \n\t"])("empty document %j", text => expect(decideMarkdown(text)).toEqual({kind:"empty"}));
  test.each(["# Heading\n\nBody **bold**", "```txt\n||literal||\n```", "---", "| A | B |\n| - | - |\n| one | two |", "- [ ] keep read only", "[safe](https://example.org)"])("ordinary Markdown uses Enriched %j", text => expect(decideMarkdown(text).kind).toBe("enriched"));
  test.each(["Body[^1]\n\n[^1]: FOOTNOTE_SENTINEL", "before ||secret|| after", "<div>KEEP_HTML</div>", "![KEEP_ALT](https://example.org/image)", "![reference][id]\n\n[id]: https://example.org/i", "```html\n<img src=x>\n```", "[bad](javascript:alert)", "[bad](jav&#x61;script:alert)", "[bad](vbscript:alert)", "[bad](data:text/html,hi)", "[relative](/path)", "[bad][id]\n\n[id]: javascript:alert"])("whole document compatibility %j", text => expect(decideMarkdown(text).kind).toBe("compatible"));
  test.each(["https://example.org", "HTTP://example.org/path", "mailto:person@example.org", "#heading"])("safe link %j", url => expect(isSafeMarkdownLink(url)).toBe(true));
  test.each(["", "javascript:alert(1)", "java\nscript:alert", "jav&#97;script:alert", " data:text/plain,a", "//evil.invalid", "/relative", "https:\\evil.invalid", "https://", "\u0000https://example.org"])("unsafe link %j", url => expect(isSafeMarkdownLink(url)).toBe(false));
});

test('entities use compatible rendering without losing characters', () => {
 expect(decideMarkdown('Promise&lt;void&gt; AT&amp;T &copy; caf&eacute; x&#33;y')).toEqual({kind:'compatible',reasons:['entity']});
});
test('ordinary query parameters and punctuation before links remain valid', () => {
 const url='https://github.com/o/r/issues?q=is%3Aopen&label=bug';
 expect(isSafeMarkdownLink(url)).toBe(true);
 expect(decideMarkdown('Fixed! [PR]('+url+')')).toEqual({kind:'enriched'});
});
