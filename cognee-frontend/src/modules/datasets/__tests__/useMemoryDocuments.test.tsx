import { act, renderHook, waitFor } from '@testing-library/react';
import useMemoryDocuments from '../useMemoryDocuments';
import type { CogneeInstance } from '../../instances/types';
const rows = Array.from({ length: 110 }, (_, i) => ({ id: String(i), name: 'text_0123456789abcdef', externalMetadata: { node_set: ['session_learnings', 'session_learnings:codex_test'] } }));
function response(text = '# Session learning (session codex_test)\n\nA useful lesson') { return { ok: true, text: async () => text } as Response; }
function instance(fetch: CogneeInstance['fetch']): CogneeInstance { return { name: 'fixture', instanceId: 'fixture', fetch }; }
test('previews at most fifty with concurrency four, filters and rows do not widen window', async () => {
  let active = 0; let max = 0;
  const releases: (() => void)[] = [];
  const fetch = jest.fn(() => new Promise<Response>(resolve => { active++; max = Math.max(max, active); releases.push(() => { active--; resolve(response()); }); }));
  const owner = instance(fetch);
  const { result, rerender } = renderHook(({ docs }) => useMemoryDocuments(owner, 'dataset', docs), { initialProps: { docs: rows } });
  expect(fetch).toHaveBeenCalledTimes(4);
  for (let i = 0; i < 14; i++) await act(async () => { releases.splice(0).forEach(release => release()); });
  expect(fetch).toHaveBeenCalledTimes(50); expect(max).toBe(4);
  act(() => result.current.setAgent('Claude')); rerender({ docs: [...rows] });
  expect(result.current.filtered).toHaveLength(0); expect(fetch).toHaveBeenCalledTimes(50);
  act(() => result.current.previewNext()); expect(fetch).toHaveBeenCalledTimes(54);
});
test('scope switch hides selected body immediately and stale responses cannot repopulate', async () => {
  let resolve!: (res: Response) => void;
  const fetch = jest.fn(() => new Promise<Response>(done => { resolve = done; }));
  const owner = instance(fetch);
  const { result, rerender } = renderHook(({ dataset, owner }) => useMemoryDocuments(owner, dataset, rows.slice(0, 1)), { initialProps: { dataset: 'a', owner } });
  act(() => result.current.open('0'));
  rerender({ dataset: 'b', owner: instance(async () => response('new')) });
  expect(result.current.selected).toBeUndefined(); expect(result.current.body).toBeUndefined();
  await act(async () => resolve(response('old')));
  await waitFor(() => expect(result.current.summary(rows[0])?.title).toBe('new'));
});
test('errors retry explicitly, empty body succeeds, open reuses cache, deletion closes and evicts', async () => {
  const fetch = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(response(''));
  const owner = instance(fetch);
  const { result, rerender } = renderHook(({ docs }) => useMemoryDocuments(owner, 'a', docs), { initialProps: { docs: rows.slice(0, 1) } });
  act(() => result.current.open('0'));
  await waitFor(() => expect(result.current.body?.kind).toBe('error'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.body).toEqual({ kind: 'ready', text: '' }));
  act(() => { result.current.close(); result.current.open('0'); }); expect(fetch).toHaveBeenCalledTimes(2);
  rerender({ docs: [] }); expect(result.current.selected).toBeUndefined();
  rerender({ docs: rows.slice(0, 1) }); expect(fetch).toHaveBeenCalledTimes(3);
  await waitFor(() => expect(result.current.previewed).toBe(1));
});
test('ordinary files cause no raw fetch and cannot be opened', () => {
  const fetch = jest.fn(); const owner = instance(fetch);
  const { result } = renderHook(() => useMemoryDocuments(owner, 'a', [{ id: 'pdf', name: 'normal.pdf' }]));
  act(() => result.current.open('pdf')); expect(fetch).not.toHaveBeenCalled(); expect(result.current.selected).toBeUndefined();
});
test('opening a row takes the next slot ahead of queued previews', async () => {
  const releases: ((value: Response) => void)[] = [];
  const fetch = jest.fn<Promise<Response>, [RequestInfo | URL]>(() => new Promise<Response>(resolve => releases.push(resolve)));
  const owner = instance(fetch);
  const { result } = renderHook(() => useMemoryDocuments(owner, 'a', rows));
  expect(fetch).toHaveBeenCalledTimes(4);
  act(() => result.current.open('70'));
  await act(async () => releases[0](response()));
  expect(fetch.mock.calls[4][0]).toContain('/data/70/raw');
});
test('reports are previewed within the same budget and deletion preserves the remaining cache', async () => {
  const report = { id: 'report', name: 'memory_dreaming_deep_2026-10-27-md' };
  const docs = [report, ...rows.slice(0, 2)];
  const fetch = jest.fn(async () => response());
  const owner = instance(fetch);
  const { result, rerender } = renderHook(({ docs }) => useMemoryDocuments(owner, 'a', docs), { initialProps: { docs } });
  await waitFor(() => expect(result.current.previewed).toBe(3));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(result.current.pending).toBe(0);
  expect(result.current.canPreview).toBe(false);
  rerender({ docs: [report, rows[1]] });
  expect(fetch).toHaveBeenCalledTimes(3);
  act(() => result.current.open('report'));
  await waitFor(() => expect(result.current.body?.kind).toBe('ready'));
  expect(fetch).toHaveBeenCalledTimes(3);
});
