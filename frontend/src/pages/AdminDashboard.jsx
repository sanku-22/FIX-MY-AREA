import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ArrowLeft, X, Check, Loader2, ExternalLink, TriangleAlert, CheckCircle2, Timer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { fetchIssues, fetchMetrics, updateStatus, updateCategory, buildPhotoUrl } from "@/lib/api";
import { CATEGORIES, STATUS, TIMELINE_STEPS, categoryOf } from "@/lib/constants";
import { timeAgo } from "@/lib/geo";
import TopControls from "@/components/TopControls";

const STATUS_FILTERS = ["all", "open", "in_progress", "resolved"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const { data: metrics } = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, refetchInterval: 15000 });
  const { data: issues = [], refetch } = useQuery({ queryKey: ["admin-issues"], queryFn: () => fetchIssues({}), refetchInterval: 15000 });

  const filtered = useMemo(() => issues.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (catFilter !== "all" && i.category !== catFilter) return false;
    return true;
  }), [issues, statusFilter, catFilter]);

  const metricCards = [
    { label: t("admin.totalOpen"), value: metrics?.open ?? 0, icon: TriangleAlert, color: "#E0913A" },
    { label: t("admin.inProgress"), value: metrics?.in_progress ?? 0, icon: Timer, color: "#5E8DBE" },
    { label: t("admin.resolvedWeek"), value: metrics?.resolved_this_week ?? 0, icon: CheckCircle2, color: "#4E9E74" },
    { label: t("admin.flagged"), value: metrics?.flagged ?? 0, icon: ShieldAlert, color: "#B06A2C" },
    { label: t("admin.totalReports"), value: metrics?.total ?? 0, icon: ShieldCheck, color: "#1f7a72" },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#f6f5f1]">
      <div className="border-b border-[#e6e3dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f7a72] text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="font-heading text-xl font-extrabold tracking-tight">{t("admin.title")}</p>
              <p className="text-xs text-[#6b6b70]">{t("admin.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TopControls />
            <button data-testid="admin-exit-btn" onClick={() => navigate("/")} className="flex items-center gap-2 rounded-xl border border-[#e6e3dc] px-4 py-2 text-sm font-semibold hover:bg-[#f1efe9]">
              <ArrowLeft className="h-4 w-4" /> {t("admin.citizenView")}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {metricCards.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} data-testid={`metric-${m.label}`} className="fx-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6b6b70]">{m.label}</p>
                  <Icon className="h-4 w-4" style={{ color: m.color }} />
                </div>
                <p className="mt-2 font-heading text-4xl font-extrabold tracking-tight" style={{ color: m.color }}>{m.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select data-testid="admin-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[#e6e3dc] bg-white px-4 py-2.5 text-sm font-semibold">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? t("admin.allStatuses") : t(`status.${s}`)}</option>)}
          </select>
          <select data-testid="admin-category-filter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-xl border border-[#e6e3dc] bg-white px-4 py-2.5 text-sm font-semibold">
            <option value="all">{t("admin.allCategories")}</option>
            {Object.keys(CATEGORIES).map((k) => <option key={k} value={k}>{t(`categories.${k}`)}</option>)}
          </select>
          <span className="text-sm text-[#6b6b70]">{t("admin.shown", { count: filtered.length })}</span>
        </div>

        <div className="fx-card mt-4 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#e6e3dc] bg-[#faf9f5]">
              <tr className="text-[#6b6b70]">
                <th className="p-3 font-semibold">{t("admin.issue")}</th>
                <th className="hidden p-3 font-semibold md:table-cell">{t("admin.category")}</th>
                <th className="p-3 font-semibold">{t("admin.statusCol")}</th>
                <th className="hidden p-3 font-semibold md:table-cell">{t("admin.confirms")}</th>
                <th className="hidden p-3 font-semibold sm:table-cell">{t("admin.reportedCol")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => {
                const cat = categoryOf(issue.category);
                const st = STATUS[issue.status] || STATUS.open;
                return (
                  <tr key={issue.id} data-testid={`admin-row-${issue.id}`} className="cursor-pointer border-b border-[#f0efe9] hover:bg-[#faf9f5]" onClick={() => setSelected(issue)}>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img src={buildPhotoUrl(issue.photo_path)} alt="" className="h-10 w-10 rounded-lg object-cover bg-[#f1efe9]" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 font-mono-tech text-[11px] text-[#6b6b70]">
                            #{issue.short_id}
                            {issue.flagged_ai_generated && <span title="AI-flagged" className="rounded bg-[#fbeee2] px-1 text-[9px] font-bold text-[#b06a2c]">{t("admin.aiBadge")}</span>}
                          </p>
                          <p className="max-w-[180px] truncate font-medium">{issue.description || issue.address_text}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden p-3 md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />{t(`categories.${issue.category}`)}</span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: st.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} />{t(`status.${issue.status}`)}</span>
                    </td>
                    <td className="hidden p-3 font-mono-tech md:table-cell">{issue.confirm_count}</td>
                    <td className="hidden p-3 text-[#6b6b70] sm:table-cell">{timeAgo(issue.created_at)}</td>
                    <td className="p-3 text-right"><ExternalLink className="ml-auto h-4 w-4 text-[#a9a9ae]" /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[#6b6b70]">{t("admin.noMatch")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <AdminEditPanel issue={selected} onClose={() => setSelected(null)} onSaved={async () => { await refetch(); setSelected(null); }} />}
    </div>
  );
}

function AdminEditPanel({ issue, onClose, onSaved }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(issue.timeline[issue.timeline.length - 1]?.status || "reported");
  const [category, setCategory] = useState(issue.category);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (category !== issue.category) await updateCategory(issue.id, category);
      const lastStatus = issue.timeline[issue.timeline.length - 1]?.status;
      if (status !== lastStatus || note.trim()) await updateStatus(issue.id, status, note.trim());
      toast.success(t("admin.saved")); await onSaved();
    } catch (e) { toast.error(t("admin.saveFailed")); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end bg-black/40" onClick={onClose}>
      <div className="cf-rise h-full w-full max-w-md overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold">{t("admin.manageIssue")}</h2>
          <button data-testid="admin-panel-close" onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <img src={buildPhotoUrl(issue.photo_path)} alt="" className="mt-4 h-44 w-full rounded-xl object-cover bg-[#f1efe9]" />
        {issue.flagged_ai_generated && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#fbeee2] p-2 text-xs font-semibold text-[#b06a2c]"><ShieldAlert className="h-4 w-4" /> {t("detail.aiFlagged")}</div>
        )}
        <p className="mt-3 font-mono-tech text-xs text-[#6b6b70]">#{issue.short_id}</p>
        <p className="mt-1 text-sm">{issue.description || t("admin.noDescription")}</p>
        <p className="mt-2 text-xs text-[#6b6b70]">{issue.address_text}</p>

        <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b70]">{t("admin.categoryLabel")}</label>
        <select data-testid="admin-category-select" value={category} onChange={(e) => setCategory(e.target.value)} className="fx-input mt-2 w-full px-4 py-3 text-sm">
          {Object.keys(CATEGORIES).map((k) => <option key={k} value={k}>{t(`categories.${k}`)}</option>)}
        </select>

        <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b70]">{t("admin.statusLabel")}</label>
        <select data-testid="admin-status-select" value={status} onChange={(e) => setStatus(e.target.value)} className="fx-input mt-2 w-full px-4 py-3 text-sm">
          {TIMELINE_STEPS.map((s) => <option key={s.key} value={s.key}>{t(`timeline.${s.key}`)}</option>)}
        </select>

        <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b70]">{t("admin.internalNote")}</label>
        <textarea data-testid="admin-note-input" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("admin.notePlaceholder")} className="fx-input mt-2 w-full resize-none px-4 py-3 text-sm" />

        <button data-testid="admin-save-btn" onClick={save} disabled={saving} className="fx-btn fx-btn-primary mt-5 w-full py-4">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("admin.saveChanges")}
        </button>
      </div>
    </div>
  );
}
