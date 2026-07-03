"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Clock, MapPin, ChevronRight, Calendar } from "lucide-react";

export default function TurnosPage() {
  const router = useRouter();
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      // Buscar en turnosConfigs primero
      let snap = await getDocs(
        query(collection(db, "turnosConfigs"), where("organizerId", "==", u.uid))
      );
      // Si no existe esa colección, probar con "turnos"
      if (snap.empty) {
        snap = await getDocs(
          query(collection(db, "turnos"), where("organizerId", "==", u.uid))
        );
      }
      setConfigs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [router]);

  return (
    <DashboardLayout title="Turnos">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Clock size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">No tenés turnos configurados</p>
          <p className="text-sm mt-1">Configurá tus canchas y horarios desde la app móvil.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {configs.map((c) => (
            <a
              key={c.id}
              href={`/dashboard/turnos/${c.id}`}
              className="group bg-white rounded-2xl px-6 py-5 border border-gray-100 hover:border-pn-green/40 hover:shadow-md transition-all flex items-center gap-5"
            >
              <div className="w-12 h-12 rounded-2xl bg-pn-mint flex items-center justify-center flex-shrink-0">
                <Clock size={22} className="text-pn-green" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-pn-navy text-base mb-1 truncate">
                  {c.nombre ?? c.cancha?.nombre ?? "Configuración de turnos"}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {c.complejo?.nombre && <span className="flex items-center gap-1"><MapPin size={11} /> {c.complejo.nombre}</span>}
                  {c.cancha?.nombre && <span>🎾 {c.cancha.nombre}</span>}
                  {c.horariosActivos && <span className="flex items-center gap-1"><Calendar size={11} /> Horarios configurados</span>}
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-pn-green transition-colors flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
