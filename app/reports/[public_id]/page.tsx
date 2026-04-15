import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fetchClientById } from "@/lib/data/clients";
import { fetchPublishedReportByPublicId } from "@/lib/data/reports";

type Props = { params: Promise<{ public_id: string }> };

export const metadata: Metadata = {
  title: "AgencyPulse report",
  description: "Client performance report",
};

export default async function PublicReportPage({ params }: Props) {
  const { public_id } = await params;
  const report = await fetchPublishedReportByPublicId(public_id);
  if (!report) notFound();
  const client = await fetchClientById(report.client_id);

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900 print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 border-b border-neutral-300 pb-6">
          <p className="text-xs tracking-[0.2em] text-neutral-500 uppercase">AgencyPulse</p>
          <h1 className="mt-2 text-3xl font-semibold">{client?.business_name ?? "Client"} Performance Report</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Period: {report.period_start} to {report.period_end}
          </p>
        </header>

        <section className="space-y-8">
          {report.blocks.map((b) => (
            <article key={b.id} className="break-inside-avoid">
              <h2 className="mb-2 text-xl font-semibold">{b.title}</h2>
              <div className="text-sm leading-7 whitespace-pre-wrap text-neutral-800">{b.content}</div>
            </article>
          ))}
        </section>

        {report.strategist_notes?.trim() ? (
          <section className="mt-10 border-t border-neutral-300 pt-6 break-inside-avoid">
            <h2 className="mb-2 text-lg font-semibold">Strategist Notes</h2>
            <p className="text-sm leading-7 whitespace-pre-wrap text-neutral-800">{report.strategist_notes.trim()}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
