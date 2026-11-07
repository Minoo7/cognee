"use client";

import { LocalProvider } from "./LocalProvider";

/** Provides the authenticated self-hosted Cognee instance and its active tenant. */
export default function AppProvider({ children }: { children: React.ReactNode }) {
  return <LocalProvider>{children}</LocalProvider>;
}
