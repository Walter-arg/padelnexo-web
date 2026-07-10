"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Users, ChevronRight, Archive, Plus, Search, X } from "lucide-react";

type Tab = "activas" | "archivadas";

const CATEGORIAS = ["9na (Iniciantes)", "8va", "7ma", "6ta", "5ta", "4ta", "3ra", "2da", "1era"];
const RAMAS = ["Masculino", "Femenino", "Mixto"];
const DIAS = [
  { label: "Lunes", value: "monday" },
  { label: "Martes", value: "tuesday" },
  { label: "Miércoles", value: "wednesday" },
  { label: "Jueves", value: "thursday" },
  { label: "Viernes", value: "friday" },
  { label: "Sábado", value: "saturday" },
  { label: "Domingo", value: "sunday" },
];

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
};

function LeagueAvatar({ url }: { url?: string }) {
  const [error, setError] = useState(false);
  if (!url || error) return <Trophy size={22} className="text-blue-600" />;
  return <img src={url} className="w-12 h-12 rounded-2xl object-cover" onError={() => setError(true)} alt="" />;
}

const emptyForm = {
  nombre: "", sexo: "Masculino", teamType: "pair", categoria: "9na (Iniciantes)", dayKey: "",
};

export default function LigasPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ligas, setLigas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("activas");

  // Filtros
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroRama, setFiltroRama] = useState("");

  // Modal crear
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const q = query(collection(db, "leagues"), where("organizerId", "==", u.uid));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0));
      setLigas(data);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const doc_ = {
        nombre: form.nombre.trim(),
        sexo: form.sexo,
        teamType: form.teamType,
        modalidadCategoria: "libre",
        categoria: form.categoria,
        matchFormat: "two_sets_super_tiebreak",
        scheduleConfig: { dayKey: form.dayKey || null, timeSlots: [] },
        fixtureConfig: { roundMode: "single", minPlayersCount: 8, datesCount: 6, manualTeams: [] },
        complejo: { nombre: "Complejo sin definir", direccion: "", coordinates: null, organizerLogoUrl: "" },
        complejoNombre: "Complejo sin definir",
        localidad: { nombre: "", provincia: "", pais: "Argentina" },
        provincia: "",
        paymentDefaults: { currency: "ARS", registrationFeeEnabled: false, registrationFeeAmount: 0, roundPricePerPlayer: 0 },
        players: [],
        teams: [],
        organizerId: user!.uid,
        organizerLogoUrl: "",
        status: "active",
        createdBy: user!.uid,
        createdByName: user!.displayName || "",
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now(),
      };
      const ref = await addDoc(collection(db, "leagues"), doc_);
      setLigas((prev) => [{ id: ref.id, ...doc_ }, ...prev]);
      setModalOpen(false);
      setForm(emptyForm);
    } catch {
      setSaveError("No se pudo crear la liga. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const porTab = ligas.filter((l: any) =>
    tab === "activas" ? l.status === "active" : l.status === "archived"
  );

  const filtradas = porTab.filter((l: any) => {
    const matchSearch = !search || l.nombre?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filtroCategoria || l.categoria === filtroCategoria;
    const matchRama = !filtroRama || l.sexo === filtroRama;
    return matchSearch && matchCat && matchRama;
  });

  const countActivas = ligas.filter((l: any) => l.status === "active").length;
  const countArchiv  = ligas.filter((l: any) => l.status === "archived").length;

  const hayFiltros = search || filtroCategoria || filtroRama;

  return (
    <DashboardLayout title="Ligas">

      {/* ── Barra superior: búsqueda + crear ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar liga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 bg-white transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros */}
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white focus:outline-none focus:border-pn-green cursor-pointer"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filtroRama}
          onChange={(e) => setFiltroRama(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white focus:outline-none focus:border-pn-green cursor-pointer"
        >
          <option value="">Todas las ramas</option>
          {RAMAS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* Botón crear */}
        <button
          onClick={() => { setModalOpen(true); setSaveError(""); }}
          className="flex items-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-pn-green/20 whitespace-nowrap"
        >
          <Plus size={17} /> Nueva liga
        </button>
      </div>

      {/* ── Contador + toggle archivadas ── */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          {!loading && (
            hayFiltros
              ? <>{filtradas.length} resultado{filtradas.length !== 1 ? "s" : ""}</>
              : <>{tab === "activas" ? countActivas : countArchiv} {tab === "activas" ? "ligas activas" : "ligas archivadas"}</>
          )}
        </p>
        <button
          onClick={() => setTab(tab === "activas" ? "archivadas" : "activas")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-pn-navy transition-colors"
        >
          <Archive size={14} />
          {tab === "activas"
            ? <>Archivadas {!loading && countArchiv > 0 && <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1.5 py-0.5 rounded-full">{countArchiv}</span>}</>
            : <span className="text-pn-green font-semibold">← Ver activas</span>
          }
        </button>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Trophy size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">
            {hayFiltros ? "No hay ligas con ese filtro" : tab === "activas" ? "No tenés ligas activas" : "No tenés ligas archivadas"}
          </p>
          {!hayFiltros && tab === "activas" && (
            <button onClick={() => setModalOpen(true)} className="mt-4 text-sm text-pn-green font-semibold hover:underline">
              + Crear primera liga
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {filtradas.map((liga: any) => {
            const jugadores = liga.players?.length ?? 0;
            const rondas    = liga.fixture?.rounds?.length ?? 0;
            const dia       = liga.scheduleConfig?.dayKey ? DAY_LABELS[liga.scheduleConfig.dayKey] : null;
            const horarios  = liga.scheduleConfig?.timeSlots?.join(" / ") ?? null;
            const teamLabel = liga.teamType === "pair" ? "Parejas" : "Individual";
            return (
              <a
                key={liga.id}
                href={`/dashboard/ligas/${liga.id}`}
                className="group bg-white rounded-2xl px-6 py-5 border border-gray-100 hover:border-pn-green/40 hover:shadow-md transition-all flex items-center gap-5"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <LeagueAvatar url={liga.organizerLogoUrl} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-black text-pn-navy text-base">{liga.nombre}</span>
                    {liga.categoria && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{liga.categoria}</span>}
                    <span className="text-xs bg-slate-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">{liga.sexo}</span>
                    <span className="text-xs bg-slate-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">{teamLabel}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Users size={12} /> {jugadores} jugadores</span>
                    {liga.complejo?.nombre && liga.complejo.nombre !== "Complejo sin definir" && <span>📍 {liga.complejo.nombre}</span>}
                    {rondas > 0 && <span>📅 {rondas} fechas</span>}
                    {dia && <span>🗓 {dia}{horarios ? ` ${horarios}` : ""}</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 group-hover:text-pn-green transition-colors flex-shrink-0" />
              </a>
            );
          })}
        </div>
      )}

      {/* ── Modal Nueva Liga ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
            <button onClick={() => setModalOpen(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
            <h2 className="text-xl font-black text-pn-navy mb-6">Nueva liga</h2>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-pn-navy mb-1.5">Nombre de la liga *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Liga Verano 2026"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-pn-navy mb-1.5">Rama</label>
                  <select
                    value={form.sexo}
                    onChange={(e) => setForm({ ...form, sexo: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                  >
                    <option value="Masculino">Caballeros</option>
                    <option value="Femenino">Damas</option>
                    <option value="Mixto">Mixta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-pn-navy mb-1.5">Tipo</label>
                  <select
                    value={form.teamType}
                    onChange={(e) => setForm({ ...form, teamType: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                  >
                    <option value="pair">Pareja fija</option>
                    <option value="individual">Individual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-pn-navy mb-1.5">Categoría</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                  >
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-pn-navy mb-1.5">Día de juego</label>
                  <select
                    value={form.dayKey}
                    onChange={(e) => setForm({ ...form, dayKey: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                  >
                    <option value="">Sin definir</option>
                    {DIAS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              {saveError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{saveError}</p>
              )}

              <button
                type="submit"
                disabled={saving || !form.nombre.trim()}
                className="w-full bg-pn-green hover:bg-pn-dark text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-pn-green/20 disabled:opacity-60 mt-2"
              >
                {saving ? "Creando..." : "Crear liga"}
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
