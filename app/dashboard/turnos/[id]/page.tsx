"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Clock, ChevronLeft, CheckCircle2, XCircle, Calendar, User, MapPin } from "lucide-react";

type Tab = "reservas" | "calendario";

const reservaStatus: Record<string, { label: string; color: string; icon: any }> = {
  confirmed: { label: "Confirmada", color: "text-green-600", icon: CheckCircle2 },
  pending:   { label: "Pendiente",  color: "text-amber-500", icon: Clock },
  cancelled: { label: "Cancelada",  color: "text-red-500",   icon: XCircle },
};

const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatFecha(ts: any): string {
  if (!ts) return "";
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return `${diasSemana[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function TurnoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const turnoId = params.id as string;

  const [config, setConfig] = useState<any>(null);
  const [reservas, setReservas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("reservas");
  const [filtro, setFiltro] = useState<"todas" | "confirmed" | "pending" | "cancelled">("todas");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }

      // Buscar la config en turnosConfigs o en turnos
      let snap = await getDoc(doc(db, "turnosConfigs", turnoId));
      if (!snap.exists()) snap = await getDoc(doc(db, "turnos", turnoId));
      if (snap.exists()) setConfig({ id: snap.id, ...snap.data() });

      // Buscar reservas en subcollección
      let rSnap = await getDocs(
        query(collection(db, "turnosConfigs", turnoId, "reservations"), orderBy("fechaHora", "desc"))
      );
      if (rSnap.empty) {
        rSnap = await getDocs(
          query(collection(db, "turnoReservations"), where("turnoConfigId", "==", turnoId), orderBy("fechaHora", "desc"))
        );
      }
      setReservas(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [turnoId, router]);

  if (loading) {
    return (
      <DashboardLayout title="Turnos">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const reservasFiltradas = filtro === "todas" ? reservas : reservas.filter(r => r.status === filtro);

  // Agrupar por fecha para vista calendario
  const porFecha: Record<string, any[]> = {};
  reservas.forEach(r => {
    const d = r.fechaHora?.seconds ? new Date(r.fechaHora.seconds * 1000) : new Date(r.fechaHora ?? r.fecha);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!porFecha[key]) porFecha[key] = [];
    porFecha[key].push(r);
  });

  const pendientes = reservas.filter(r => r.status === "pending").length;
  const confirmadas = reservas.filter(r => r.status === "confirmed").length;

  return (
    <DashboardLayout title="Turnos">
      {/* Header */}
      <div className="mb-6">
        <a href="/dashboard/turnos" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-pn-green mb-4 transition-colors">
          <ChevronLeft size={15} /> Todos los turnos
        </a>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-pn-navy">
              {config?.nombre ?? config?.cancha?.nombre ?? "Gestión de turnos"}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400 flex-wrap">
              {config?.complejo?.nombre && <span className="flex items-center gap-1"><MapPin size={12} /> {config.complejo.nombre}</span>}
              {config?.cancha?.nombre && <span>🎾 {config.cancha.nombre}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-center bg-white border border-gray-100 rounded-xl px-4 py-2">
              <div className="text-lg font-black text-amber-500">{pendientes}</div>
              <div className="text-xs text-gray-400">Pendientes</div>
            </div>
            <div className="text-center bg-white border border-gray-100 rounded-xl px-4 py-2">
              <div className="text-lg font-black text-green-600">{confirmadas}</div>
              <div className="text-xs text-gray-400">Confirmadas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([["reservas","Reservas", Clock], ["calendario","Calendario", Calendar]] as any[]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === id
                ? "bg-pn-green text-white shadow-md"
                : "bg-white text-gray-500 border border-gray-200 hover:border-pn-green hover:text-pn-green"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB RESERVAS ─────────────────────────────────────────── */}
      {tab === "reservas" && (
        <>
          {/* Filtros */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(["todas","confirmed","pending","cancelled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filtro === f ? "bg-pn-navy text-white border-pn-navy" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
              >
                {f === "todas" ? "Todas" : f === "confirmed" ? "Confirmadas" : f === "pending" ? "Pendientes" : "Canceladas"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 max-w-2xl">
            {reservasFiltradas.length === 0 && (
              <p className="text-gray-400 text-sm">
                {reservas.length === 0 ? "No hay reservas todavía." : "No hay reservas con ese filtro."}
              </p>
            )}
            {reservasFiltradas.map((r) => {
              const st = reservaStatus[r.status] ?? reservaStatus.pending;
              const StIcon = st.icon;
              return (
                <div key={r.id} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-pn-mint flex items-center justify-center flex-shrink-0">
                    <Clock size={18} className="text-pn-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-pn-navy text-sm">
                      {r.userName ?? r.jugadorNombre ?? "Jugador"}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatFecha(r.fechaHora ?? r.fecha)}</div>
                    {r.cancha?.nombre && <div className="text-xs text-gray-400">🎾 {r.cancha.nombre}</div>}
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${st.color}`}>
                    <StIcon size={13} />
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── TAB CALENDARIO ───────────────────────────────────────── */}
      {tab === "calendario" && (
        <div className="flex flex-col gap-5 max-w-2xl">
          {Object.keys(porFecha).length === 0 && (
            <p className="text-gray-400 text-sm">No hay reservas todavía.</p>
          )}
          {Object.entries(porFecha)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, rs]) => {
              const d = rs[0].fechaHora?.seconds
                ? new Date(rs[0].fechaHora.seconds * 1000)
                : new Date(rs[0].fechaHora ?? rs[0].fecha);
              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-gray-100 flex items-center gap-2">
                    <Calendar size={14} className="text-pn-green" />
                    <span className="font-black text-pn-navy text-sm">
                      {diasSemana[d.getDay()]} {d.getDate()} de {meses[d.getMonth()]}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{rs.length} reserva{rs.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {rs
                      .sort((a: any, b: any) => {
                        const ta = a.fechaHora?.seconds ?? 0;
                        const tb = b.fechaHora?.seconds ?? 0;
                        return ta - tb;
                      })
                      .map((r: any) => {
                        const hora = r.fechaHora?.seconds
                          ? new Date(r.fechaHora.seconds * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
                          : r.hora ?? "";
                        const st = reservaStatus[r.status] ?? reservaStatus.pending;
                        const StIcon = st.icon;
                        return (
                          <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                            <span className="text-xs font-black text-pn-navy w-12">{hora}</span>
                            <span className="flex-1 text-sm text-gray-700 font-medium">
                              {r.userName ?? r.jugadorNombre ?? "Jugador"}
                            </span>
                            <span className={`flex items-center gap-1 text-xs font-semibold ${st.color}`}>
                              <StIcon size={12} />
                              {st.label}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </DashboardLayout>
  );
}
