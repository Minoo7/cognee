"use client";

import { useEffect, useMemo, useState } from "react";
import type { CogneeInstance } from "@/modules/instances/types";
import { HttpError } from "@/services/http/errors";
import getLiveEvents from "./getLiveEvents";
import { indexRecordedUsage, type RecordedNodeUsage } from "./recordedNodeUsage";
import type { SessionEvent } from "./types";

const POLL_MS = 1500;
const MAX_BACKOFF_MS = 10000;
const MAX_EVENTS = 200;
const EMPTY_EVENTS: SessionEvent[] = [];

function eventKey(e: SessionEvent): string {
  return `${e.kind || "search"}|${e.qa_id || ""}|${e.time || ""}|${e.question || ""}`;
}

export interface LiveUpdates {
  events: SessionEvent[];
  live: boolean;
  usageReady: boolean;
  usage: RecordedNodeUsage;
  latestSearchEvent: SessionEvent | null;
  consumeLatestSearchEvent: () => void;
  answeredIds: Set<string>;
}

// Ports the live-events poller (customer_tutorial.html:7086-7194) minus its
// location.reload() growth path. That reload existed only because the
// original is a static export that cannot re-fetch; here, the focused
// dataset's graph already refreshes in place on its own interval (see
// useBrainGraph, CLO-597), and the simulation's position cache
// (useBusinessSimulation) keeps existing nodes
// from resetting when it does — so "graph grew" needs no special handling,
// just this dataset's own accumulated event log for the spotlight and the
// node panel's reverse "which answers used this node" lookup.
export function useBusinessLiveUpdates(
  datasetId: string | null,
  cogniInstance: CogneeInstance,
): LiveUpdates {
  const [recorded, setRecorded] = useState<{
    datasetId: string | null;
    instance: CogneeInstance;
    events: SessionEvent[];
    live: boolean;
    usageReady: boolean;
    latestSearchEvent: SessionEvent | null;
  }>({ datasetId, instance: cogniInstance, events: EMPTY_EVENTS, live: true, usageReady: false, latestSearchEvent: null });
  const current = recorded.datasetId === datasetId && recorded.instance === cogniInstance;
  const events = current ? recorded.events : EMPTY_EVENTS;
  const usage = useMemo(() => indexRecordedUsage(events), [events]);

  useEffect(() => {
    const id = datasetId;
    let cursorForDataset: string | null = null;
    const seen = new Set<string>();
    setRecorded({ datasetId, instance: cogniInstance, events: EMPTY_EVENTS, live: true, usageReady: false, latestSearchEvent: null });
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    async function poll(datasetIdForPoll: string): Promise<void> {
      try {
        const { events: fresh, cursor } = await getLiveEvents(datasetIdForPoll, cursorForDataset, cogniInstance);
        if (cancelled) return;
        failures = 0;
        cursorForDataset = cursor;
        const deduped = fresh.filter((e) => {
          const key = eventKey(e);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const lastSearch = deduped.filter((e) => (e.kind || "search") === "search").at(-1);
        setRecorded((prev) => ({
          ...prev,
          events: deduped.length ? [...prev.events, ...deduped].slice(-MAX_EVENTS) : prev.events,
          latestSearchEvent: lastSearch ?? prev.latestSearchEvent,
          live: true,
          usageReady: true,
        }));
      } catch (error) {
        if (!cancelled) {
          failures++;
          setRecorded((prev) => ({ ...prev, live: false }));
          // A 409 means the backend rejected this exact cursor (e.g. it aged
          // out) — retrying with the same `since` value only produces the
          // same 409 forever, which is exactly what left the indicator
          // stuck on "reconnecting" indefinitely (COG-6412: traced via a
          // live network capture, same stale cursor repeating with no
          // backoff-driven change). Dropping the cursor makes the next poll
          // ask for a fresh snapshot instead of repeating a rejected delta.
          if (error instanceof HttpError && error.status === 409) {
            cursorForDataset = null;
          }
        }
      } finally {
        // Back off (max 10s) while the backend is unreachable; recover
        // instantly once a poll succeeds (customer_tutorial.html ~7170).
        if (!cancelled) {
          const delay = failures ? Math.min(POLL_MS * (failures + 1), MAX_BACKOFF_MS) : POLL_MS;
          timer = setTimeout(() => poll(datasetIdForPoll), delay);
        }
      }
    }

    poll(id);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [datasetId, cogniInstance]);

  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((e) => {
      if ((e.kind || "search") !== "search") return;
      e.node_ids?.forEach((id) => ids.add(id));
    });
    return ids;
  }, [events]);

  return {
    events,
    live: current ? recorded.live : true,
    usageReady: current && recorded.usageReady,
    usage,
    latestSearchEvent: current ? recorded.latestSearchEvent : null,
    consumeLatestSearchEvent: () => setRecorded((prev) => ({ ...prev, latestSearchEvent: null })),
    answeredIds,
  };
}
