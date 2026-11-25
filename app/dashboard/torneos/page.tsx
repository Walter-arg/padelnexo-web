"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Calendar, Plus, Loader2, Menu } from "lucide-react";

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

// Color unico y acorde a la marca para el titulo del torneo (antes rotaba
// entre varios colores sin relacion con la paleta de la app).
const TOURNAMENT_TITLE_COLOR = "#1FAB89";

type FilterTab = "activos" | "publicados" | "pendientes" | "en_curso" | "finalizados" | "cancelados";

const MAIN_TABS: { id: FilterTab; label: string }[] = [
  { id: "activos",    label: "Creados" },
  { id: "publicados", label: "Publicados" },
  { id: "pendientes", label: "Pendientes de publicar" },
  { id: "en_curso",   label: "En curso" },
];

const MENU_TABS: { id: FilterTab; label: string }[] = [
  { id: "finalizados", label: "Finalizados" },
  { id: "cancelados",  label: "Cancelados" },
];

function matchesTab(status: string, tab: FilterTab): boolean {
  switch (tab) {
    case "activos":     return !["finished", "cancelled"].includes(status);
    case "publicados":  return status === "published";
    case "pendientes":  return status === "draft";
    case "en_curso":    return ["registration_open", "registration_closed", "building", "in_progress"].includes(status);
    case "finalizados": return status === "finished";
    case "cancelados":  return status === "cancelled";
  }
}

function formatDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

type ListItem =
  | { type: "tournament"; id: string; t: any }
  | { type: "event"; id: string; categories: any[] };

function groupTournaments(list: any[]): ListItem[] {
  const items: ListItem[] = [];
  const indexByBatchId = new Map<string, number>();

  list.forEach((t) => {
    const batchId = t.creationBatchId || "";

    if (!batchId) {
      items.push({ type: "tournament", id: t.id, t });
      return;
    }

    if (indexByBatchId.has(batchId)) {
      const item = items[indexByBatchId.get(batchId)!];
      if (item.type === "event") item.categories.push(t);
      return;
    }

    indexByBatchId.set(batchId, items.length);
    items.push({ type: "event", id: `event-${batchId}`, categories: [t] });
  });

  return items.map((item) =>
    item.type === "event" && item.categories.length === 1
      ? { type: "tournament", id: item.categories[0].id, t: item.categories[0] }
      : item
  );
}

