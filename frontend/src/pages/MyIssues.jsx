import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Inbox } from "lucide-react";
import { fetchIssues } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import IssueCard from "@/components/IssueCard";
import TopControls from "@/components/TopControls";

export default function MyIssues() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [asc, setAsc] = useState(false);

  const { data: issues = [] } = useQuery({ queryKey: ["my-issues"], queryFn: () => fetchIssues({ reporter_id: getDeviceId() }) });

  const sorted = [...issues].sort((a, b) => { const d = new Date(a.created_at) - new Date(b.created_at); return asc ? d : -d; });

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-[#f4f4f5] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e4e4e7] bg-[#f4f4f5]/90 px-5 pb-4 pt-[max(env(safe-area-inset-top),18px)] backdrop-blur-xl">
        <div className="flex items-start justify-between">
          <h1 className="font-heading text-3xl font-black tracking-tighter">{t("myIssues.title")}</h1>
          <TopControls compact />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-[#71717a]">{t("myIssues.reportsSubmitted", { count: issues.length })}</p>
          <button data-testid="sort-toggle-btn" onClick={() => setAsc((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-white px-3 py-1.5 text-xs font-semibold">
            <ArrowUpDown className="h-3.5 w-3.5" /> {asc ? t("myIssues.oldest") : t("myIssues.newest")}
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <Inbox className="h-10 w-10 text-[#a1a1aa]" />
            <p className="text-sm text-[#71717a]">{t("myIssues.empty")}</p>
          </div>
        )}
        {sorted.map((issue, idx) => (
          <IssueCard key={issue.id} issue={issue} index={idx} onClick={() => navigate(`/issue/${issue.id}`)} />
        ))}
      </div>
    </div>
  );
}
