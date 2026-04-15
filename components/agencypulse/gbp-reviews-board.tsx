"use client";

import { Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { GbpReviewRow } from "@/types/database.types";

function StarRating({ value }: { value: number }) {
  const v = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5 shrink-0",
            i < v ? "fill-amber-400 text-amber-400" : "fill-zinc-800 text-zinc-600",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

type Props = {
  initialReviews: GbpReviewRow[];
  clientNameById: Record<string, string>;
};

export function GbpReviewsBoard({ initialReviews, clientNameById }: Props) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<GbpReviewRow | null>(null);
  const [posting, setPosting] = useState(false);

  const sorted = useMemo(
    () =>
      [...initialReviews].sort((a, b) => {
        const ta = a.review_timestamp ?? "";
        const tb = b.review_timestamp ?? "";
        return tb.localeCompare(ta);
      }),
    [initialReviews],
  );

  const openReply = useCallback((r: GbpReviewRow) => {
    setActive(r);
    setDraft(r.reply_text?.trim() ?? "");
    setReplyOpen(true);
  }, []);

  const submitReply = useCallback(async () => {
    if (!active) return;
    const text = draft.trim();
    if (text.length < 2) {
      toast.error("Write a reply first.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/gbp-reviews/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gbp_review_id: active.id, reply_text: text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reply failed.");
      toast.success("Reply posted to Google.");
      setReplyOpen(false);
      setActive(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply failed.");
    } finally {
      setPosting(false);
    }
  }, [active, draft, router]);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-900/80">
              <TableHead className="text-zinc-500">Client</TableHead>
              <TableHead className="text-zinc-500">Rating</TableHead>
              <TableHead className="min-w-[180px] text-zinc-500">Reviewer</TableHead>
              <TableHead className="min-w-[220px] text-zinc-500">Review</TableHead>
              <TableHead className="min-w-[160px] text-zinc-500">Reply</TableHead>
              <TableHead className="text-right text-zinc-500"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={6} className="py-12 text-center text-sm text-zinc-500">
                  No reviews synced yet. Set <code className="text-zinc-400">gbp_location_id</code> on clients and run{" "}
                  <code className="text-zinc-400">npm run sync:gbp-reviews</code>.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const name = clientNameById[r.client_id] ?? r.client_id;
                const critical = r.star_rating <= 3 && !r.is_replied;
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "border-zinc-800 hover:bg-zinc-950/50",
                      critical && "bg-red-950/20",
                    )}
                  >
                    <TableCell className="align-top">
                      <Link
                        href={`/dashboard/clients/${r.client_id}`}
                        className="text-sky-400/90 text-sm font-medium hover:text-sky-300 hover:underline"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <StarRating value={r.star_rating} />
                    </TableCell>
                    <TableCell className="align-top text-sm text-zinc-300">{r.reviewer_name}</TableCell>
                    <TableCell className="align-top text-xs leading-relaxed text-zinc-400">
                      {r.comment?.trim() ? (
                        <span className="whitespace-pre-wrap">{r.comment.trim()}</span>
                      ) : (
                        <span className="text-zinc-500 italic">Rating only</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top text-xs text-zinc-500">
                      {r.reply_text?.trim() ? (
                        <span className="line-clamp-4 whitespace-pre-wrap">{r.reply_text.trim()}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {!r.is_replied ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-zinc-600 text-[11px] text-zinc-100"
                          onClick={() => openReply(r)}
                        >
                          Reply
                        </Button>
                      ) : (
                        <span className="text-emerald-500/90 text-[10px] font-medium uppercase">Done</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-900 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Reply on Google</DialogTitle>
            <p className="text-zinc-500 text-xs">Posts a public reply via Google Business Profile.</p>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
            placeholder="Thank you for your feedback…"
          />
          <DialogFooter>
            <Button type="button" variant="outline" className="border-zinc-600" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-sky-600 text-white hover:bg-sky-500"
              disabled={posting}
              onClick={() => void submitReply()}
            >
              {posting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Posting…
                </>
              ) : (
                "Post reply"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
