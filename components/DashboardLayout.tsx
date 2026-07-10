"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, ChevronDown, UserCircle, Settings, Building2 } from "lucide-react";

const navItems = [
  { label: "Inicio",         href: "/dashboard" },
  { label: "Ligas",          href: "/dashboard/ligas" },
  { label: "Torneos",        href: "/dashboard/torneos" },
  { label: "Turnos",         href: "/dashboard/turnos" },
  { label: "Cobros",         href: "/dashboard/cobros" },
  { label: "Mensajes",       href: "/dashboard/mensajes" },
  { label: "Notificaciones", href: "/dashboard/notificaciones" },
  { label: "Jugadores",      href: "/dashboard/jugadores" },
];

export default function DashboardLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch {}
    });
    return unsub;
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    document.cookie = "pn_session=; path=/; max-age=0";
    router.push("/login");
  }

  const nombre  = profile?.nombre || user?.displayName || user?.email?.split("@")[0] || "Organizador";
  const apellido = profile?.apellido || "";
  const logoUrl  = profile?.organizerLogoUrl;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Topbar principal ── */}
      <header className="bg-pn-navy text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">

        {/* Logo + nav desktop */}
        <div className="flex items-center gap-5">
          <a href="/">
            <img src="/logopn.png" alt="PadelNexo" className="h-10 w-auto" />
          </a>
          <nav className="hidden lg:flex items-center gap-0.5">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    active
                      ? "bg-white/20 text-white"
                      : "text-gray-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

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
              <div className="text-xs text-gray-400 truncate max-w-[160px]">{user?.email}</div>
            </div>
            <ChevronDown size={15} className="text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                <a href="/dashboard/perfil" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                  <UserCircle size={16} className="text-pn-green" /> Ver perfil
                </a>
                <a href="/dashboard/perfil?tab=datos" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                  <Settings size={16} className="text-pn-green" /> Modificar datos
                </a>
                <a href="/dashboard/perfil?tab=complejos" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
                  <Building2 size={16} className="text-pn-green" /> Complejos y canchas
                </a>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full">
                    <LogOut size={16} /> Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Nav mobile (scroll horizontal) ── */}
      <nav className="lg:hidden bg-pn-navy border-t border-white/10 px-3 py-2 flex gap-1 overflow-x-auto scrollbar-hide">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                active
                  ? "bg-white/20 text-white"
                  : "text-gray-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* ── Título de sección ── */}
      {title && (
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="text-xl font-black uppercase text-pn-navy tracking-wider">{title}</div>
          {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
