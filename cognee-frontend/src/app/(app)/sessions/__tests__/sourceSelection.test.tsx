import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import SessionsPage from '../page';
import { getSessionDetail, type SessionDetail } from '@/modules/sessions/getSessions';
let owner = { name: 'fixture', instanceId: 'a', fetch: jest.fn() };
jest.mock('@/modules/tenant/TenantProvider', () => ({ useCogniInstance: () => ({ cogniInstance: owner, isInitializing: false }) }));
jest.mock('@/modules/analytics', () => ({ TrackPageView: () => null }));
jest.mock('@/modules/sessions/getSessions', () => ({ ...jest.requireActual('@/modules/sessions/getSessions'), listSessions: jest.fn(async () => ({ sessions: [] })), getSessionStats: jest.fn(async () => null), getSessionDetail: jest.fn(async () => null) }));
test('query selects once per instance and missing session remains visible with empty list', async () => {
  window.history.replaceState({}, '', '/sessions?session=codex_fixture');
  const { rerender } = render(<SessionsPage />);
  await waitFor(() => expect(getSessionDetail).toHaveBeenCalledWith(owner, 'codex_fixture'));
  await waitFor(() => expect(screen.getByText('Could not load this session.')).toBeTruthy());
  const calls = jest.mocked(getSessionDetail).mock.calls.length;
  rerender(<SessionsPage />); expect(jest.mocked(getSessionDetail).mock.calls.length).toBe(calls);
  owner = { ...owner, instanceId: 'b' }; rerender(<SessionsPage />);
  await waitFor(() => expect(jest.mocked(getSessionDetail).mock.calls.length).toBeGreaterThan(calls));
  await act(async () => {});
});

test('refresh keeps the expanded saved answer visible while detail is fetched', async () => {
  const detail: SessionDetail = {
    session_id: 'codex_refresh', user_id: 'fixture', dataset_id: 'fixture',
    status: 'running', effective_status: 'running', started_at: null,
    last_activity_at: null, ended_at: null, tokens_in: 0, tokens_out: 0,
    cost_usd: 0, error_count: 0, last_model: null, label: null,
    msg_count: 1, tool_calls: 0, traces: [],
    qas: [{ question: 'saved turn survives refresh', answer: 'saved answer remains visible' }],
  };
  jest.mocked(getSessionDetail).mockResolvedValueOnce(detail);
  window.history.replaceState({}, '', '/sessions?session=codex_refresh');
  render(<SessionsPage />);
  await screen.findByText('saved turn survives refresh', {}, { timeout: 10000 });
  fireEvent.click(screen.getByRole('button', { name: 'Expand answer 1' }));
  expect(await screen.findByText('saved answer remains visible', {}, { timeout: 10000 })).toBeInTheDocument();
  let finish: (value: SessionDetail) => void = () => {};
  jest.mocked(getSessionDetail).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByTitle('Refresh'));
  expect(screen.getByText('saved answer remains visible')).toBeInTheDocument();
  await act(async () => finish(detail));
  expect(screen.getByText('saved answer remains visible')).toBeInTheDocument();
}, 30000);


const question = '## Prompt heading\n\n**Prompt bold** &amp; context\n\n- Prompt item\n\n`promptCode`\n\n[Prompt link](https://example.com/#prompt)';
const answer = '## Answer heading\n\n**Answer bold** &amp; context\n\n- Answer item\n\n```txt\nanswerCode\n```\n\n[Answer link](https://example.com/#answer)';

async function renderTranscript() {
  jest.mocked(getSessionDetail).mockResolvedValue({
    session_id: 'codex_markdown', user_id: 'fixture', dataset_id: 'fixture',
    status: 'completed', effective_status: 'completed', started_at: null,
    last_activity_at: null, ended_at: null, tokens_in: 0, tokens_out: 0,
    cost_usd: 0, error_count: 0, last_model: null, label: null,
    msg_count: 3, tool_calls: 0, traces: [],
    qas: [{ question, answer }, { question: '## Question only &amp; context' }, { question: 'Other turn', answer: 'Other answer' }],
  });
  window.history.replaceState({}, '', '/sessions?session=codex_markdown');
  const view = render(<SessionsPage />);
  await screen.findByText('Transcript · 3 turns');
  return view;
}

test('transcript formats prompts and expanded answers while links remain outside toggle controls', async () => {
  const { container } = await renderTranscript();
  expect(screen.getByRole('heading', { name: 'Prompt heading', level: 2 })).toBeVisible();
  expect(screen.getByText('Prompt bold').tagName).toBe('STRONG');
  expect(screen.getByText('Prompt item').closest('li')).not.toBeNull();
  expect(screen.getByText('promptCode').tagName).toBe('CODE');
  const toggle = screen.getByRole('button', { name: 'Expand answer 1' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('link', { name: 'Prompt link' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Collapse answer 1' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('heading', { name: 'Answer heading', level: 2 })).toBeVisible();
  expect(screen.getByText('Answer bold').tagName).toBe('STRONG');
  expect(screen.getByText('Answer item').closest('li')).not.toBeNull();
  expect(screen.getByText('answerCode').closest('pre')).not.toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Answer link' }));
  expect(screen.getByRole('button', { name: 'Collapse answer 1' })).toHaveAttribute('aria-expanded', 'true');
  expect(container.querySelector('button a, button input, button button, a button')).toBeNull();
});

test('question-only Markdown remains selectable content without an expansion action', async () => {
  await renderTranscript();
  const heading = screen.getByRole('heading', { name: 'Question only & context' });
  expect(heading.closest('button')).toBeNull();
  expect(screen.queryByRole('button', { name: /answer 2/ })).toBeNull();
});

test('copy and transcript search preserve exact original Markdown source', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await renderTranscript();
  fireEvent.click(screen.getByRole('button', { name: 'Expand answer 1' }));
  fireEvent.click(screen.getByTitle('Copy answer'));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(answer));
  fireEvent.change(screen.getByPlaceholderText('Search transcript…'), { target: { value: '**Answer bold**' } });
  expect(screen.getByRole('heading', { name: 'Prompt heading' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Question only & context' })).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Search transcript…'), { target: { value: '## Prompt heading' } });
  expect(screen.getByRole('heading', { name: 'Prompt heading' })).toBeVisible();
});
