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
  fireEvent.click(await screen.findByText('saved turn survives refresh'));
  expect(screen.getByText('saved answer remains visible')).toBeInTheDocument();
  let finish: (value: SessionDetail) => void = () => {};
  jest.mocked(getSessionDetail).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByTitle('Refresh'));
  expect(screen.getByText('saved answer remains visible')).toBeInTheDocument();
  await act(async () => finish(detail));
  expect(screen.getByText('saved answer remains visible')).toBeInTheDocument();
});
