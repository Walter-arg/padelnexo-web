"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import {
  Trophy, DollarSign, Users, Clock, LogOut,
  MessageSquare, Bell, ChevronDown, UserCircle, Settings, Building2,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState({
    ligasActivas: 0, torneosActivos: 0, cobrosPendientes: 0, mensajes: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);

      const [profileSnap, ligasSnap, torneosSnap, convsSnap] = await Promise.all([
        getDoc(doc(db, "users", u.uid)),
        getDocs(query(collection(db, "leagues"), where("organizerId", "==", u.uid))),
        getDocs(query(collection(db, "tournaments"), where("organizerId", "==", u.uid))),
        getDocs(query(collection(db, "conversations"), where("organizerId", "==", u.uid))),
      ]);

      if (profileSnap.exists()) setProfile(profileSnap.data());

      const ligasActivas = ligasSnap.docs.filter((d) => d.data().status === "active").length;
      const torneosActivos = torneosSnap.docs.filter((d) => d.data().status === "active").length;
      const mensajes = convsSnap.size;

      let cobrosPendientes = 0;
      await Promise.all(
        ligasSnap.docs
          .filter((d) => d.data().status === "active")
          .map(async (ligaDoc) => {
            const rpSnap = await getDocs(
              query(
                collection(db, "leagues", ligaDoc.id, "roundPayments"),
                where("status", "in", ["pending_review", "pendingReview"])
              )
            );
            cobrosPendientes += rpSnap.size;
          })
      );

      setStats({ ligasActivas, torneosActivos, cobrosPendientes, mensajes });
      setLoadingStats(false);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    document.cookie = "pn_session=; path=/; max-age=0";
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-pn-navy flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const nombre = profile?.nombre || user?.displayName || user?.email?.split("@")[0] || "Organizador";
  const apellido = profile?.apellido || "";
  const logoUrl = profile?.organizerLogoUrl;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-pn-navy text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <a href="/">
          <img src="/logopn.png" alt="PadelNexo" className="h-10 w-auto" />
        </a>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3 py-2"
          >
            {logoUrl ? (
              <img src={logoUrl} className="w-8 h-8 rounded-full object-cover" alt="logo" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pn-green flex items-center justify-center text-white font-bold text-sm">
                {nombre[0]?.toUpperCase()}
              </div>
            )}
            <div className="text-left hidden sm:block">
              <div className="text-sm font-bold leading-tight">{nombre} {apellido}</div>
              <div className="text-xs text-gray-400">{user?.email}</div>
            </div>
            <ChevronDown size={15} className="text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
              <a href="/dashboard/perfil" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                <UserCircle size={16} className="text-pn-green" /> Ver perfil
              </a>
              <a href="/dashboard/perfil?tab=datos" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                <Settings size={16} className="text-pn-green" /> Modificar datos
              </a>
              <a href="/dashboard/perfil?tab=complejos" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                <Building2 size={16} className="text-pn-green" /> Complejos y canchas
              </a>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full">
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Bienvenida */}
        <div className="mb-10">
          <h1 className="text-2xl font-black text-pn-navy">Hola, {nombre} 👋</h1>
          <p className="text-gray-500 mt-1">Bienvenido a tu panel de gestión.</p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Ligas activas",    value: stats.ligasActivas,      color: "text-blue-600",  bg: "bg-blue-50",  href: "/dashboard/ligas" },
            { label: "Torneos activos",  value: stats.torneosActivos,    color: "text-amber-600", bg: "bg-amber-50", href: "/dashboard/torneos" },
            { label: "Cobros a revisar", value: stats.cobrosPendientes,  color: "text-rose-500",  bg: "bg-rose-50",  href: "/dashboard/cobros" },
            { label: "Conversaciones",   value: stats.mensajes,          color: "text-sky-600",   bg: "bg-sky-50",   href: "/dashboard/mensajes" },
          ].map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className={`text-2xl font-black ${s.color} mb-1`}>
                {loadingStats ? (
                  <span className="inline-block w-6 h-6 rounded bg-gray-100 animate-pulse" />
                ) : s.value}
              </div>
              <div className="text-xs text-gray-500 font-medium leading-tight">{s.label}</div>
            </a>
          ))}
        </div>

        {/* CENTRAL DE COBROS — destacada */}
        <a
          href="/dashboard/cobros"
          className="group flex items-center gap-5 w-full bg-gradient-to-r from-pn-navy to-pn-dark rounded-2xl px-6 py-5 mb-8 hover:scale-[1.01] transition-all shadow-lg relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, #c8f53d, transparent)" }} />
          <div className="w-11 h-11 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0 shadow-md">
            <DollarSign size={22} className="text-amber-900" />
          </div>
          <div className="relative flex-1">
            <h2 className="text-base font-black text-white">Central de Cobros</h2>
            <p className="text-gray-400 text-xs">Controlá pagos, comprobantes y deudas de ligas, torneos y turnos</p>
          </div>
          <span className="relative text-pn-lime text-sm font-black">→</span>
        </a>

        {/* Ligas, Torneos, Turnos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Trophy, label: "Ligas", href: "/dashboard/ligas", color: "bg-blue-50 text-blue-600", border: "hover:border-blue-300", desc: "Fixtures, posiciones y jugadores" },
            { icon: Trophy, label: "Torneos", href: "/dashboard/torneos", color: "bg-amber-50 text-amber-600", border: "hover:border-amber-300", desc: "Grupos, llaves y resultados" },
            { icon: Clock, label: "Turnos", href: "/dashboard/turnos", color: "bg-pn-mint text-pn-green", border: "hover:border-pn-green/40", desc: "Reservas y disponibilidad" },
          ].map((s) => (
            <a
              key={s.label}
              href={s.href}
              className={`group bg-white rounded-2xl p-6 border-2 border-transparent ${s.border} hover:shadow-md transition-all duration-200`}
            >
              <div className={`w-11 h-11 rounded-xl ${s.color} flex items-center justify-center mb-4`}>
                <s.icon size={21} />
              </div>
              <h3 className="font-black text-pn-navy text-base mb-1">{s.label}</h3>
              <p className="text-xs text-gray-400">{s.desc}</p>
            </a>
          ))}
        </div>

        {/* Mensajes y Notificaciones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <a href="/dashboard/mensajes" className="flex items-center gap-4 bg-white rounded-2xl p-5 border border-gray-100 hover:border-sky-300 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="font-bold text-pn-navy text-sm">Mensajes</div>
              <div className="text-xs text-gray-400">Conversaciones con jugadores</div>
            </div>
          </a>
          <a href="/dashboard/notificaciones" className="flex items-center gap-4 bg-white rounded-2xl p-5 border border-gray-100 hover:border-rose-300 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
              <Bell size={20} />
            </div>
            <div>
              <div className="font-bold text-pn-navy text-sm">Notificaciones</div>
              <div className="text-xs text-gray-400">Enviá avisos a tu liga</div>
            </div>
          </a>
        </div>

        {/* Jugadores — poco visible */}
        <a href="/dashboard/jugadores" className="flex items-center gap-3 text-sm text-gray-400 hover:text-pn-green transition-colors">
          <Users size={15} />
          <span>Gestión de jugadores</span>
        </a>
      </main>
    </div>
  );
}
