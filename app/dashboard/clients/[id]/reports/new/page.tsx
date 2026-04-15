import { notFound } from "next/navigation";

import { ReportBuilder } from "@/components/agencypulse/report-builder";
import { fetchClientById } from "@/lib/data/clients";
import { fetchReportData } from "@/lib/reports/fetch-report-data";
import type { ReportBlock } from "@/types/database.types";

type Props = { params: Promise<{ id: string }> };

function firstDayOfMonthIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function todayIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

export default async function NewClientReportPage({ params }: Props) {
  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  const periodStart = firstDayOfMonthIso();
  const periodEnd = todayIso();
  const data = await fetchReportData(id, periodStart, periodEnd);

  const goalLines = data.goals
    .filter((g) => g.goal.status === "active")
    .map((g) => `- ${g.goal.intent_statement} → ${g.metThisMonth ? "MET" : "in progress"}`)
    .join("\n");

  const blocks: ReportBlock[] = [
    {
      id: crypto.randomUUID(),
      type: "summary",
      title: "Summary",
      content: [
        `${client.business_name} report for ${periodStart} to ${periodEnd}.`,
        `Ads spend ${data.ads.spend.toFixed(2)}, conversions ${Math.round(data.ads.conversions)}.`,
        `GA4 sessions ${Math.round(data.ga4.sessions)}, key events ${Math.round(data.ga4.keyEvents)}.`,
      ].join("\n"),
    },
    {
      id: crypto.randomUUID(),
      type: "ads",
      title: "Ads",
      content: `Spend: $${data.ads.spend.toFixed(2)}\nConversions: ${Math.round(data.ads.conversions)}\nClicks: ${Math.round(data.ads.clicks)}\nImpressions: ${Math.round(data.ads.impressions)}`,
    },
    {
      id: crypto.randomUUID(),
      type: "analytics",
      title: "Analytics",
      content: `Sessions: ${Math.round(data.ga4.sessions)}\nKey events: ${Math.round(data.ga4.keyEvents)}\nAvg engagement rate: ${
        data.ga4.avgEngagementRate != null ? `${(data.ga4.avgEngagementRate * 100).toFixed(1)}%` : "—"
      }`,
    },
    {
      id: crypto.randomUUID(),
      type: "local",
      title: "Local",
      content: `GBP reviews in period: ${data.gbp.reviewCount}\nReplied: ${data.gbp.repliedCount}\nLow-star unreplied: ${data.gbp.lowStarUnreplied}`,
    },
    {
      id: crypto.randomUUID(),
      type: "basecamp",
      title: "Basecamp",
      content: `Unanswered threads: ${data.basecamp.unansweredCount}\nLatest threads:\n${data.basecamp.latestThreads
        .slice(0, 5)
        .map((t) => `- ${t.subject} (${t.updatedAt.slice(0, 10)})`)
        .join("\n")}`,
    },
  ];

  if (goalLines) {
    blocks.unshift({
      id: crypto.randomUUID(),
      type: "summary",
      title: "Goal Highlights",
      content: `Active goals and this-month status:\n${goalLines}`,
    });
  }

  return (
    <ReportBuilder
      clientId={id}
      businessName={client.business_name}
      initialPeriodStart={periodStart}
      initialPeriodEnd={periodEnd}
      initialBlocks={blocks}
    />
  );
}
