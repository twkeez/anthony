"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { postScopedSync, type ScopedSyncScope } from "@/lib/client/scoped-sync";

type DashboardSyncContextValue = {
  isSyncing: boolean;
  /** True after 45s while at least one scoped sync is still in flight. */
  isSlowSync: boolean;
  runScopedSync: (scope: ScopedSyncScope) => Promise<Response>;
};

const DashboardSyncContext = createContext<DashboardSyncContextValue | null>(null);

async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  const t = text.trim();
  if (!t) return `Sync failed (${res.status})`;
  try {
    const j = JSON.parse(t) as { message?: unknown; error?: unknown };
    const m = j.message ?? j.error;
    if (typeof m === "string" && m.trim() !== "") return m.trim();
  } catch {
    /* not JSON */
  }
  return t;
}

export function DashboardSyncProvider({ children }: { children: ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSlowSync, setIsSlowSync] = useState(false);
  const activeCountRef = useRef(0);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current != null) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setIsSlowSync(false);
  }, []);

  const runScopedSync = useCallback(
    async (scope: ScopedSyncScope): Promise<Response> => {
      activeCountRef.current += 1;
      if (activeCountRef.current === 1) {
        setIsSyncing(true);
        setIsSlowSync(false);
        slowTimerRef.current = setTimeout(() => setIsSlowSync(true), 45_000);
      }

      const finishOne = () => {
        activeCountRef.current -= 1;
        if (activeCountRef.current <= 0) {
          activeCountRef.current = 0;
          clearSlowTimer();
          setIsSyncing(false);
        }
      };

      try {
        const res = await postScopedSync(scope);
        if (!res.ok) {
          const msg = await errorMessageFromResponse(res);
          finishOne();
          toast.error(msg);
          return res;
        }
        finishOne();
        return res;
      } catch (e) {
        finishOne();
        const msg = e instanceof Error ? e.message : "Could not reach the sync API.";
        toast.error(msg);
        return new Response(JSON.stringify({ ok: false, message: msg }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    [clearSlowTimer],
  );

  useEffect(() => {
    return () => {
      if (slowTimerRef.current != null) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({ isSyncing, isSlowSync, runScopedSync }),
    [isSyncing, isSlowSync, runScopedSync],
  );

  return <DashboardSyncContext.Provider value={value}>{children}</DashboardSyncContext.Provider>;
}

export function useDashboardSync(): DashboardSyncContextValue {
  const ctx = useContext(DashboardSyncContext);
  if (!ctx) {
    throw new Error("useDashboardSync must be used within DashboardSyncProvider");
  }
  return ctx;
}
