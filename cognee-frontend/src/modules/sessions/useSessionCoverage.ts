"use client";
import { useEffect, useState } from "react";
import type { CogneeInstance } from "../instances/types";
import { recordingErrorStatus, type SessionIdentity } from "./sessionOperations";
import { CoverageUnsupportedError, getSessionCoverage, type SessionCoverage } from "./sessionCoverage";

type State = { instance: CogneeInstance | null | undefined; key: string; data: SessionCoverage | null;
  loading: boolean; error: string | null; stale: boolean };
export function useSessionCoverage(instance: CogneeInstance | null | undefined, identity: SessionIdentity | null) {
  const sessionId = identity?.sessionId;
  const userId = identity?.userId;
  const key = JSON.stringify([instance?.instanceId, userId, sessionId]);
  const [nonce, setNonce] = useState(0);
  const empty: State = { instance, key, data: null, loading: !!instance && !!identity, error: null, stale: false };
  const [state, setState] = useState<State>(empty);
  useEffect(() => {
    if (!instance || sessionId === undefined || userId === undefined) return;
    const controller = new AbortController();
    let active = true;
    setState((old) => ({ instance, key, data: old.instance === instance && old.key === key ? old.data : null,
      loading: true, error: null, stale: old.instance === instance && old.key === key && old.data !== null }));
    getSessionCoverage(instance, { sessionId, userId }, controller.signal).then((data) => {
      if (active) setState({ instance, key, data, loading: false, error: null, stale: false });
    }).catch((error: unknown) => {
      if (!active) return;
      const status = recordingErrorStatus(error);
      const clear = status === 401 || status === 403 || status === 404 || error instanceof CoverageUnsupportedError;
      const message = error instanceof CoverageUnsupportedError ? error.message
        : status === 401 ? "Sign in required (401)."
        : status === 403 ? "Permission denied (403)."
        : status === 404 ? "Session unavailable or not visible (404)." : "Unable to read coverage. Retry to refresh.";
      setState((old) => ({ instance, key, data: clear ? null : old.data, loading: false,
        error: message, stale: !clear && old.data !== null }));
    });
    return () => { active = false; controller.abort(); };
  }, [instance, key, sessionId, userId, nonce]);
  return { ...(state.key === key && state.instance === instance ? state : empty), refresh: () => setNonce((n) => n + 1) };
}
