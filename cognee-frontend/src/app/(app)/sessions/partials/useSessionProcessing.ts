"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CogneeInstance } from "@/modules/instances/types";
import type { SessionDetail } from "@/modules/sessions/getSessions";
import { getRecordedRuns, getSessionDetailStrict, isAccessDenied, mergeRecordedRows, recordingError, recordingErrorStatus,
  selectSessionRecords, type RecordedRun, type SessionIdentity } from "@/modules/sessions/sessionOperations";

export function useRecordedRuns(instance: CogneeInstance | null | undefined, identity?: SessionIdentity) {
  const sessionId = identity?.sessionId;
  const userId = identity?.userId;
  const key = JSON.stringify([instance?.instanceId, userId, sessionId]);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; rows: RecordedRun[]; nextOffset: number | null;
    loading: boolean; error: string | null; errorStatus: number | null; stale: boolean }>({ key, rows: [], nextOffset: null, loading: true, error: null, errorStatus: null, stale: false });
  const request = useRef<{ controller: AbortController; load: (offset: number) => void } | null>(null);
  useEffect(() => {
    if (!instance) return;
    const controller = new AbortController();
    let active = true;
    let pending = false;
    const load = async (offset: number) => {
      if (pending) return;
      pending = true;
      setState((old) => ({ key, rows: old.key === key ? old.rows : [],
        nextOffset: old.key === key ? old.nextOffset : null, loading: true, error: null, errorStatus: null, stale: false }));
      try {
        const page = await getRecordedRuns(instance, { sessionId, offset }, controller.signal);
        if (!active) return;
        const rows = sessionId !== undefined && userId !== undefined
          ? selectSessionRecords({ sessionId, userId }, page.rows) : page.rows;
        setState((old) => ({ key, rows: mergeRecordedRows(offset === 0 ? [] : old.rows, rows),
          nextOffset: page.nextOffset, loading: false, error: null, errorStatus: null, stale: false }));
      } catch (error) {
        if (!active) return;
        setState((old) => ({ key, rows: isAccessDenied(error) ? [] : old.rows,
          nextOffset: isAccessDenied(error) ? null : old.nextOffset, loading: false,
          error: recordingError(error), errorStatus: recordingErrorStatus(error), stale: !isAccessDenied(error) && old.rows.length > 0 }));
      } finally { pending = false; }
    };
    request.current = { controller, load };
    void load(0);
    return () => { active = false; controller.abort(); request.current = null; };
  }, [instance, key, sessionId, userId, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const visible = state.key === key ? state : { key, rows: [], nextOffset: null, loading: true, error: null, errorStatus: null, stale: false };
  const loadMore = () => { if (!visible.loading && visible.nextOffset !== null) request.current?.load(visible.nextOffset); };
  return { ...visible, refresh, loadMore };
}

export function useSessionProcessing(instance: CogneeInstance | null | undefined, identity: SessionIdentity, refreshNonce = 0) {
  const { sessionId, userId } = identity;
  const key = JSON.stringify([instance?.instanceId, userId, sessionId]);
  const history = useRecordedRuns(instance, identity);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; detail: SessionDetail | null; loading: boolean; error: string | null; errorStatus: number | null; stale: boolean }>(
    { key, detail: null, loading: true, error: null, errorStatus: null, stale: false });
  useEffect(() => {
    if (!instance) return;
    let active = true;
    const controller = new AbortController();
    setState((old) => ({ key, detail: old.key === key ? old.detail : null, loading: true, error: null, errorStatus: null, stale: false }));
    getSessionDetailStrict(instance, { sessionId, userId }, controller.signal).then((detail) => {
      if (active) setState({ key, detail, loading: false, error: null, errorStatus: null, stale: false });
    }).catch((error) => {
      if (active) setState((old) => ({ key, detail: isAccessDenied(error) ? null : old.detail,
        loading: false, error: recordingError(error), errorStatus: recordingErrorStatus(error), stale: !isAccessDenied(error) && old.detail !== null }));
    });
    return () => { active = false; controller.abort(); };
  }, [instance, key, sessionId, userId, nonce, refreshNonce]);
  const refreshHistory = history.refresh;
  const previousRefresh = useRef(refreshNonce);
  useEffect(() => {
    if (previousRefresh.current !== refreshNonce) refreshHistory();
    previousRefresh.current = refreshNonce;
  }, [refreshNonce, refreshHistory]);
  return { detail: state.key === key ? state.detail : null,
    detailLoading: state.key === key ? state.loading : true,
    detailError: state.key === key ? state.error : null,
    detailErrorStatus: state.key === key ? state.errorStatus : null,
    detailStale: state.key === key && state.stale,
    retryDetail: () => setNonce((n) => n + 1), history };
}
