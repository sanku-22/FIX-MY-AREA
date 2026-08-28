import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ThumbsUp, Share2, MapPin, Clock, Send, Check, MessageSquare, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchIssue, confirmIssue, addComment, buildPhotoUrl } from "@/lib/api";
import { categoryOf, TIMELINE_STEPS } from "@/lib/constants";
import { StatusPill } from "@/components/StatusPill";
import { timeAgo } from "@/lib/geo";
import { getDeviceId } from "@/lib/device";

export default function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: issue, refetch, isLoading } = useQuery({
    queryKey: ["issue", id],
    queryFn: () => fetchIssue(id),
  });

  if (isLoading || !issue) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717a]" />
      </div>
    );
  }

  const cat = categoryOf(issue.category);

  const onConfirm = async () => {
    setConfirming(true);
    const res = await confirmIssue(issue.id, getDeviceId());
    if (res.already) toast("You already confirmed this issue.");
    else toast.success("Thanks! You confirmed this issue.");
    await refetch();
    setConfirming(false);
  };

  const onShare = async () => {
    const url = `${window.location.origin}/issue/${issue.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "CivicFix issue", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch (e) {
      /* cancelled */
    }
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    await addComment(issue.id, { text: commentText, user_id: getDeviceId(), user_name: "Anonymous" });
    setCommentText("");
    await refetch();
    setPosting(false);
  };

  const reachedIndex = (() => {
    let max = 0;
    issue.timeline.forEach((t) => {
      const i = TIMELINE_STEPS.findIndex((s) => s.key === t.status);
      if (i > max) max = i;
    });
    return max;
  })();

  const timelineTs = {};
  issue.timeline.forEach((t) => { timelineTs[t.status] = t.created_at; });

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-[#f4f4f5] pb-32">
      {/* Hero */}
      <div className="relative h-72 w-full">
        <img src={buildPhotoUrl(issue.photo_path)} alt={cat.label} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <button
          data-testid="detail-back-btn"
          onClick={() => navigate("/")}
          className="absolute left-4 top-[max(env(safe-area-inset-top),14px)] flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-xl shadow-md"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <StatusPill status={issue.status} className="bg-white/90" />
          <span className="rounded-full bg-black/40 px-3 py-1 font-mono-tech text-xs text-white backdrop-blur">#{issue.short_id}</span>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}
          >
            {cat.label}
          </span>
          <span className="flex items-center gap-1 text-xs text-[#71717a]">
            <Clock className="h-3.5 w-3.5" /> {timeAgo(issue.created_at)}
          </span>
        </div>

        <p className="mt-3 text-base leading-relaxed text-[#09090b]">
          {issue.description || "No description provided."}
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-white p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#71717a]" />
          <p className="text-sm leading-relaxed text-[#3f3f46]">{issue.address_text}</p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button
            data-testid="confirm-issue-btn"
            onClick={onConfirm}
            disabled={confirming}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#09090b] py-3.5 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
          >
            <ThumbsUp className="h-4 w-4" /> Confirm · {issue.confirm_count}
          </button>
          <button
            data-testid="share-issue-btn"
            onClick={onShare}
            className="flex items-center justify-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-5 py-3.5 text-sm font-semibold"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
        {issue.confirm_count > 0 && (
          <p className="mt-2 text-center text-xs text-[#71717a]">
            {issue.confirm_count} {issue.confirm_count === 1 ? "person has" : "people have"} confirmed this is still an issue
          </p>
        )}

        {/* Timeline */}
        <h3 className="mt-7 font-heading text-lg font-semibold">Status timeline</h3>
        <div className="mt-3 rounded-xl bg-white p-5">
          {TIMELINE_STEPS.map((step, i) => {
            const done = i <= reachedIndex;
            return (
              <div key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: done ? "#09090b" : "#e4e4e7", color: "#fff" }}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className="my-1 w-0.5 flex-1" style={{ minHeight: 24, backgroundColor: i < reachedIndex ? "#09090b" : "#e4e4e7" }} />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-sm font-semibold ${done ? "text-[#09090b]" : "text-[#a1a1aa]"}`}>{step.label}</p>
                  {timelineTs[step.key] && (
                    <p className="font-mono-tech text-[11px] text-[#71717a]">{new Date(timelineTs[step.key]).toLocaleString()}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comments */}
        <h3 className="mt-7 flex items-center gap-2 font-heading text-lg font-semibold">
          <MessageSquare className="h-5 w-5" /> Comments ({issue.comments.length})
        </h3>
        <div className="mt-3 space-y-2">
          {issue.comments.length === 0 && (
            <p className="text-sm text-[#71717a]">Be the first to comment.</p>
          )}
          {issue.comments.map((c) => (
            <div key={c.id} data-testid={`comment-${c.id}`} className="rounded-xl bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{c.user_name}</span>
                <span className="text-[11px] text-[#71717a]">{timeAgo(c.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-[#3f3f46]">{c.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            data-testid="comment-input"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && postComment()}
            placeholder="Add a comment…"
            className="flex-1 rounded-full bg-white px-4 py-3 text-sm outline-none ring-black focus:ring-2"
          />
          <button
            data-testid="post-comment-btn"
            onClick={postComment}
            disabled={posting || !commentText.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#09090b] text-white disabled:opacity-40"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
