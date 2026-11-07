import { act, renderHook, waitFor, render, screen } from '@testing-library/react';
import { classifyMemory, presentMemory, mapMemoryRow } from '../memoryDocument';
import type { CogneeInstance } from '../../instances/types';
import useMemoryDocuments, { MEMORY_REQUEST_TIMEOUT_MS } from '../useMemoryDocuments';
import MarkdownContent from '@/ui/elements/MarkdownContent';
const row = { id: 'one', name: 'text_0123456789abcdef' };
const owner = (fetch: CogneeInstance['fetch']) => ({ name: 'test', instanceId: 'test', fetch });
const response = (text: string) => ({ ok: true, text: async () => text } as Response);
test('session header alone does not establish transcript; metadata wins', () => {
 expect(classifyMemory(row, 'Session ID: claude_one\nTool Output: {"stdout":"a\\nb"}')?.kind).toBe('Trace');
 expect(classifyMemory({...row,externalMetadata:{node_set:['agent_trace_feedbacks']}}, '# memory/dreaming/x')?.kind).toBe('Trace');
});
test.each(['Tool Output: {"stdout":"a\\nb","n":9007199254740993,"x":1,"x":2}\n', 'Tool Output: {"stdout":"bad', 'Tool Output: NaN', 'literal \\n', '', 'Question: q\nAnswer: a\n```\nQuestion: code\n```\n'])('all blocks retain exact source slices %s', raw => {
 const view = presentMemory(raw, 'Trace');
 expect(view.raw).toBe(raw); expect(view.blocks.map(b=>b.source).join('')).toBe(raw);
});
test('trace strings decode only valid JSON while structure keeps duplicate keys and large numbers', () => {
 const raw='Tool Output: {"stdout":"a\\nb","stderr":"err\\n","content":[{"text":"hi\\nthere"}],"n":9007199254740993,"x":1,"x":2}';
 const block=presentMemory(raw,'Trace').blocks[0];
 expect(block.kind).toBe('trace');
 if(block.kind!=='trace') throw new Error('trace required');
 expect(block.output.map(p=>p.source).join('')).toBe(raw.slice(raw.indexOf('{')));
 expect(block.output.filter(p=>p.kind==='text').map(p=>p.text)).toEqual(['a\nb','err\n','hi\nthere']);
 expect(block.output.filter(p=>p.kind==='literal').map(p=>p.source).join('')).toContain('9007199254740993,"x":1,"x":2');
});
test('QA markers inside fenced code stay in their turn', () => {
 const raw='Session ID: codex_one\nQuestion: q\nAnswer: a\n```txt\nQuestion: code\n```\nQuestion: second\nAnswer: next';
 expect(presentMemory(raw,'Transcript').blocks.filter(b=>b.kind==='turn')).toHaveLength(4);
});
test('concise label title and provenance are mapped from actual fields', () => {
 const mapped=mapMemoryRow({...row,label:'A recorded label',createdAt:'saved',updatedAt:'updated',dataSize:42,rawDataLocation:'/private/a.txt'});
 const memory=classifyMemory(mapped,'A long body');
 expect(memory).toMatchObject({title:'A recorded label',provenance:{savedAt:'saved',updatedAt:'updated',size:42,location:'a.txt'}});
 expect(classifyMemory({...row,name:'memory_dreaming_rem_2026-10-14-md'},'report')?.agentEvidence).toMatch(/no.*session/i);
});
test('real Markdown renders formatting, visible inert HTML, alt text and no unsafe URL', () => {
 const {container}=render(<MarkdownContent text={'**bold**\n\n<script>window.bad=1</script>\n\n![remote](https://evil.invalid/x) [bad](javascript:alert(1))'} />);
 expect(screen.getByText('bold').tagName).toBe('STRONG');
 expect(container.textContent).toContain('<script>window.bad=1</script>');
 expect(container.textContent).toContain('remote');
 expect(container.querySelector('img,script,a[href^="javascript:"]')).toBeNull();
});
test('local search includes full cached bodies without new reads', async () => {
 const fetch=jest.fn(async()=>response('start\n'+ 'x'.repeat(600)+' fullneedle'));
 const instance=owner(fetch); const {result}=renderHook(()=>useMemoryDocuments(instance,'ds',[row]));
 await waitFor(()=>expect(result.current.previewed).toBe(1));
 act(()=>result.current.setSearch('fullneedle')); expect(result.current.filtered).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
});
test('ignored abort and hung body release slots on deadline and mark unreadable', async () => {
 jest.useFakeTimers();
 const rows=Array.from({length:5},(_,i)=>({...row,id:String(i)}));
 const fetch=jest.fn().mockImplementationOnce(async()=>({ok:true,text:()=>new Promise<Response>(()=>{})})).mockImplementation(()=>new Promise<Response>(()=>{}));
 const instance=owner(fetch); const {result,unmount}=renderHook(()=>useMemoryDocuments(instance,'ds',rows));
 await act(async()=>{}); expect(fetch).toHaveBeenCalledTimes(4);
 await act(async()=>jest.advanceTimersByTime(MEMORY_REQUEST_TIMEOUT_MS+1));
 expect(fetch).toHaveBeenCalledTimes(5); expect(result.current.summary(rows[0])).toMatchObject({kind:'Unreadable',title:'Unreadable memory',agent:'Unreadable'});
 unmount(); jest.useRealTimers();
});

