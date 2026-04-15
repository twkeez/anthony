"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ThresholdRules } from "@/types/client";

const defaultRules: ThresholdRules = {
  flag_ads_spend_no_conversions: true,
  flag_zero_conversions_any_spend: true,
  min_performance_score: 50,
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [rules, setRules] = useState<ThresholdRules>(defaultRules);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load settings.");
        if (!cancelled && data.rules) setRules({ ...defaultRules, ...data.rules });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alert thresholds</DialogTitle>
          <DialogDescription>
            Global rules used when anthony evaluates client performance (wired to live data
            next). Toggle what should raise a flag in the dashboard.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="ads-spend"
                checked={rules.flag_ads_spend_no_conversions}
                onCheckedChange={(v) =>
                  setRules((r) => ({ ...r, flag_ads_spend_no_conversions: Boolean(v) }))
                }
              />
              <div className="grid gap-1">
                <Label htmlFor="ads-spend" className="font-normal leading-snug">
                  Flag if Google Ads spend &gt; $0 but conversions = 0
                </Label>
                <p className="text-muted-foreground text-xs">
                  Surfaces paid traffic that is not converting.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="zero-conv"
                checked={rules.flag_zero_conversions_any_spend}
                onCheckedChange={(v) =>
                  setRules((r) => ({ ...r, flag_zero_conversions_any_spend: Boolean(v) }))
                }
              />
              <div className="grid gap-1">
                <Label htmlFor="zero-conv" className="font-normal leading-snug">
                  Flag zero conversions whenever there is any ad spend
                </Label>
                <p className="text-muted-foreground text-xs">
                  Stricter than the rule above; useful for small-budget tests.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="psi">Minimum PageSpeed performance score</Label>
              <Input
                id="psi"
                type="number"
                min={0}
                max={100}
                value={rules.min_performance_score}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    min_performance_score: Number(e.target.value) || 0,
                  }))
                }
              />
              <p className="text-muted-foreground text-xs">
                Clients below this score can be highlighted when Lighthouse / CrUX data is
                connected.
              </p>
            </div>
          </div>
        )}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <p className="text-muted-foreground border-border text-sm border-t pt-3">
          <Link
            href="/dashboard/settings/team"
            className="text-primary font-medium underline-offset-4 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Manage team and AI voice profiles
          </Link>{" "}
          — staff roster and Basecamp matching for communication sync.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={loading || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
