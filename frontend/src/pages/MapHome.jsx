import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, LocateFixed, List, MapIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import MapView from "@/components/MapView";
import FilterChips from "@/components/FilterChips";
import IssueCard from "@/components/IssueCard";
import ReportWizard from "@/components/ReportWizard";
import TopControls from "@/components/TopControls";
import { fetchIssues } from "@/lib/api";
import { DEFAULT_CENTER } from "@/lib/constants";
import { haversine } from "@/lib/geo";

export default function MapHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [userLocation, setUserLocation] = useState(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [recenterKey, setRecenterKey] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const { data: issues = [], refetch } = useQuery({
    queryKey: ["issues"],
    queryFn: () => fetchIssues({}),
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    if (filter === "all") return issues;
    if (filter === "other") return issues.filter((i) => ["other", "signage", "uncategorized"].includes(i.category));
    return issues.filter((i) => i.category === filter);
  }, [issues, filter]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setCenter(loc);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const withDistance = useMemo(() => {
    return filtered
      .map((i) => ({ issue: i, dist: userLocation ? haversine(userLocation[0], userLocation[1], i.latitude, i.longitude) : null }))
      .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  }, [filtered, userLocation]);

  const locateMe = useCallback(() => {
    if (userLocation) {
      setRecenterKey((k) => k + 1);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setRecenterKey((k) => k + 1);
      });
    }
  }, [userLocation]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView center={center} issues={filtered} userLocation={userLocation} recenterKey={recenterKey} onMarkerClick={(issue) => navigate(`/issue/${issue.id}`)} />
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[1000] mx-auto max-w-lg px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/40 bg-white/80 px-4 py-3 shadow-[0_20px_40px_rgb(0,0,0,0.08)] backdrop-blur-xl">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#09090b] text-white font-heading text-sm font-black">C</span>
          <div className="flex-1 leading-tight">
            <p className="font-heading text-lg font-black tracking-tight">{t("app.name")}</p>
            <p className="text-[11px] text-[#71717a]">{t("app.tagline", { count: issues.length })}</p>
          </div>
          <TopControls compact />
        </div>
        <div className="pointer-events-auto mt-3">
          <FilterChips active={filter} onChange={setFilter} />
        </div>
      </div>

      <button data-testid="locate-me-btn" onClick={locateMe} className="absolute bottom-40 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/90 shadow-[0_20px_40px_rgb(0,0,0,0.08)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
        <LocateFixed className="h-5 w-5" />
      </button>

      <button data-testid="toggle-list-btn" onClick={() => setListOpen((v) => !v)} className="absolute bottom-56 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/90 shadow-[0_20px_40px_rgb(0,0,0,0.08)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
        {listOpen ? <MapIcon className="h-5 w-5" /> : <List className="h-5 w-5" />}
      </button>

      <button data-testid="report-issue-fab" onClick={() => setWizardOpen(true)} className="absolute bottom-24 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#09090b] px-6 py-4 text-base font-semibold text-white shadow-[0_20px_40px_rgb(0,0,0,0.25)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
        <Plus className="h-5 w-5" strokeWidth={2.6} /> {t("home.reportIssue")}
      </button>

      <div className={`absolute bottom-0 left-0 right-0 z-[1050] mx-auto max-w-lg rounded-t-3xl bg-[#f4f4f5] shadow-[0_-20px_40px_rgb(0,0,0,0.12)] transition-transform duration-300 ${listOpen ? "translate-y-0" : "translate-y-full"}`} style={{ maxHeight: "70dvh" }}>
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between px-6 pt-3">
          <h2 className="font-heading text-xl font-bold tracking-tight">{t("home.nearby")}</h2>
          <span className="text-sm text-[#71717a]">{withDistance.length}</span>
        </div>
        <div className="mt-3 space-y-3 overflow-y-auto px-4 pb-28" style={{ maxHeight: "58dvh" }}>
          {withDistance.length === 0 && <p className="px-2 py-10 text-center text-sm text-[#71717a]">{t("home.noIssues")}</p>}
          {withDistance.map(({ issue, dist }, idx) => (
            <IssueCard key={issue.id} issue={issue} distanceKm={dist} index={idx} onClick={() => navigate(`/issue/${issue.id}`)} />
          ))}
        </div>
      </div>

      <ReportWizard open={wizardOpen} onOpenChange={setWizardOpen} userLocation={userLocation} onCreated={(issue) => { refetch(); navigate(`/issue/${issue.id}`); }} />
    </div>
  );
}
