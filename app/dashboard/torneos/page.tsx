"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, Users, ChevronRight, Grid3X3, GitBranch } from "lucide-react";

const statusLabel: Record<string, { label: string; color: string }> = {
  active:   { label: "Activo",     color: "bg-green-100 text-green-700" },
  finished: { label: "Finalizado", color: "bg-blue-100 text-blue-600" },
  archived: { label: "Archivado",  color: "bg-gray-100 text-gray-500" },
  deleted:  { label: "Eliminado",  color: "bg-red-100 text-red-500" },
};

export default function TorneosPage() {
  const router = useRouter();
  const [torneos, setTorneos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      const q = query(
        collection(db, "tournaments"),
        where("organizerId", "==", u.uid)
      );
      const snap = await getDocs(q);
      setTorneos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [router]);

  return (
    <DashboardLayout title="Torneos">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : torneos.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Trophy size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">No tenés torneos creados</p>
          <p className="text-sm mt-1">Creá tu primer torneo desde la app móvil.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {torneos.map((t) => {
            const st = statusLabel[t.status] ?? statusLabel.active;
            const esGrupos = (t.formato ?? t.type ?? "").includes("grup");
            const inscriptos = t.players?.length ?? t.inscripciones?.length ?? 0;
            return (
              <a
                key={t.id}
                href={`/dashboard/torneos/${t.id}`}
                className="group bg-white rounded-2xl px-6 py-5 border border-gray-100 hover:border-amber-300/60 hover:shadow-md transition-all flex items-center gap-5"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Trophy size={22} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-pn-navy text-base truncate">{t.nombre}</span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      {esGrupos ? <Grid3X3 size={12} /> : <GitBranch size={12} />}
                      {t.formato ?? t.type ?? "Grupos"}
                    </span>
                    <span className="flex items-center gap-1"><Users size={12} /> {inscriptos} inscriptos</span>
                    {t.complejo?.nombre && <span>📍 {t.complejo.nombre}</span>}
                    {t.categoria && <span>🏅 {t.categoria}</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 group-hover:text-amber-500 transition-colors flex-shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