function OrganizerTournamentCardLink({ categories }: { categories: any[] }) {
  const representative = categories[0];
  const baseName = representative.baseName ?? representative.name ?? representative.nombre ?? "Sin nombre";
  const startDate = formatDate(representative.startDateMillis);
  const endDate = formatDate(representative.endDateMillis);
  const venue = representative.venues?.[0]?.name ?? representative.complejo?.nombre ?? "";
  const hasOpenCategory = categories.some((cat) => cat.status === "registration_open");
  const areAllCategoriesClosed = categories.every((cat) =>
    ["published", "registration_closed"].includes(cat.status)
  );
  const headerStatus = hasOpenCategory
    ? STATUS_META.registration_open
    : areAllCategoriesClosed
    ? STATUS_META.registration_closed
    : STATUS_META[representative.status ?? "draft"] ?? STATUS_META.draft;

  return (
    <a
      href={`/dashboard/torneos/${representative.id}`}
      className="block rounded-2xl border p-4 transition-all hover:shadow-md"
      style={{ background: "#FFFFFF", borderColor: "#CFE7DC", boxShadow: "0 6px 14px rgba(11,39,25,0.08)" }}
    >
      {/* Club + estado */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {representative.organizerLogoUrl ? (
            <img
              src={representative.organizerLogoUrl}
              alt=""
              className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border"
              style={{ borderColor: "#CFE7DC" }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "#ECF8F2", border: "1px solid #CFE7DC" }}
            >
              <Trophy size={16} style={{ color: "#086847" }} />
            </div>
          )}
          <span className="font-black text-sm truncate" style={{ color: "#173A2E" }}>
            {venue || "Club a confirmar"}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1.5 rounded-full flex-shrink-0"
          style={{ background: headerStatus.tint, color: headerStatus.accent }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: headerStatus.accent }} />
          {headerStatus.label}
        </span>
      </div>

      {/* Nombre */}
      <p className="text-[11px] font-black uppercase mt-1" style={{ color: "#086847", letterSpacing: "1px" }}>TORNEO</p>
      <h2 className="font-black leading-tight mt-0.5 mb-3" style={{ fontSize: 22, color: TOURNAMENT_TITLE_COLOR }}>
        {baseName}
      </h2>

      {/* Divisor Categorías */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px" style={{ background: "#CFE7DC" }} />
        <span
          className="text-[10px] font-black px-3 py-1 rounded-full text-white"
          style={{ background: "#086847", letterSpacing: "1px" }}
        >
          CATEGORÍAS
        </span>
        <div className="flex-1 h-px" style={{ background: "#CFE7DC" }} />
      </div>

      {/* Grilla de categorias */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {categories.map((cat) => {
          const meta = STATUS_META[cat.status ?? "draft"] ?? STATUS_META.draft;
          const label = cat.compositionLabel ?? cat.categoria ?? "Categoría a confirmar";
          return (
            <div key={cat.id} className="rounded-xl px-2.5 py-2.5 text-center" style={{ background: "#DFF4EC" }}>
              <p className="text-xs font-black truncate" style={{ color: "#173A2E" }}>{label}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.accent }} />
                <span className="text-[10px] font-bold truncate" style={{ color: meta.accent }}>{meta.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fecha */}
      {(startDate || endDate) && (
        <div className="flex items-center gap-1.5">
          <Calendar size={13} style={{ color: "#5F7D72", flexShrink: 0 }} />
          <span className="text-xs font-semibold" style={{ color: "#5F7D72" }}>
            {startDate}{endDate && endDate !== startDate ? ` — ${endDate}` : ""}
          </span>
        </div>
      )}
    </a>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export default function TorneosPage() {
  const router = useRouter();
  const [torneos, setTorneos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("activos");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      {/* Ranking */}
      <div className="flex justify-center mb-4">
        <a
          href="/dashboard/torneos/ranking"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-opacity hover:opacity-80"
          style={{ borderColor: "#CFE7DC", color: "#086847", background: "#FFFFFF" }}
        >
          <Trophy size={15} /> Ranking
        </a>
      </div>

      {/* Header + filtros en una sola fila */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="px-3 py-1 text-xs font-semibold rounded transition-colors"
              style={
                activeTab === t.id
                  ? { color: "#0B8457", background: "#E8F5EE" }
                  : { color: "#9BB8AE", background: "transparent" }
              }
            >
              {t.label}
            </button>
          ))}

          {/* Menú hamburguesa: Finalizados / Cancelados */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded transition-colors ml-1"
              style={{
                color: MENU_TABS.some(t => t.id === activeTab) ? "#0B8457" : "#9BB8AE",
                background: MENU_TABS.some(t => t.id === activeTab) ? "#E8F5EE" : "transparent",
              }}
              title="Más filtros"
            >
              <Menu size={14} />
            </button>
            {menuOpen && (
              <div
                className="absolute left-0 top-full mt-1 rounded-lg shadow-lg border py-1 z-20 min-w-[160px]"
                style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}
              >
                {MENU_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTab(t.id); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold transition-colors"
                    style={{
                      color: activeTab === t.id ? "#0B8457" : "#5F7D72",
                      background: activeTab === t.id ? "#E8F5EE" : "transparent",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
            {activeTab === "activos" ? "No hay torneos creados" : `No hay torneos en "${[...MAIN_TABS, ...MENU_TABS].find(t=>t.id===activeTab)?.label}"`}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupTournaments(filtered).map((item) => (
            <OrganizerTournamentCardLink
              key={item.id}
              categories={item.type === "event" ? item.categories : [item.t]}
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
