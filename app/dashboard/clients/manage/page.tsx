import { ClientImportManager } from "@/components/agencypulse/client-import-manager";

export default function ClientManagementPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">agencypulse</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Client management</h1>
        <p className="text-zinc-500 max-w-2xl text-sm">
          Bulk onboard or update clients from a CSV. Rows match an existing client when{" "}
          <code className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-xs text-zinc-300">
            internal_crm_id
          </code>{" "}
          matches (if provided in the sheet) or when{" "}
          <code className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-xs text-zinc-300">
            client_name
          </code>{" "}
          equals{" "}
          <code className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-xs text-zinc-300">
            business_name
          </code>{" "}
          case-insensitively. Only columns with a value in the CSV are written on update; blank cells preserve what is
          already in the database.
        </p>
      </div>

      <ClientImportManager />
    </div>
  );
}
