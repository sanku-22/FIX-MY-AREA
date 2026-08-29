import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Inbox, LogIn } from "lucide-react";
import { fetchIssues } from "@/lib/api";
import IssueCard from "@/components/IssueCard";
import TopControls from "@/components/TopControls";
import { useAuth } from "@/context/AuthContext";

export default function MyIssues() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, openLogin } = useAuth();
  const [asc, setAsc] = useState(false);

  const { data: issues = [] } = useQuery({
    queryKey: ["my-issues", user?.user_id],
    queryFn: () => fetchIssues({ reporter_id: user.user_id }),
    enabled: !!user,
  });

  const sorted = [...issues].sort((a, b) => { const d = new Date(a.created_at) - new Date(b.created_at); return asc ? d : -d; });

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-[#f6f5f1] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e6e3dc] bg-[#f6f5f1]/95 px-5 pb-4 pt-[max(env(safe-area-inset-top),18px)] backdrop-blur-xl">
        <div className="flex items-start justify-between">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("myIssues.title")}</h1>
          <TopControls compact />
        </div>
        {user && (
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-sm text-[#6b6b70]">{t("myIssues.reportsSubmitted", { count: issues.length })}</p>
            <button data-testid="sort-toggle-btn" onClick={() => setAsc((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-[#e6e3dc] bg-white px-3 py-1.5 text-xs font-semibold">
              <ArrowUpDown className="h-3.5 w-3.5" /> {asc ? t("myIssues.oldest") : t("myIssues.newest")}
            </button>
          </div>
        )}
      </div>

      {!user ? (
        <div className="flex flex-col items-center gap-4 px-8 py-24 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f2f0]"><LogIn className="h-8 w-8 text-[#1f7a72]" /></span>
          <p className="text-sm leading-relaxed text-[#6b6b70]">{t("auth.loginPerk")}</p>
          <button data-testid="my-issues-login-btn" onClick={openLogin} className="fx-btn fx-btn-primary px-6">{t("auth.signIn")}</button>
        </div>
      ) : (
        <div className="space-y-3 px-4 pt-4">
          {sorted.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f2f0]"><Inbox className="h-8 w-8 text-[#1f7a72]" /></span>
              <p className="text-sm leading-relaxed text-[#6b6b70]">{t("myIssues.empty")}</p>
            </div>
          )}
          {sorted.map((issue, idx) => (
            <IssueCard key={issue.id} issue={issue} index={idx} onClick={() => navigate(`/issue/${issue.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
