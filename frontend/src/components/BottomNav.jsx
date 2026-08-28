import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Map, ListChecks, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Map", icon: Map, testid: "nav-map" },
  { to: "/my-issues", label: "My Issues", icon: ListChecks, testid: "nav-my-issues" },
  { to: "/admin", label: "Admin", icon: ShieldCheck, testid: "nav-admin" },
];

export default function BottomNav() {
  const loc = useLocation();
  if (loc.pathname.startsWith("/admin")) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1100] mx-auto flex max-w-lg items-center justify-around border-t border-[#e4e4e7] bg-white/90 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(it.to);
        return (
          <NavLink
            key={it.to}
            to={it.to}
            data-testid={it.testid}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors",
              active ? "text-[#09090b]" : "text-[#a1a1aa]",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
            {it.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
