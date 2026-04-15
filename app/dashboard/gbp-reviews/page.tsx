import type { Metadata } from "next";

import { GbpReviewsBoard } from "@/components/agencypulse/gbp-reviews-board";
import { fetchAllClients } from "@/lib/data/clients";
import { fetchGbpReviewsForDashboard } from "@/lib/data/gbp-reviews";

export const metadata: Metadata = {
  title: "anthony · Google Business Profile reviews",
  description: "Synced Google reviews per client — triage low-star unreplied from Communication.",
};

export default async function GbpReviewsPage() {
  const [reviews, clients] = await Promise.all([fetchGbpReviewsForDashboard(), fetchAllClients()]);
  const clientNameById: Record<string, string> = {};
  for (const c of clients) {
    clientNameById[c.id] = c.business_name;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Google Business Profile reviews</h1>
        <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
          Reviews are synced into <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">gbp_reviews</code>{" "}
          via <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">npm run sync:gbp-reviews</code>.
          Low-star (1–3) unreplied reviews also surface as{" "}
          <span className="text-red-400/90">red</span> on the Communication command center.
        </p>
      </div>
      <GbpReviewsBoard initialReviews={reviews} clientNameById={clientNameById} />
    </div>
  );
}
