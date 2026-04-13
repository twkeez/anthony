"use client";

import Papa from "papaparse";
import { useCallback, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  rawRecordToImportRow,
  rowHasBlockingIssues,
  rowHasCrmOnlyWarning,
  rowHasPpcMissingAdsWarning,
  type ClientImportPreviewRow,
} from "@/lib/client-import/schema";
import { cn } from "@/lib/utils";

function parseCsvFile(file: File, onComplete: (rows: ClientImportPreviewRow[]) => void, onError: (msg: string) => void) {
  Papa.parse<Record<string, unknown>>(file, {
    header: true,
    skipEmptyLines: "greedy",
    complete: (res) => {
      if (res.errors.length) {
        onError(res.errors.map((e) => e.message).join("; "));
        return;
      }
      const rows = (res.data ?? []).map((row, i) => rawRecordToImportRow(row, i + 2));
      onComplete(rows);
    },
    error: (err) => onError(err.message),
  });
}

export function ClientImportManager() {
  const [preview, setPreview] = useState<ClientImportPreviewRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updateExistingOnly, setUpdateExistingOnly] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    summary: Record<string, number>;
    results: Array<{ rowIndex: number; status: string; error?: string }>;
  } | null>(null);

  const loadFile = useCallback((file: File | null) => {
    setParseError(null);
    setImportError(null);
    setPreview(null);
    setSubmitResult(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      setParseError("Please upload a .csv file.");
      return;
    }
    parseCsvFile(
      file,
      (rows) => setPreview(rows),
      (msg) => setParseError(msg),
    );
  }, []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      loadFile(e.target.files?.[0] ?? null);
      e.target.value = "";
    },
    [loadFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      loadFile(file);
    },
    [loadFile],
  );

  async function submitImport() {
    if (!preview?.length) return;
    setSubmitting(true);
    setSubmitResult(null);
    setImportError(null);
    try {
      const res = await fetch("/api/clients/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview, update_only: updateExistingOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      setSubmitResult({
        summary: data.summary ?? {},
        results: data.results ?? [],
      });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const blockingCount = preview?.filter(rowHasBlockingIssues).length ?? 0;
  const ppcWarnCount = preview?.filter(rowHasPpcMissingAdsWarning).length ?? 0;
  const crmOnlyWarnCount = preview?.filter(rowHasCrmOnlyWarning).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Import clients from CSV</CardTitle>
          <CardDescription>
            Export a sheet from Excel or Google Sheets as <strong>.csv</strong> (UTF-8). One row per client. Existing
            clients match on <code className="text-xs">internal_crm_id</code> first, then{" "}
            <code className="text-xs">client_name</code> / <code className="text-xs">business_name</code>{" "}
            (case-insensitive). Empty cells leave existing values unchanged — so you can upload a file with only Ads and
            GA4 columns filled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/client_import_template.csv"
              download="client_import_template.csv"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
            >
              Full template
            </a>
            <a
              href="/client_integration_ids_template.csv"
              download="client_integration_ids_template.csv"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
            >
              Ads + GA4 only
            </a>
            <label className="inline-flex cursor-pointer">
              <span className={cn(buttonVariants({ variant: "secondary" }), "pointer-events-none")}>
                Choose CSV file
              </span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFileInput} />
            </label>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget.querySelector("input[type=file]") as HTMLInputElement | null)?.click();
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "border-input bg-muted/30 flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
              dragActive && "border-primary bg-primary/5 ring-primary/30 ring-2",
            )}
            onClick={() => document.getElementById("client-csv-drop-input")?.click()}
          >
            <input
              id="client-csv-drop-input"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={onFileInput}
            />
            <p className="text-sm font-medium">Drag and drop your CSV here</p>
            <p className="text-muted-foreground text-xs">or click to browse · .csv only</p>
          </div>

          {parseError && !preview ? <p className="text-destructive text-sm">{parseError}</p> : null}
          {importError ? <p className="text-destructive text-sm">{importError}</p> : null}
        </CardContent>
      </Card>

      {preview && preview.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Review import</CardTitle>
              <CardDescription>
                {preview.length} row(s).{" "}
                {blockingCount > 0 ? (
                  <span className="text-destructive">{blockingCount} blocking issue(s). </span>
                ) : null}
                {ppcWarnCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {ppcWarnCount} row(s) with PPC enabled but no Google Ads ID (highlighted).{" "}
                  </span>
                ) : null}
                {crmOnlyWarnCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {crmOnlyWarnCount} row(s) use CRM ID only (no client name) — safe for updates; new clients need a
                    name.{" "}
                  </span>
                ) : null}
                {ppcWarnCount === 0 && crmOnlyWarnCount === 0 ? "No PPC / Ads ID warnings." : null}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex max-w-sm items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 p-3 text-left text-xs text-zinc-400">
                <Checkbox
                  id="update-existing-only"
                  checked={updateExistingOnly}
                  onCheckedChange={(v) => setUpdateExistingOnly(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="update-existing-only" className="cursor-pointer font-normal leading-snug text-zinc-300">
                  Update existing clients only (never create new rows). Use this when bulk-adding Google Ads and GA4
                  IDs from a spreadsheet.
                </Label>
              </div>
            <Button
              type="button"
              onClick={submitImport}
              disabled={submitting || blockingCount > 0}
              title={blockingCount > 0 ? "Fix blocking issues before importing." : undefined}
            >
              {submitting ? "Importing…" : "Confirm import"}
            </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>CRM ID</TableHead>
                  <TableHead>PPC</TableHead>
                  <TableHead>SEO</TableHead>
                  <TableHead>Ads ID</TableHead>
                  <TableHead>GA4</TableHead>
                  <TableHead>SC URL</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row) => {
                  const blocking = rowHasBlockingIssues(row);
                  const ppcWarn = rowHasPpcMissingAdsWarning(row);
                  const crmWarn = rowHasCrmOnlyWarning(row);
                  return (
                    <TableRow
                      key={row.rowIndex}
                      className={cn(
                        blocking && "bg-destructive/15",
                        (ppcWarn || crmWarn) && !blocking && "bg-amber-500/12",
                      )}
                    >
                      <TableCell className="text-muted-foreground text-xs">{row.rowIndex}</TableCell>
                      <TableCell className="font-medium">{row.client_name || "—"}</TableCell>
                      <TableCell className="max-w-[120px] truncate font-mono text-xs">
                        {row.internal_crm_id ?? "—"}
                      </TableCell>
                      <TableCell>{row.service_ppc ? "Yes" : "No"}</TableCell>
                      <TableCell>{row.service_seo ? "Yes" : "No"}</TableCell>
                      <TableCell className="max-w-[120px] truncate font-mono text-xs">
                        {row.google_ads_id ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate font-mono text-xs">
                        {row.ga4_property_id ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {row.search_console_url ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.issues.length === 0 ? (
                          <span className="text-muted-foreground">OK</span>
                        ) : (
                          <ul className="text-muted-foreground list-inside list-disc space-y-0.5">
                            {row.issues.map((i) => (
                              <li key={i.code}>{i.message}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {submitResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Import result</CardTitle>
            <CardDescription>
              Inserted: {submitResult.summary.inserted ?? 0} · Updated: {submitResult.summary.updated ?? 0} · Skipped:{" "}
              {submitResult.summary.skipped ?? 0} · Errors: {submitResult.summary.errors ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitResult.results.some((r) => r.status === "error") ? (
              <ul className="text-destructive text-sm">
                {submitResult.results
                  .filter((r) => r.status === "error")
                  .map((r) => (
                    <li key={r.rowIndex}>
                      Row {r.rowIndex}: {r.error}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-emerald-600 text-sm dark:text-emerald-400">Import completed.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
