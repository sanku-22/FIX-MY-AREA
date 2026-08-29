import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, LocateFixed, List, MapIcon, MapPinned } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import MapView from "@/components/MapView";
import FilterChips from "@/components/FilterChips";
import IssueCard from "@/components/IssueCard";
import ReportWizard from "@/components/ReportWizard";
import TopControls from "@/components/TopControls";
import { fetchIssues } from "@/lib/api";
import { DEFAULT_CENTER } from "@/lib/constants";
import { haversine } from "@/lib/geo";
import { useMapTheme } from "@/lib/mapTheme";
import { useAuth } from "@/context/AuthContext";

export default function MapHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, openLogin } = useAuth();
  const [filter, setFilter] = useState("all");
  const [userLocation, setUserLocation] = useState(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [recenterKey, setRecenterKey] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const theme = useMapTheme(userLocation);

  const { data: issues = [], refetch } = useQuery({ queryKey: ["issues"], queryFn: () => fetchIssues({}), refetchInterval: 15000 });

  const filtered = useMemo(() => {
    if (filter === "all") return issues;
    if (filter === "other") return issues.filter((i) => ["other", "signage", "uncategorized"].includes(i.category));
    return issues.filter((i) => i.category === filter);
  }, [issues, filter]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { const loc = [pos.coords.latitude, pos.coords.longitude]; setUserLocation(loc); setCenter(loc); },
      () => {}, { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const withDistance = useMemo(() => filtered
    .map((i) => ({ issue: i, dist: userLocation ? haversine(userLocation[0], userLocation[1], i.latitude, i.longitude) : null }))
    .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)), [filtered, userLocation]);

  const locateMe = useCallback(() => {
    if (userLocation) setRecenterKey((k) => k + 1);
    else if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setRecenterKey((k) => k + 1); });
  }, [userLocation]);

  const onReport = () => { if (!user) { openLogin(); return; } setWizardOpen(true); };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView center={center} issues={filtered} userLocation={userLocation} recenterKey={recenterKey} theme={theme} onMarkerClick={(issue) => navigate(`/issue/${issue.id}`)} />
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[1000] mx-auto max-w-lg px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#e6e3dc] bg-white/90 px-4 py-3 shadow-[0_10px_30px_rgba(42,42,44,0.08)] backdrop-blur-xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f7a72] text-white"><MapPinned className="h-5 w-5" /></span>
          <div className="flex-1 leading-tight">
            <p className="font-heading text-lg font-extrabold tracking-tight">{t("app.name")}</p>
            <p className="text-[11px] text-[#6b6b70]">{t("app.tagline", { count: issues.length })}</p>
          </div>
          <TopControls compact />
        </div>
        <div className="pointer-events-auto mt-3"><FilterChips active={filter} onChange={setFilter} /></div>
      </div>

      <button data-testid="locate-me-btn" onClick={locateMe} className="absolute bottom-40 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-[#e6e3dc] bg-white/95 text-[#1f7a72] shadow-[0_10px_30px_rgba(42,42,44,0.1)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
        <LocateFixed className="h-5 w-5" />
      </button>
      <button data-testid="toggle-list-btn" onClick={() => setListOpen((v) => !v)} className="absolute bottom-56 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-[#e6e3dc] bg-white/95 text-[#2a2a2c] shadow-[0_10px_30px_rgba(42,42,44,0.1)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95">
        {listOpen ? <MapIcon className="h-5 w-5" /> : <List className="h-5 w-5" />}
      </button>
      <button data-testid="report-issue-fab" onClick={onReport} className="absolute bottom-24 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#1f7a72] px-7 py-4 text-base font-semibold text-white shadow-[0_14px_30px_rgba(31,122,114,0.4)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#17635c] active:scale-95">
        <Plus className="h-5 w-5" strokeWidth={2.6} /> {t("home.reportIssue")}
      </button>

      <div className={`absolute bottom-0 left-0 right-0 z-[1050] mx-auto max-w-lg rounded-t-3xl bg-[#f6f5f1] shadow-[0_-16px_40px_rgba(42,42,44,0.12)] transition-transform duration-300 ${listOpen ? "translate-y-0" : "translate-y-full"}`} style={{ maxHeight: "70dvh" }}>
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#d9d6cd]" />
        <div className="flex items-center justify-between px-6 pt-3">
          <h2 className="font-heading text-xl font-bold tracking-tight">{t("home.nearby")}</h2>
          <span className="text-sm text-[#6b6b70]">{withDistance.length}</span>
        </div>
        <div className="mt-3 space-y-3 overflow-y-auto px-4 pb-28" style={{ maxHeight: "58dvh" }}>
          {withDistance.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f2f0]"><MapPinned className="h-8 w-8 text-[#1f7a72]" /></span>
              <p className="font-heading text-lg font-bold text-[#2a2a2c]">{t("home.emptyTitle")}</p>
              <p className="max-w-xs text-sm leading-relaxed text-[#6b6b70]">{t("home.emptyText")}</p>
            </div>
          )}
          {withDistance.map(({ issue, dist }, idx) => (
            <IssueCard key={issue.id} issue={issue} distanceKm={dist} index={idx} onClick={() => navigate(`/issue/${issue.id}`)} />
          ))}
        </div>
      </div>

      <ReportWizard open={wizardOpen} onOpenChange={setWizardOpen} userLocation={userLocation} onCreated={() => refetch()} />
    </div>
  );
}
