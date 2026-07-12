"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  IconBallTennis,
  IconTrophy,
  IconCalendarEvent,
  IconBuildingBank,
} from "@tabler/icons-react";

const modules = [
  {
    label: "Ligas",
    sub: "Fixtures, posiciones y jugadores",
    href: "/dashboard/ligas",
    Icon: IconBallTennis,
    gradient: "from-blue-600 to-cyan-400",
    glow: "group-hover:shadow-blue-300/60",
    ring: "group-hover:ring-blue-100",
  },
  {
    label: "Torneos",
    sub: "Grupos, llaves y resultados",
    href: "/dashboard/torneos",
    Icon: IconTrophy,
    gradient: "from-amber-500 to-yellow-300",
    glow: "group-hover:shadow-amber-300/60",
    ring: "group-hover:ring-amber-100",
  },
  {
    label: "Turnos",
    sub: "Reservas y disponibilidad de canchas",
    href: "/dashboard/turnos",
    Icon: IconCalendarEvent,
    gradient: "from-violet-600 to-purple-400",
    glow: "group-hover:shadow-violet-300/60",
    ring: "group-hover:ring-violet-100",
  },
  {
    label: "Central de Cobros",
    sub: "Pagos, comprobantes y deudas",
    href: "/dashboard/cobros",
    Icon: IconBuildingBank,
    gradient: "from-emerald-500 to-teal-300",
    glow: "group-hover:shadow-emerald-300/60",
    ring: "group-hover:ring-emerald-100",
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
      <div className="max-w-3xl mx-auto">
        <div className="grid grid-cols-2 gap-6">
          {modules.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className={`group relative flex flex-col bg-white rounded-3xl p-8 border border-gray-100 ring-4 ring-transparent ${m.ring} hover:shadow-2xl ${m.glow} transition-all duration-300 overflow-hidden`}
            >
              {/* Brillo fondo hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-[0.05] transition-opacity duration-300`} />

              {/* Ícono */}
              <div className={`relative w-20 h-20 rounded-3xl bg-gradient-to-br ${m.gradient} flex items-center justify-center mb-6 shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:-rotate-1`}>
                <m.Icon size={38} color="white" stroke={1.5} />
              </div>

              {/* Texto */}
              <h2 className="text-2xl font-black text-pn-navy mb-2">{m.label}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{m.sub}</p>

              {/* Flecha animada */}
              <div className={`absolute bottom-7 right-7 w-10 h-10 rounded-2xl bg-gradient-to-br ${m.gradient} flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-md transition-all duration-300 translate-y-2 group-hover:translate-y-0`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