test.each(['NaN', 'Infinity', '{"stdout":NaN}'])('invalid trace output stays literal with an explanation %s', output => {
 const block=presentMemory('Tool Output: '+output,'Trace').blocks[0];
 expect(block.kind).toBe('trace');
 if(block.kind==='trace') { expect(block.reason).toMatch(/literal/); expect(block.output).toEqual([{kind:'literal',source:output}]); }
});
test('literal escapes outside known JSON output stay literal and titles are bounded', () => {
 const raw='plain \\n \\t \\u1234'; const view=presentMemory(raw,'Unknown');
 expect(view.blocks[0]).toMatchObject({kind:'literal',source:raw});
 expect(classifyMemory(row,'word '.repeat(80))!.title.length).toBeLessThanOrEqual(80);
});
test('retry supersedes a hung attempt and a late result cannot overwrite it', async () => {
 let late!: (value: Response)=>void;
 const fetch=jest.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{late=r})).mockResolvedValue(response('new body'));
 const instance=owner(fetch); const {result}=renderHook(()=>useMemoryDocuments(instance,'ds',[row]));
 act(()=>result.current.open(row.id)); act(()=>result.current.retry());
 await waitFor(()=>expect(result.current.body).toEqual({kind:'ready',text:'new body'}));
 await act(async()=>late(response('old body')));
 expect(result.current.body).toEqual({kind:'ready',text:'new body'});
});
test('stop cancels bounded work and close cancels selection-only work even if abort ignored', async () => {
 const fetch=jest.fn(()=>new Promise<Response>(()=>{})); const instance=owner(fetch);
 const docs=Array.from({length:60},(_,i)=>({...row,id:String(i)}));
 const {result,unmount}=renderHook(()=>useMemoryDocuments(instance,'ds',docs));
 const signals=fetch.mock.calls;
 act(()=>result.current.stopPreviews()); await act(async()=>{});
 expect(result.current.previewing).toBe(false); expect(fetch).toHaveBeenCalledTimes(4);
 act(()=>result.current.open('59')); expect(fetch).toHaveBeenCalledTimes(5);
 act(()=>result.current.close()); await act(async()=>{});
 expect(result.current.selected).toBeUndefined(); expect(result.current.previewing).toBe(false);
 expect(signals).toHaveLength(5); unmount();
});
test('indexed action uses one query and opens unpaged sources without adding rows', async () => {
 const source='12345678-1234-1234-1234-123456789abc';
 const fetch=jest.fn(async (input: RequestInfo|URL) => String(input)==='/v1/search' ? ({ok:true,json:async()=>[{dataset_id:'ds',search_result:[{text:'ranked passage',document_id:source},{text:'source missing'}]}]} as Response) : response('source body'));
 const instance=owner(fetch); const {result}=renderHook(()=>useMemoryDocuments(instance,'ds',[]));
 act(()=>result.current.setSearch('keyword')); expect(fetch).not.toHaveBeenCalled();
 act(()=>result.current.searchIndexed());
 await waitFor(()=>expect(result.current.indexed.kind).toBe('ready'));
 expect(fetch.mock.calls[0][0]).toBe('/v1/search');
 act(()=>result.current.openSource(source));
 await waitFor(()=>expect(result.current.body?.kind).toBe('ready'));
 expect(result.current.loaded).toBe(0); expect(result.current.selected).toMatchObject({id:source,metadataUnavailable:true});
});

