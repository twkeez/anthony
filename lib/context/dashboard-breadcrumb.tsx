"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  clientSegmentLabel: string | null;
  setClientSegmentLabel: (v: string | null) => void;
};

const DashboardBreadcrumbContext = createContext<Ctx | undefined>(undefined);

export function DashboardBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [clientSegmentLabel, setClientSegmentLabelState] = useState<string | null>(null);
  const setClientSegmentLabel = useCallback((v: string | null) => {
    setClientSegmentLabelState(v);
  }, []);

  const value = useMemo(
    () => ({ clientSegmentLabel, setClientSegmentLabel }),
    [clientSegmentLabel, setClientSegmentLabel],
  );

  return (
    <DashboardBreadcrumbContext.Provider value={value}>{children}</DashboardBreadcrumbContext.Provider>
  );
}

export function useDashboardBreadcrumb() {
  const c = useContext(DashboardBreadcrumbContext);
  if (!c) {
    throw new Error("useDashboardBreadcrumb must be used within DashboardBreadcrumbProvider");
  }
  return c;
}

/** Registers the current client name for header breadcrumbs; clears on unmount. */
export function ClientBreadcrumbSetter({ name, children }: { name: string; children: ReactNode }) {
  const { setClientSegmentLabel } = useDashboardBreadcrumb();
  useEffect(() => {
    setClientSegmentLabel(name);
    return () => setClientSegmentLabel(null);
  }, [name, setClientSegmentLabel]);
  return <>{children}</>;
}
