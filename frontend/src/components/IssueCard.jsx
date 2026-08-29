import React from "react";
import { useTranslation } from "react-i18next";
import { ThumbsUp } from "lucide-react";
import { buildPhotoUrl } from "@/lib/api";
import { categoryOf } from "@/lib/constants";
import { formatDistance, timeAgo } from "@/lib/geo";
import { StatusPill } from "@/components/StatusPill";

export default function IssueCard({ issue, distanceKm, onClick, index = 0 }) {
  const { t } = useTranslation();
  const cat = categoryOf(issue.category);
  return (
    <button
      data-testid={`issue-card-${issue.id}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 45}ms` }}
      className="cf-rise fx-card flex w-full items-center gap-4 p-4 text-left transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f7a72]"
    >
      <img
        src={buildPhotoUrl(issue.photo_path)}
        alt={t(`categories.${issue.category}`, cat.label)}
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-xl object-cover bg-[#f1efe9]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}>
            {t(`categories.${issue.category}`, cat.label)}
          </span>
          <span className="font-mono-tech text-[10px] text-[#6b6b70]">#{issue.short_id}</span>
        </div>
        <p className="mt-1.5 truncate text-sm font-semibold text-[#2a2a2c]">
          {issue.description || issue.address_text || t("home.reportedIssue")}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-[#6b6b70]">
          {distanceKm != null && <span>{formatDistance(distanceKm)}</span>}
          {distanceKm != null && <span>·</span>}
          <span>{timeAgo(issue.created_at)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <StatusPill status={issue.status} />
        {issue.confirm_count > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#6b6b70]">
            <ThumbsUp className="h-3 w-3" /> {issue.confirm_count}
          </span>
        )}
      </div>
    </button>
  );
}
