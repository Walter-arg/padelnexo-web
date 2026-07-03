"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Users, ChevronRight, Archive, Play } from "lucide-react";

type Tab = "activas" | "archivadas";

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
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("activas")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === "activas" ? "bg-pn-green text-white shadow-md" : "bg-white text-gray-500 border border-gray-200 hover:border-pn-green"
          }`}
        >
          <Play size={13} /> Activas {!loading && <span className="opacity-70">({countActivas})</span>}
        </button>
        <button
          onClick={() => setTab("archivadas")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === "archivadas" ? "bg-gray-600 text-white shadow-md" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-400"
          }`}
        >
          <Archive size={13} /> Archivadas {!loading && <span className="opacity-70">({countArchiv})</span>}
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
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  {liga.organizerLogoUrl
                    ? <img src={liga.organizerLogoUrl} className="w-12 h-12 rounded-2xl object-cover" />
                    : <Trophy size={22} className="text-blue-600" />}
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
