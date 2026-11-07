import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import MemoryControls from '../MemoryControls';
import useMemoryDocuments from '../useMemoryDocuments';
const row = { id: 'literal', name: 'text_0123456789abcdef', externalMetadata: { node_set: ['session_learnings', 'session_learnings:codex_safe'] } };
const body = '# Session learning (session codex_safe)\n\n<script>window.bad=true</script>\n **literal markdown**';
const owner = { name: 'fixture', instanceId: 'fixture', fetch: jest.fn(async () => ({ ok: true, text: async () => body } as Response)) };
function Fixture() { const memory = useMemoryDocuments(owner, 'a', [row]); return <MantineProvider><button onClick={() => memory.open(row.id)}>Open fixture</button><MemoryControls memory={memory} /></MantineProvider>; }
test('literal body, encoded source link, keyboard close and focus restoration', async () => {
  render(<Fixture />);
  const opener = screen.getByText('Open fixture'); opener.focus(); fireEvent.click(opener);
  await waitFor(() => expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(body));
  expect(screen.getByRole('dialog').querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: /Source session/ }).getAttribute('href')).toBe('/sessions?session=codex_safe');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener));
  await act(async () => {});
});
