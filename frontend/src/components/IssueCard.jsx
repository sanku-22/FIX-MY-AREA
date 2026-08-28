import React from "react";
import { buildPhotoUrl } from "@/lib/api";
import { categoryOf } from "@/lib/constants";
import { formatDistance, timeAgo } from "@/lib/geo";
import { StatusPill } from "@/components/StatusPill";

export default function IssueCard({ issue, distanceKm, onClick, index = 0 }) {
  const cat = categoryOf(issue.category);
  return (
    <button
      data-testid={`issue-card-${issue.id}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 45}ms` }}
      className="cf-rise flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-black"
    >
      <img
        src={buildPhotoUrl(issue.photo_path)}
        alt={cat.label}
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-lg object-cover bg-gray-100"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}
          >
            {cat.label}
          </span>
          <span className="font-mono-tech text-[10px] text-[#71717a]">#{issue.short_id}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-[#09090b]">
          {issue.description || issue.address_text || "Reported issue"}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-[#71717a]">
          {distanceKm != null && <span>{formatDistance(distanceKm)}</span>}
          {distanceKm != null && <span>·</span>}
          <span>{timeAgo(issue.created_at)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusPill status={issue.status} />
        {issue.confirm_count > 0 && (
          <span className="text-[10px] font-semibold text-[#71717a]">
            {issue.confirm_count} confirmed
          </span>
        )}
      </div>
    </button>
  );
}
