import React from "react";
import { STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusPill({ status, className }) {
  const s = STATUS[status] || STATUS.open;
  return (
    <span
      data-testid={`status-pill-${status}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
        className,
      )}
      style={{ backgroundColor: `${s.color}1A`, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}
