"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, CircleDollarSign } from "lucide-react";

// ── Íconos SVG custom específicos de pádel ────────────────────────────────

function PadelRacket({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {/* Cabeza de la paleta */}
      <ellipse cx="11" cy="9" rx="6.2" ry="7" />
      {/* Cuerdas horizontales */}
      <line x1="5.3" y1="6.5" x2="16.7" y2="6.5" />
      <line x1="4.9" y1="9"   x2="17.1" y2="9" />
      <line x1="5.3" y1="11.5" x2="16.7" y2="11.5" />
      {/* Cuerdas verticales */}
      <line x1="8.5"  y1="2.3" x2="8.5"  y2="15.7" />
      <line x1="11"   y1="2"   x2="11"   y2="16" />
      <line x1="13.5" y1="2.3" x2="13.5" y2="15.7" />
      {/* Mango */}
      <line x1="11" y1="16" x2="11" y2="22" />
      {/* Grip inferior */}
      <line x1="9.5" y1="21" x2="12.5" y2="21" />
      {/* Pelota */}
      <circle cx="19.5" cy="19.5" r="2.3" />
    </svg>
  );
}

function PadelCourt({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {/* Cancha — contorno exterior con paredes de cristal (línea más gruesa) */}
      <rect x="2" y="3" width="20" height="18" rx="0.5" strokeWidth="2" />
      {/* Red (línea central) */}
      <line x1="2" y1="12" x2="22" y2="12" strokeWidth="2" />
      {/* Líneas de servicio */}
      <line x1="7"  y1="3"  x2="7"  y2="21" />
      <line x1="17" y1="3"  x2="17" y2="21" />
      {/* Marca central de la red */}
      <line x1="12" y1="11" x2="12" y2="13" strokeWidth="2" />
    </svg>
  );
}

// ── Módulos del home ──────────────────────────────────────────────────────

const modules = [
  {
    label: "Ligas",
    sub: "Fixtures, posiciones y jugadores",
    href: "/dashboard/ligas",
    Icon: PadelRacket,
    gradient: "from-blue-600 to-cyan-400",
    shadow: "shadow-blue-300",
    ring: "group-hover:ring-blue-200",
  },
  {
    label: "Torneos",
    sub: "Grupos, llaves y resultados",
    href: "/dashboard/torneos",
    Icon: Trophy,
    gradient: "from-amber-500 to-yellow-300",
    shadow: "shadow-amber-300",
    ring: "group-hover:ring-amber-200",
  },
  {
    label: "Turnos",
    sub: "Reservas y disponibilidad de canchas",
    href: "/dashboard/turnos",
    Icon: PadelCourt,
    gradient: "from-violet-600 to-purple-400",
    shadow: "shadow-violet-300",
    ring: "group-hover:ring-violet-200",
  },
  {
    label: "Central de Cobros",
    sub: "Pagos, comprobantes y deudas",
    href: "/dashboard/cobros",
    Icon: CircleDollarSign,
    gradient: "from-emerald-500 to-green-300",
    shadow: "shadow-emerald-300",
    ring: "group-hover:ring-emerald-200",
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
              className={`group relative flex flex-col bg-white rounded-3xl p-8 border-2 border-transparent hover:border-gray-100 hover:shadow-2xl ${m.ring} ring-4 ring-transparent transition-all duration-300 overflow-hidden`}
            >
              {/* Brillo de fondo en hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300`} />

              {/* Ícono con gradiente */}
              <div className={`relative w-20 h-20 rounded-3xl bg-gradient-to-br ${m.gradient} flex items-center justify-center mb-6 shadow-xl ${m.shadow} transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-1`}>
                <m.Icon size={36} className="text-white" strokeWidth={1.6} />
              </div>

              {/* Texto */}
              <h2 className="text-2xl font-black text-pn-navy mb-2 leading-tight">{m.label}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{m.sub}</p>

              {/* Flecha animada */}
              <div className={`absolute bottom-7 right-7 w-10 h-10 rounded-2xl bg-gradient-to-br ${m.gradient} flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-lg transition-all duration-300 translate-y-2 group-hover:translate-y-0`}>
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
