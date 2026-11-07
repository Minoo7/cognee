import { classifyMemory } from '../memoryDocument';
const row = { id: '1', name: 'text_0123456789abcdef' };
test('native array lesson tags preserve known agent before body', () => {
  expect(classifyMemory({ ...row, externalMetadata: { node_set: ['session_learnings', 'session_learnings:codex_test'] } })).toMatchObject({ kind: 'Lesson', agent: 'Codex', sessionId: 'codex_test' });
});
test('legacy lesson title and literal snippet', () => {
  expect(classifyMemory(row, '# Session learning (session claude_test)\n\n<script>literal</script>')).toMatchObject({ kind: 'Lesson', agent: 'Claude', title: '<script>literal</script>' });
});
test('native QA heading and question', () => {
  expect(classifyMemory({ ...row, externalMetadata: { node_set: ['user_sessions_from_cache'] } }, 'Session ID: openclaw_test\n\nQuestion: Safe question\n\nAnswer: response')).toMatchObject({ kind: 'Transcript', agent: 'OpenClaw', title: 'Safe question' });
});
test('dreaming filenames and headings', () => {
  expect(classifyMemory({ ...row, name: 'memory_dreaming_rem_2026-10-14-md' })).toMatchObject({ kind: 'Report', title: 'Dreaming rem · 2026-10-14' });
  expect(classifyMemory(row, '# memory/dreaming/light/2026-10-14.md\n\n# Light Sleep')).toMatchObject({ kind: 'Report' });
});
test.each([null, 'bad', 3, { node_set: 'session_learnings' }, { node_set: [null, 2] }])('malformed metadata stays pending until preview %p', externalMetadata => {
  expect(classifyMemory({ ...row, externalMetadata })?.agent).toBe('Pending');
  expect(classifyMemory({ ...row, externalMetadata }, '')?.agent).toBe('Unknown');
});
test('conflicting session evidence never creates source link', () => {
  expect(classifyMemory({ ...row, externalMetadata: { node_set: ['session_learnings:codex_a', 'session_learnings:claude_b'] } }, '# Session learning (session codex_a)\n\nLesson')).toMatchObject({ agent: 'Unknown', sessionId: null });
});
test('ordinary files and binary rows never qualify', () => {
  expect(classifyMemory({ id: 'pdf', name: 'report.pdf' })).toBeNull();
  expect(classifyMemory({ ...row, extension: 'pdf', externalMetadata: { node_set: ['session_learnings'] } })).toBeNull();
});
