import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Inbox } from "lucide-react";
import { fetchIssues } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import IssueCard from "@/components/IssueCard";
import BottomNav from "@/components/BottomNav";

export default function MyIssues() {
  const navigate = useNavigate();
  const [asc, setAsc] = useState(false);

  const { data: issues = [] } = useQuery({
    queryKey: ["my-issues"],
    queryFn: () => fetchIssues({ reporter_id: getDeviceId() }),
  });

  const sorted = [...issues].sort((a, b) => {
    const d = new Date(a.created_at) - new Date(b.created_at);
    return asc ? d : -d;
  });

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-[#f4f4f5] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e4e4e7] bg-[#f4f4f5]/90 px-5 pb-4 pt-[max(env(safe-area-inset-top),18px)] backdrop-blur-xl">
        <h1 className="font-heading text-3xl font-black tracking-tighter">My Issues</h1>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-[#71717a]">{issues.length} reports submitted</p>
          <button
            data-testid="sort-toggle-btn"
            onClick={() => setAsc((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-white px-3 py-1.5 text-xs font-semibold"
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> {asc ? "Oldest" : "Newest"}
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <Inbox className="h-10 w-10 text-[#a1a1aa]" />
            <p className="text-sm text-[#71717a]">You haven't reported any issues yet. Head to the map to file your first report.</p>
          </div>
        )}
        {sorted.map((issue, idx) => (
          <IssueCard key={issue.id} issue={issue} index={idx} onClick={() => navigate(`/issue/${issue.id}`)} />
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
