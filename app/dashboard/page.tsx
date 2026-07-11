"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Trophy, DollarSign, Clock, MessageSquare, Bell, Users, ChevronRight, Swords, Wallet } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser]     = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats]   = useState({
    ligasActivas: 0, torneosActivos: 0, cobrosPendientes: 0, mensajes: 0,
  });
  const [ligasRecientes, setLigasRecientes] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      try {
        const [profileSnap, ligasSnap, torneosSnap, convsSnap] = await Promise.all([
          getDoc(doc(db, "users", u.uid)),
          getDocs(query(collection(db, "leagues"), where("organizerId", "==", u.uid))),
          getDocs(query(collection(db, "tournaments"), where("organizerId", "==", u.uid))),
          getDocs(query(collection(db, "conversations"), where("participants", "array-contains", u.uid))),
        ]);

        if (profileSnap.exists()) setProfile(profileSnap.data());

        const ligasActivas   = ligasSnap.docs.filter(d => d.data().status === "active").length;
        const torneosActivos = torneosSnap.docs.filter(d => d.data().status === "active").length;
        const mensajes       = convsSnap.docs.reduce((sum, d) =>
          sum + Number(d.data().unreadCountBy?.[u.uid] || 0), 0);

        let cobrosPendientes = 0;
        await Promise.all(
          ligasSnap.docs
            .filter(d => d.data().status === "active")
            .map(async (ligaDoc) => {
              const rpSnap = await getDocs(query(
                collection(db, "leagues", ligaDoc.id, "roundPayments"),
                where("status", "in", ["pending_review", "pendingReview"])
              ));
              cobrosPendientes += rpSnap.size;
            })
        );

        setStats({ ligasActivas, torneosActivos, cobrosPendientes, mensajes });

        // Últimas 3 ligas activas
        const recientes = ligasSnap.docs
          .filter(d => d.data().status === "active")
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0))
          .slice(0, 3);
        setLigasRecientes(recientes);

      } catch {}
      finally { setLoading(false); }
    });
    return unsub;
  }, [router]);

  if (loading) return (
    <div className="min-h-screen bg-pn-navy flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const nombre  = profile?.nombre || user?.displayName || user?.email?.split("@")[0] || "Organizador";
  const logoUrl = profile?.organizerLogoURL || profile?.organizerLogoUrl;

  const statCards = [
    { label: "Ligas activas",    value: stats.ligasActivas,     icon: Trophy,       color: "text-blue-600",   bg: "bg-blue-50",   href: "/dashboard/ligas" },
    { label: "Torneos activos",  value: stats.torneosActivos,   icon: Swords,       color: "text-amber-600",  bg: "bg-amber-50",  href: "/dashboard/torneos" },
    { label: "Cobros a revisar", value: stats.cobrosPendientes, icon: Wallet,       color: "text-rose-500",   bg: "bg-rose-50",   href: "/dashboard/cobros" },
    { label: "Mensajes nuevos",  value: stats.mensajes,         icon: MessageSquare,color: "text-sky-500",    bg: "bg-sky-50",    href: "/dashboard/mensajes" },
  ];

  const quickLinks = [
    { icon: Trophy,       label: "Ligas",         sub: "Fixtures y posiciones",        href: "/dashboard/ligas",         color: "bg-blue-500" },
    { icon: Swords,       label: "Torneos",        sub: "Grupos y llaves",              href: "/dashboard/torneos",       color: "bg-amber-500" },
    { icon: Clock,        label: "Turnos",         sub: "Reservas y disponibilidad",    href: "/dashboard/turnos",        color: "bg-violet-500" },
    { icon: Wallet,       label: "Cobros",         sub: "Pagos y comprobantes",         href: "/dashboard/cobros",        color: "bg-emerald-500" },
    { icon: MessageSquare,label: "Mensajes",       sub: "Chat con jugadores",           href: "/dashboard/mensajes",      color: "bg-sky-500" },
    { icon: Bell,         label: "Notificaciones", sub: "Avisos a tu liga",             href: "/dashboard/notificaciones",color: "bg-rose-500" },
    { icon: Users,        label: "Jugadores",      sub: "Gestión de inscriptos",        href: "/dashboard/jugadores",     color: "bg-gray-500" },
  ];

  return (
    <DashboardLayout title="">
      <div className="max-w-5xl">

        {/* ── Bienvenida ── */}
        <div className="flex items-center gap-5 mb-8">
          {logoUrl ? (
            <img src={logoUrl} className="w-16 h-16 rounded-2xl object-cover shadow-md flex-shrink-0" alt="logo" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-pn-green/10 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-black text-pn-green">{nombre[0]?.toUpperCase()}</span>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-400 font-medium">Bienvenido de nuevo</p>
            <h1 className="text-2xl font-black text-pn-navy leading-tight">{nombre}</h1>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {statCards.map(s => (
            <a key={s.label} href={s.href}
              className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div className={`text-3xl font-black ${s.color} mb-1`}>{s.value}</div>
              <div className="text-xs text-gray-400 font-medium">{s.label}</div>
            </a>
          ))}
        </div>

        {/* ── Dos columnas: accesos rápidos + ligas recientes ── */}
        <div className="grid grid-cols-[1fr_340px] gap-6">

          {/* Accesos rápidos */}
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Accesos rápidos</h2>
            <div className="grid grid-cols-2 gap-3">
              {quickLinks.map(link => (
                <a key={link.href} href={link.href}
                  className="group flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all">
                  <div className={`w-11 h-11 rounded-xl ${link.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <link.icon size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-pn-navy text-sm">{link.label}</div>
                    <div className="text-xs text-gray-400 truncate">{link.sub}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-200 group-hover:text-gray-400 transition-colors ml-auto flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>

          {/* Ligas recientes */}
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Ligas activas recientes</h2>
            <div className="flex flex-col gap-3">
              {ligasRecientes.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center text-gray-400">
                  <Trophy size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Sin ligas activas</p>
                  <a href="/dashboard/ligas" className="text-xs text-pn-green font-bold hover:underline mt-1 inline-block">Crear primera liga</a>
                </div>
              ) : (
                <>
                  {ligasRecientes.map((liga: any) => {
                    const logoLiga = liga.organizerLogoUrl || liga.organizerLogoURL || liga.complejo?.organizerLogoUrl || liga.complejo?.organizerLogoURL || logoUrl;
                    return (
                      <a key={liga.id} href={`/dashboard/ligas/${liga.id}`}
                        className="group flex items-center gap-3 bg-white rounded-2xl p-4 border border-gray-100 hover:border-pn-green/30 hover:shadow-md transition-all">
                        {logoLiga
                          ? <img src={logoLiga} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" alt="" />
                          : <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Trophy size={18} className="text-blue-400" />
                            </div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-pn-navy text-sm truncate">{liga.nombre}</div>
                          <div className="text-xs text-gray-400">
                            {liga.categoria} · {liga.players?.length ?? 0} jugadores
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-gray-200 group-hover:text-pn-green transition-colors flex-shrink-0" />
                      </a>
                    );
                  })}
                  <a href="/dashboard/ligas" className="text-center text-xs font-bold text-pn-green hover:text-pn-dark transition-colors py-2">
                    Ver todas las ligas →
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
