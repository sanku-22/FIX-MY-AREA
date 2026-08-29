import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Map, ListChecks, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const loc = useLocation();
  const { t } = useTranslation();
  if (loc.pathname.startsWith("/admin")) return null;

  const items = [
    { to: "/", label: t("nav.map"), icon: Map, testid: "nav-map" },
    { to: "/my-issues", label: t("nav.myIssues"), icon: ListChecks, testid: "nav-my-issues" },
    { to: "/admin", label: t("nav.admin"), icon: ShieldCheck, testid: "nav-admin" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1100] mx-auto flex max-w-lg items-center justify-around border-t border-[#e6e3dc] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl">
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
              active ? "text-[#1f7a72]" : "text-[#9a9a9f]",
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
