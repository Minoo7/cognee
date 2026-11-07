"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TenantContext, localInstance } from "./TenantContext";
import { tokens } from "@/ui/theme/tokens";
import { getLocalApiUrl } from "@/modules/users/getLocalApiUrl";
import { UserContext, type AvailableTenant } from "@/modules/users/UserContext";
import NameWorkspaceModal from "@/ui/layout/NameWorkspaceModal";
import createWorkspace from "./createWorkspace";
import {
  loadLocalTenantState,
  LocalTenantApiError,
  selectLocalTenant,
  type LocalTenantState,
} from "./localTenantApi";

type ProviderState =
  | { kind: "loading" }
  | { kind: "ready"; value: LocalTenantState | null }
  | { kind: "error"; message: string };

export function LocalProvider({ children }: { children: React.ReactNode }) {
  const localApiUrl = getLocalApiUrl();
  const [state, setState] = useState<ProviderState>({ kind: "loading" });
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const tenant = state.kind === "ready" ? state.value?.tenant ?? null : null;
  const availableTenants = useMemo<AvailableTenant[]>(
    () => state.kind === "ready" ? state.value?.availableTenants ?? [] : [],
    [state],
  );
  const isInitializing = state.kind === "loading";
  const error = state.kind === "error" ? state.message : null;

  // Memoized: consumers key effects off availableTenants, so a fresh array on
  // every render would re-fire them on unrelated re-renders.
  const userContextValue = useMemo(
    () => ({
      userMe: null,
      isLoading: isInitializing,
      isUserMeError: false,
      markWelcomeSeen: async () => {},
      markOnboardingComplete: async () => {},
      dismissFeatureAnnouncement: async () => {},
      setSessionRecordingConsent: async () => {},
      updateProfileName: async () => {},
      availableTenants,
      isLoadingTenants: isInitializing,
      isTenantsError: state.kind === "error",
      refetchTenants: () => {},
      setAvailableTenantsOptimistic: () => {},
    }),
    [availableTenants, isInitializing, state.kind],
  );

  const switchTenant = useCallback(
    async (tenantId: string) => {
      try {
        await selectLocalTenant(localApiUrl, tenantId);
        window.location.reload();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not switch workspace";
        setState({ kind: "error", message });
      }
    },
    [localApiUrl],
  );

  const requestCreateWorkspace = useCallback(() => {
    setWorkspaceName("");
    setWorkspaceError(null);
    setWorkspaceModalOpen(true);
  }, []);

  const closeWorkspaceModal = useCallback(() => {
    setWorkspaceModalOpen(false);
    setWorkspaceError(null);
  }, []);

  const submitWorkspace = useCallback(async () => {
    setWorkspaceSubmitting(true);
    setWorkspaceError(null);
    try {
      await createWorkspace(workspaceName);
      window.location.reload();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Could not create workspace");
      setWorkspaceSubmitting(false);
    }
  }, [workspaceName]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Guard: don't check auth if we're already on the login page (avoids redirect loop)
      if (typeof window !== "undefined" && window.location.pathname === "/local-login") {
        setState({ kind: "ready", value: null });
        return;
      }

      try {
        const localTenantState = await loadLocalTenantState(localApiUrl);
        if (cancelled) return;
        setState({ kind: "ready", value: localTenantState });
      } catch (err) {
        if (cancelled) return;

        if (err instanceof LocalTenantApiError && (err.status === 401 || err.status === 403)) {
          window.location.href = "/local-login";
          return;
        }

        const message = err instanceof TypeError
          ? "Cannot connect to local Cognee backend at " + localApiUrl + ". Is it running?"
          : err instanceof Error ? err.message : "Failed to connect to local backend";
        setState({ kind: "error", message });
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [localApiUrl]);

  if (error && !isInitializing) {
    return (
      <ErrorScreen message={error} />
    );
  }

  return (
    // UserContext sits above TenantContext because useTenant() reads
    // availableTenants out of it to derive isOwner/isPersonal. The tenant list
    // is the only field carrying real information here; the rest stay inert,
    // since local mode has no cloud user service to load them from.
    <UserContext.Provider value={userContextValue}>
      <TenantContext.Provider value={{
        tenant,
        cogniInstance: localInstance,
        localInstance,
        serviceUrl: localApiUrl,
        apiKey: "",
        isInitializing,
        tenantReady: true,
        podUnreachable: false,
        wakeState: "idle",
        wakeStartedAt: null,
        error,
        statusMessage: null,
        switchTenant,
        planType: null,
        hasAccess: true,
        requestCreateWorkspace,
        nameModalOpen: workspaceModalOpen,
        releaseLoader: () => {},
      }}>
        {children}
        {workspaceModalOpen && (
          <NameWorkspaceModal
            name={workspaceName}
            setName={setWorkspaceName}
            submitting={workspaceSubmitting}
            error={workspaceError}
            onSubmit={submitWorkspace}
            onClose={closeWorkspaceModal}
            mode="local"
            isFree={true}
          />
        )}
      </TenantContext.Provider>
    </UserContext.Provider>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem",
      textAlign: "center",
    }}>
      <div style={{
        backgroundColor: "#ffffff",
        borderRadius: "0.75rem",
        padding: "2.5rem",
        maxWidth: "28rem",
        width: "100%",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
      }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem", fontWeight: 700, color: tokens.textDark }}>
          Connection Error
        </h2>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", color: tokens.textSecondary }}>
          {message}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.5rem 1.5rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            backgroundColor: "#ffffff",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
