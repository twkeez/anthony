"use client";

import { Loader2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  clientId: string;
  businessName: string;
  reviews: GbpReviewRow[];
  hasGbpLocation: boolean;
};

export function CommunicationGbpReviews({ clientId, businessName, reviews, hasGbpLocation }: Props) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<GbpReviewRow | null>(null);
  const [posting, setPosting] = useState(false);

  const openReply = useCallback((r: GbpReviewRow) => {
    setActive(r);
    setDraft(r.reply_text?.trim() ?? "");
    setReplyOpen(true);
  }, []);

  const submitReply = useCallback(async () => {
    if (!active) return;
    const text = draft.trim();
    if (!text) {
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

  if (!hasGbpLocation && reviews.length === 0) return null;

  return (
    <>
      <div className="border-t border-zinc-800/80 px-4 py-4 sm:px-5 lg:border-t-0 lg:border-l-0">
        <p className="text-zinc-500 mb-3 text-[10px] font-semibold uppercase tracking-wide">Google reviews</p>
        {!hasGbpLocation ? (
          <p className="text-zinc-500 text-xs">
            Add a <span className="font-mono text-zinc-400">gbp_location_id</span> on the client to sync reviews.
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-zinc-500 text-xs">
            No reviews in Anthony yet — run <span className="font-mono text-zinc-400">npm run sync:gbp-reviews</span>.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3",
                  r.star_rating <= 3 && !r.is_replied && "border-red-500/35 bg-red-950/15",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating value={r.star_rating} />
                    <span className="text-zinc-300 text-xs font-medium">{r.reviewer_name}</span>
                    {r.review_timestamp ? (
                      <span className="text-zinc-500 text-[10px] tabular-nums">
                        {new Date(r.review_timestamp).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                  {!r.is_replied ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-zinc-600 text-[11px] text-zinc-100"
                      onClick={() => openReply(r)}
                    >
                      Reply
                    </Button>
                  ) : (
                    <span className="text-emerald-500/90 text-[10px] font-medium uppercase tracking-wide">Replied</span>
                  )}
                </div>
                <p className="text-zinc-400 mt-2 text-xs leading-relaxed">
                  {r.comment?.trim() ? r.comment.trim() : <span className="text-zinc-500 italic">Rating only</span>}
                </p>
                {r.reply_text?.trim() ? (
                  <p className="text-zinc-500 mt-2 border-l-2 border-zinc-700 pl-2 text-[11px] leading-snug">
                    {r.reply_text.trim()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-900 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Reply on Google</DialogTitle>
            <p className="text-zinc-500 text-xs">
              Draft a public reply for <span className="text-zinc-300">{businessName}</span>. This posts via Google
              Business Profile.
            </p>
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
