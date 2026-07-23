"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Users, Calendar, MapPin, Tag, Plus, Loader2 } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; tint: string; border: string; accent: string }> = {
  draft:                { label: "Borrador",               tint: "#F3F5F7", border: "#D4DBE2", accent: "#667482" },
  published:            { label: "Publicado",              tint: "#EEF5FF", border: "#BED4F7", accent: "#356CB8" },
  registration_open:    { label: "Inscripciones abiertas", tint: "#D9FF63", border: "#A6D831", accent: "#295400" },
  registration_closed:  { label: "Inscripción cerrada",   tint: "#EAF4FF", border: "#A9C8E7", accent: "#2D5B8C" },
  building:             { label: "Armando",                tint: "#F2F0FF", border: "#CDC6F5", accent: "#6751B6" },
  in_progress:          { label: "En juego",               tint: "#EAF6FF", border: "#B5D8F0", accent: "#1C76A7" },
  finished:             { label: "Finalizado",             tint: "#F2F5F7", border: "#CDD6DC", accent: "#576773" },
  cancelled:            { label: "Cancelado",              tint: "#FFF0F0", border: "#E7B8B8", accent: "#B24343" },
};

const TITLE_COLORS = ["#E4572E", "#1C7ED6", "#0F9D58", "#C77D00", "#D63384", "#6C5CE7"];
function getTitleColor(seed: string): string {
  let h = 0;
  for (const c of (seed ?? "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TITLE_COLORS[h % TITLE_COLORS.length];
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span
      className="inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-full border"
      style={{ background: m.tint, borderColor: m.border, color: m.accent, letterSpacing: "0.5px" }}
    >
      {m.label}
    </span>
  );
}

type FilterTab = "activos" | "inscripciones" | "en_juego" | "finalizados" | "cancelados";
const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "activos",       label: "Activos" },
  { id: "inscripciones", label: "Inscripciones" },
  { id: "en_juego",      label: "En juego" },
  { id: "finalizados",   label: "Finalizados" },
  { id: "cancelados",    label: "Cancelados" },
];

function matchesTab(status: string, tab: FilterTab): boolean {
  switch (tab) {
    case "activos":       return ["draft","published","registration_open","registration_closed","building"].includes(status);
    case "inscripciones": return status === "registration_open";
    case "en_juego":      return ["building","in_progress"].includes(status);
    case "finalizados":   return status === "finished";
    case "cancelados":    return status === "cancelled";
  }
}

function formatDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Componente principal ────────────────────────────────────────────────────
export default function TorneosPage() {
  const router = useRouter();
  const [torneos, setTorneos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("activos");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push("/login"); return; }
      const q = query(collection(db, "tournaments"), where("organizerId", "==", u.uid));
      const unsubSnap = onSnapshot(q, (snap) => {
        setTorneos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
      return unsubSnap;
    });
    return unsubAuth;
  }, [router]);

  const filtered = torneos.filter((t) => matchesTab(t.status ?? "draft", activeTab));

  return (
    <DashboardLayout title="Torneos" wide>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-black" style={{ color: "#173A2E" }}>Torneos</h1>
        <a
          href="/dashboard/torneos/nueva"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-colors"
          style={{ background: "#0B8457" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#086847")}
          onMouseLeave={e => (e.currentTarget.style.background = "#0B8457")}
        >
          <Plus size={15} /> Nuevo torneo
        </a>
      </div>

      {/* Tabs de filtro */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-1.5 rounded-full text-sm font-bold border transition-all"
            style={
              activeTab === t.id
                ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                : { background: "transparent", color: "#5F7D72", borderColor: "#CFE7DC" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-12 px-6 rounded-2xl border"
          style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}
        >
          <Trophy size={48} className="mx-auto mb-4" style={{ color: "#CFE7DC" }} />
          <p className="font-black text-lg mb-1" style={{ color: "#173A2E" }}>
            {activeTab === "activos" ? "No hay torneos activos" : `No hay torneos en "${FILTER_TABS.find(t=>t.id===activeTab)?.label}"`}
          </p>
          <p className="text-sm" style={{ color: "#5F7D72" }}>
            {activeTab === "activos" ? "Creá tu primer torneo para empezar." : "Cambiá el filtro para ver otros torneos."}
          </p>
          {activeTab === "activos" && (
            <a
              href="/dashboard/torneos/nueva"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full text-sm font-bold text-white"
              style={{ background: "#0B8457" }}
            >
              <Plus size={14} /> Crear torneo
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => {
            const titleColor = getTitleColor(t.name ?? t.nombre ?? "");
            const confirmedCount = t.confirmedRegistrationsCount ?? t.registrationsCount ?? (t.players?.length ?? t.inscripciones?.length ?? 0);
            const maxPairs = t.maxPairs ?? 0;
            const startDate = formatDate(t.startDateMillis);
            const endDate = formatDate(t.endDateMillis);
            const venue = t.venues?.[0]?.name ?? t.complejo?.nombre ?? "";
            const category = t.compositionLabel ?? t.categoria ?? "";
            return (
              <a
                key={t.id}
                href={`/dashboard/torneos/${t.id}`}
                className="block rounded-xl border p-4 transition-all hover:shadow-md group"
                style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}
              >
                {/* Status + fecha */}
                <div className="flex items-center justify-between mb-3 gap-2">
                  <StatusBadge status={t.status ?? "draft"} />
                  {startDate && (
                    <span className="text-[11px] font-semibold" style={{ color: "#5F7D72" }}>{startDate}</span>
                  )}
                </div>

                {/* Nombre */}
                <p className="text-[11px] font-black uppercase mb-0.5" style={{ color: "#086847", letterSpacing: "0.8px" }}>TORNEO</p>
                <h2
                  className="font-bold leading-tight mb-3"
                  style={{ fontFamily: "Georgia, serif", fontSize: 18, color: titleColor }}
                >
                  {t.name ?? t.nombre ?? "Sin nombre"}
                </h2>

                {/* Bloque info */}
                <div
                  className="rounded-xl p-3 flex flex-col gap-1.5"
                  style={{ background: "#F3FAF6", border: "1px solid #DCEFE4" }}
                >
                  <div className="flex items-center gap-1.5">
                    <Trophy size={13} style={{ color: "#086847", flexShrink: 0 }} />
                    <span className="text-xs font-semibold" style={{ color: "#086847" }}>Zonas + llaves</span>
                  </div>
                  {category && (
                    <div className="flex items-center gap-1.5">
                      <Tag size={13} style={{ color: "#5F7D72", flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: "#5F7D72" }}>{category}</span>
                    </div>
                  )}
                  {(startDate || endDate) && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} style={{ color: "#5F7D72", flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: "#5F7D72" }}>
                        {startDate}{endDate && endDate !== startDate ? ` — ${endDate}` : ""}
                      </span>
                    </div>
                  )}
                  {venue && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} style={{ color: "#5F7D72", flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: "#5F7D72" }}>{venue}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users size={13} style={{ color: maxPairs > 0 && confirmedCount >= maxPairs ? "#D64545" : "#5F7D72", flexShrink: 0 }} />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: maxPairs > 0 && confirmedCount >= maxPairs ? "#D64545" : maxPairs > 0 && confirmedCount >= maxPairs - 2 ? "#D97706" : "#5F7D72" }}
                    >
                      {confirmedCount}{maxPairs > 0 ? ` / ${maxPairs}` : ""} inscriptos
                      {maxPairs > 0 && confirmedCount >= maxPairs ? " · Sin cupos" : maxPairs > 0 && confirmedCount >= maxPairs - 2 ? " · Últimos cupos" : ""}
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
