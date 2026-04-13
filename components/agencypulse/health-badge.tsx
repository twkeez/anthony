import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/types/client";

const styles: Record<
  HealthStatus,
  { label: string; className: string }
> = {
  green: {
    label: "Green",
    className:
      "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20",
  },
  yellow: {
    label: "Yellow",
    className:
      "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20",
  },
  red: {
    label: "Red",
    className: "border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/20",
  },
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const s = styles[status];
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}