test('content string arrays decode each string, stdout arrays remain structural', () => {
 const block=presentMemory('Tool Output: {"content":["a\\nb","c\\nd"],"stdout":["literal\\n"]}','Trace').blocks[0];
 if(block.kind!=='trace') throw new Error('trace required');
 expect(block.output.filter(p=>p.kind==='text').map(p=>p.text)).toEqual(['a\nb','c\nd']);
 expect(block.output.at(-1)?.source).toContain('"stdout":["literal\\n"]');
});

test('unknown agent names the recorded channel and blank session headers do not invent an ID',()=>{
 expect(classifyMemory(row,'Session ID: other_one\nplain')?.agentEvidence).toMatch(/maps to API; it does not identify/);
 expect(classifyMemory(row,'Session ID:\nQuestion: hello')?.sessionId).toBeNull();
});

test('recorded body report dates and meaningful headings precede incidental preambles',()=>{
 expect(classifyMemory(row,'# memory/dreaming/rem/2026-10-14.md\n\n# Reflection')?.provenance.recordedDate).toBe('2026-10-14');
 expect(classifyMemory(row,'Date: 2026-10-14\nPreamble\n# Useful heading')?.title).toBe('Useful heading');
});

test('screenshot-shaped truncated stdout decodes valid prefix without changing raw', () => {
 const raw = 'Session ID: claude_18cf3b8d\n\nBash succeeded. Output: {"stdout": "### Bug fix\\n\\n**You own this task.**...\\u12';
 const view = presentMemory(raw, 'Trace');
 expect(view.blocks.map(b => b.source).join('')).toBe(raw);
 const trace = view.blocks.find(b => b.kind === 'trace');
 if (!trace || trace.kind !== 'trace') throw new Error('trace missing');
 expect(trace.reason).toMatch(/Incomplete/);
 expect(trace.output.filter(p => p.kind === 'text').map(p => p.text)).toEqual(['### Bug fix\n\n**You own this task.**...']);
 expect(trace.output.map(p => p.source).join('')).toBe(raw.slice(raw.indexOf('{')));
 expect(classifyMemory(row, raw)).toMatchObject({ title: 'Bug fix', snippet: expect.stringContaining('\n') });
});
test('dates in question or output are not document dates', () => {
 expect(classifyMemory(row, 'Session ID: codex_one\nQuestion: q\nAnswer: a\nDate: yesterday')?.provenance.recordedDate).toBeUndefined();
});
test('query survives revision without leaking to another dataset', () => {
 const instance = owner(jest.fn(() => new Promise<Response>(() => {})));
 const {result, rerender} = renderHook(({revision, dataset}) => useMemoryDocuments(instance,dataset,[],revision), {initialProps:{revision:0,dataset:'ds'}});
 act(() => result.current.setSearch('keep query'));
 rerender({revision:1,dataset:'ds'}); expect(result.current.search).toBe('keep query');
 rerender({revision:1,dataset:'other'}); expect(result.current.search).toBe('');
});
test('binary indexed sources do not fetch raw, including retry', () => {
 const fetch = jest.fn(async () => response('binary'));
 const instance = owner(fetch); const pdf = {...row, extension:'pdf', mimeType:'application/pdf'};
 const {result} = renderHook(() => useMemoryDocuments(instance,'ds',[pdf]));
 act(() => result.current.openSource(pdf.id));
 expect(result.current.body?.kind).toBe('error');
 act(() => result.current.retry()); expect(fetch).not.toHaveBeenCalled();
});
test('unpaged binary response is rejected before text consumption', async () => {
 const text = jest.fn(async () => 'binary');
 const fetch = jest.fn(async () => ({ok:true,headers:new Headers({'Content-Type':'application/pdf'}),text} as unknown as Response));
 const instance = owner(fetch); const {result} = renderHook(() => useMemoryDocuments(instance,'ds',[]));
 act(() => result.current.openSource('one'));
 await waitFor(() => expect(result.current.body?.kind).toBe('error'));
 expect(text).not.toHaveBeenCalled();
});
