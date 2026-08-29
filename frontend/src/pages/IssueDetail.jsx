import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ThumbsUp, Share2, MapPin, Clock, Send, Check, MessageSquare, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { fetchIssue, confirmIssue, addComment, buildPhotoUrl } from "@/lib/api";
import { categoryOf, TIMELINE_STEPS } from "@/lib/constants";
import { StatusPill } from "@/components/StatusPill";
import { timeAgo } from "@/lib/geo";
import { useAuth } from "@/context/AuthContext";

export default function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, openLogin } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: issue, refetch, isLoading } = useQuery({ queryKey: ["issue", id], queryFn: () => fetchIssue(id) });

  if (isLoading || !issue) {
    return <div className="flex h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#6b6b70]" /></div>;
  }

  const cat = categoryOf(issue.category);

  const onConfirm = async () => {
    if (!user) { openLogin(); return; }
    setConfirming(true);
    try {
      const res = await confirmIssue(issue.id);
      if (res.already) toast(t("detail.alreadyConfirmed")); else toast.success(t("detail.confirmThanks"));
      await refetch();
    } catch (e) { if (e.response?.status === 401) openLogin(); }
    setConfirming(false);
  };

  const onShare = async () => {
    const url = `${window.location.origin}/issue/${issue.id}`;
    try {
      if (navigator.share) await navigator.share({ title: t("app.name"), url });
      else { await navigator.clipboard.writeText(url); toast.success(t("detail.linkCopied")); }
    } catch (e) { /* cancelled */ }
  };

  const postComment = async () => {
    if (!user) { openLogin(); return; }
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      await addComment(issue.id, commentText);
      setCommentText(""); await refetch();
    } catch (e) { if (e.response?.status === 401) openLogin(); }
    setPosting(false);
  };

  const reachedIndex = (() => {
    let max = 0;
    issue.timeline.forEach((tl) => { const i = TIMELINE_STEPS.findIndex((s) => s.key === tl.status); if (i > max) max = i; });
    return max;
  })();
  const timelineTs = {};
  issue.timeline.forEach((tl) => { timelineTs[tl.status] = tl.created_at; });

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-[#f6f5f1] pb-32">
      <div className="relative h-72 w-full">
        <img src={buildPhotoUrl(issue.photo_path)} alt={t(`categories.${issue.category}`, cat.label)} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <button data-testid="detail-back-btn" onClick={() => navigate("/")} className="absolute left-4 top-[max(env(safe-area-inset-top),14px)] flex h-11 w-11 items-center justify-center rounded-full bg-white/95 backdrop-blur-xl shadow-md"><ArrowLeft className="h-5 w-5" /></button>
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <StatusPill status={issue.status} className="bg-white/95" />
          <span className="rounded-full bg-black/40 px-3 py-1 font-mono-tech text-xs text-white backdrop-blur">#{issue.short_id}</span>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}>{t(`categories.${issue.category}`, cat.label)}</span>
          <span className="flex items-center gap-1 text-xs text-[#6b6b70]"><Clock className="h-3.5 w-3.5" /> {timeAgo(issue.created_at)}</span>
        </div>

        {issue.flagged_ai_generated && (
          <div data-testid="ai-flagged-banner" className="mt-3 flex items-center gap-2 rounded-xl bg-[#fbeee2] p-3 text-xs font-semibold text-[#b06a2c]"><ShieldAlert className="h-4 w-4" /> {t("detail.aiFlagged")}</div>
        )}

        <p className="mt-3 text-base leading-relaxed text-[#2a2a2c]">{issue.description || t("detail.noDescription")}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e6e3dc] bg-white p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#1f7a72]" />
          <p className="text-sm leading-relaxed text-[#4a4a4d]">{issue.address_text}</p>
        </div>

        <div className="mt-4 flex gap-3">
          <button data-testid="confirm-issue-btn" onClick={onConfirm} disabled={confirming} className="fx-btn fx-btn-primary flex-1"><ThumbsUp className="h-4 w-4" /> {t("detail.confirm")} · {issue.confirm_count}</button>
          <button data-testid="share-issue-btn" onClick={onShare} className="fx-btn fx-btn-secondary px-5"><Share2 className="h-4 w-4" /> {t("detail.share")}</button>
        </div>
        {issue.confirm_count > 0 && <p className="mt-2 text-center text-xs text-[#6b6b70]">{t("detail.confirmed", { count: issue.confirm_count })}</p>}

        <h3 className="mt-8 font-heading text-lg font-bold">{t("detail.statusTimeline")}</h3>
        <div className="mt-3 rounded-2xl border border-[#e6e3dc] bg-white p-5">
          {TIMELINE_STEPS.map((step, i) => {
            const done = i <= reachedIndex;
            return (
              <div key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: done ? "#1f7a72" : "#e6e3dc", color: "#fff" }}>{done && <Check className="h-3.5 w-3.5" />}</div>
                  {i < TIMELINE_STEPS.length - 1 && <div className="my-1 w-0.5 flex-1" style={{ minHeight: 24, backgroundColor: i < reachedIndex ? "#1f7a72" : "#e6e3dc" }} />}
                </div>
                <div className="pb-4">
                  <p className={`text-sm font-semibold ${done ? "text-[#2a2a2c]" : "text-[#a9a9ae]"}`}>{t(`timeline.${step.key}`)}</p>
                  {timelineTs[step.key] && <p className="font-mono-tech text-[11px] text-[#6b6b70]">{new Date(timelineTs[step.key]).toLocaleString()}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="mt-8 flex items-center gap-2 font-heading text-lg font-bold"><MessageSquare className="h-5 w-5" /> {t("detail.comments", { count: issue.comments.length })}</h3>
        <div className="mt-3 space-y-2">
          {issue.comments.length === 0 && <p className="text-sm text-[#6b6b70]">{t("detail.beFirst")}</p>}
          {issue.comments.map((c) => (
            <div key={c.id} data-testid={`comment-${c.id}`} className="rounded-xl border border-[#e6e3dc] bg-white p-3.5">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">{c.user_name}</span><span className="text-[11px] text-[#6b6b70]">{timeAgo(c.created_at)}</span></div>
              <p className="mt-1 text-sm leading-relaxed text-[#4a4a4d]">{c.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input data-testid="comment-input" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postComment()} placeholder={t("detail.addComment")} className="fx-input flex-1 px-4 py-3 text-sm" />
          <button data-testid="post-comment-btn" onClick={postComment} disabled={posting || !commentText.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1f7a72] text-white disabled:opacity-40">{posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </div>
      </div>
    </div>
  );
}
