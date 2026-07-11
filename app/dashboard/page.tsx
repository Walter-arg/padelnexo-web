"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Network, Flame, CalendarClock, Landmark } from "lucide-react";

const modules = [
  {
    label: "Ligas",
    sub: "Fixtures, posiciones y jugadores",
    href: "/dashboard/ligas",
    icon: Network,
    gradient: "from-blue-600 to-blue-400",
    shadow: "shadow-blue-200",
    glow: "group-hover:shadow-blue-300",
  },
  {
    label: "Torneos",
    sub: "Grupos, llaves y resultados",
    href: "/dashboard/torneos",
    icon: Flame,
    gradient: "from-orange-500 to-rose-400",
    shadow: "shadow-orange-200",
    glow: "group-hover:shadow-orange-300",
  },
  {
    label: "Turnos",
    sub: "Reservas y disponibilidad de canchas",
    href: "/dashboard/turnos",
    icon: CalendarClock,
    gradient: "from-violet-600 to-indigo-400",
    shadow: "shadow-violet-200",
    glow: "group-hover:shadow-violet-300",
  },
  {
    label: "Central de Cobros",
    sub: "Pagos, comprobantes y deudas",
    href: "/dashboard/cobros",
    icon: Landmark,
    gradient: "from-emerald-600 to-teal-400",
    shadow: "shadow-emerald-200",
    glow: "group-hover:shadow-emerald-300",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push("/login"); return; }
      setReady(true);
    });
    return unsub;
  }, [router]);

  if (!ready) return (
    <div className="min-h-screen bg-pn-navy flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <DashboardLayout title="">
      <div className="max-w-4xl mx-auto">

        {/* ── Grid 2×2 ── */}
        <div className="grid grid-cols-2 gap-6">
          {modules.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className={`group relative flex flex-col justify-between bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-xl ${m.glow} transition-all duration-300 overflow-hidden`}
            >
              {/* Fondo degradado sutil en hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-3xl`} />

              {/* Ícono con gradiente */}
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-lg ${m.shadow} mb-6 transition-transform duration-300 group-hover:scale-105`}>
                <m.icon size={30} className="text-white" strokeWidth={1.5} />
              </div>

              {/* Texto */}
              <div>
                <h2 className="text-xl font-black text-pn-navy mb-1 group-hover:text-pn-dark transition-colors">
                  {m.label}
                </h2>
                <p className="text-sm text-gray-400 leading-snug">{m.sub}</p>
              </div>

              {/* Flecha */}
              <div className={`absolute bottom-7 right-7 w-9 h-9 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </a>
          ))}
        </div>

      </div>
    </DashboardLayout>
  );
}
