import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDummyHealthStatus } from "@/lib/health-status";
import type { ClientRow } from "@/types/client";

import { HealthBadge } from "./health-badge";

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Business</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="text-right">Hours / mo</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Services</TableHead>
          <TableHead>Website</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead>Group</TableHead>
          <TableHead>Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((c) => {
          const health = getDummyHealthStatus(c);
          return (
            <TableRow key={c.id}>
              <TableCell className="max-w-[200px] font-medium whitespace-normal">
                <Link
                  className="text-sky-400 hover:text-sky-300 hover:underline"
                  href={`/dashboard/clients/${c.id}`}
                >
                  {c.business_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {c.team_member ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.monthly_hours ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">{c.service_tier ?? "—"}</TableCell>
              <TableCell className="max-w-[160px] text-muted-foreground whitespace-normal">
                {c.services?.trim() ? c.services : "—"}
              </TableCell>
              <TableCell className="max-w-[180px] text-muted-foreground">
                {c.website ? (
                  <a
                    href={
                      c.website.startsWith("http") ? c.website : `https://${c.website}`
                    }
                    className="text-primary underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.website}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-[140px] text-muted-foreground whitespace-normal">
                {c.location ?? "—"}
              </TableCell>
              <TableCell className="max-w-[120px] whitespace-normal">
                {c.primary_contact ?? "—"}
              </TableCell>
              <TableCell className="max-w-[220px] text-muted-foreground whitespace-normal text-xs">
                {c.client_vibe_notes ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">{c.account_group ?? "—"}</TableCell>
              <TableCell>
                <HealthBadge status={health} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
