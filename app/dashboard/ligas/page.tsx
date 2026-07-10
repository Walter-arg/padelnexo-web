"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Users, ChevronRight, Archive } from "lucide-react";

type Tab = "activas" | "archivadas";

function LeagueAvatar({ url }: { url?: string }) {
  const [error, setError] = useState(false);
  if (!url || error) return <Trophy size={22} className="text-blue-600" />;
  return <img src={url} className="w-12 h-12 rounded-2xl object-cover" onError={() => setError(true)} alt="" />;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
};

export default function LigasPage() {
  const router = useRouter();
  const [ligas, setLigas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("activas");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      const q = query(collection(db, "leagues"), where("organizerId", "==", u.uid));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ordenar por createdAtMillis desc localmente
      data.sort((a: any, b: any) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0));
      setLigas(data);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  const filtradas = ligas.filter((l: any) =>
    tab === "activas" ? l.status === "active" : l.status === "archived"
  );
  const countActivas  = ligas.filter((l: any) => l.status === "active").length;
  const countArchiv   = ligas.filter((l: any) => l.status === "archived").length;

  return (
    <DashboardLayout title="Ligas">
      {/* Header con toggle archivadas */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {!loading && <span>{tab === "activas" ? countActivas : countArchiv} {tab === "activas" ? "ligas activas" : "ligas archivadas"}</span>}
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

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Trophy size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">
            {tab === "activas" ? "No tenés ligas activas" : "No tenés ligas archivadas"}
          </p>
          {tab === "activas" && <p className="text-sm mt-1">Creá tu primera liga desde la app móvil.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {filtradas.map((liga: any) => {
            const jugadores = liga.players?.length ?? 0;
            const rondas    = liga.fixture?.rounds?.length ?? 0;
            const dia = liga.scheduleConfig?.dayKey ? DAY_LABELS[liga.scheduleConfig.dayKey] : null;
            const horarios = liga.scheduleConfig?.timeSlots?.join(" / ") ?? null;
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
                    {liga.categoria && (
                      <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{liga.categoria}</span>
                    )}
                    <span className="text-xs bg-slate-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">{liga.sexo}</span>
                    <span className="text-xs bg-slate-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">{teamLabel}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Users size={12} /> {jugadores} jugadores</span>
                    {liga.complejo?.nombre && <span>📍 {liga.complejo.nombre}</span>}
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
    </DashboardLayout>
  );
}
