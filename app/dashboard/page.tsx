import { AgencyWorkspaceHero } from "@/components/agencypulse/agency-workspace-hero";
import { DashboardClientGrid } from "@/components/agencypulse/dashboard-client-grid";
import { fetchDashboardClients } from "@/lib/data/clients";
import type { ClientWithSyncSnapshot } from "@/lib/dashboard/client-status";

type Search = Record<string, string | string[] | undefined>;

function first(param: string | string[] | undefined) {
  if (Array.isArray(param)) return param[0];
  return param;
}

export default async function DashboardPage(props: { searchParams?: Promise<Search> }) {
  const searchParams = (await props.searchParams) ?? {};
  const googleError = first(searchParams.google_error);
  const googleConnected = first(searchParams.google_connected);
  const qRaw = first(searchParams.q);

  let clients: ClientWithSyncSnapshot[] = [];
  let loadError: string | null = null;

  try {
    clients = await fetchDashboardClients();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load clients.";
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
      <AgencyWorkspaceHero tagline="selection grid · traffic-light sync status · open a card for tasks, ids, and metrics" />

      {googleConnected ? (
        <p className="text-emerald-400 text-sm font-bold lowercase">
          Google account connected — tokens stored for the agency MCC flow.
        </p>
      ) : null}
      {googleError ? (
        <p className="text-red-400 text-sm font-bold lowercase">
          Google OAuth: {decodeURIComponent(googleError.replace(/\+/g, " "))}
        </p>
      ) : null}
      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-zinc-900 p-6 shadow-sm">
          <h2 className="text-lg font-black lowercase text-zinc-50">Database connection</h2>
          <p className="mt-2 text-sm font-bold lowercase text-zinc-400">
            {loadError} — confirm `.env.local` and that the `clients` table exists with data.
          </p>
        </div>
      ) : null}

      {!loadError && clients.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-sm">
          <p className="text-sm font-bold lowercase text-zinc-500">
            No rows yet. Run{" "}
            <code className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs normal-case text-zinc-300">
              npm run import:clients
            </code>{" "}
            after applying the Supabase migration.
          </p>
        </div>
      ) : null}

      {!loadError && clients.length > 0 ? (
        <DashboardClientGrid clients={clients} initialQuery={(qRaw ?? "").trim()} />
      ) : null}
    </div>
  );
}
