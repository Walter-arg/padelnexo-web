"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import {
  Trophy, DollarSign, Users, Clock, LogOut,
  MessageSquare, Bell, LayoutDashboard, RefreshCw, Menu, X
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Inicio",         href: "/dashboard" },
  { icon: Trophy,          label: "Ligas",          href: "/dashboard/ligas" },
  { icon: Trophy,          label: "Torneos",        href: "/dashboard/torneos" },
  { icon: Clock,           label: "Turnos",         href: "/dashboard/turnos" },
  { icon: DollarSign,      label: "Centro de Cobros", href: "/dashboard/cobros" },
  { icon: MessageSquare,   label: "Mensajes",       href: "/dashboard/mensajes" },
  { icon: RefreshCw,       label: "Remplazos",      href: "/dashboard/ligas" },
  { icon: Bell,            label: "Notificaciones", href: "/dashboard/notificaciones" },
  { icon: Users,           label: "Jugadores",      href: "/dashboard/jugadores" },
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
  const [user, setUser]         = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/login");
      else setUser(u);
    });
    return unsub;
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <a href="/dashboard" className="flex items-center gap-2">
          <img src="/logopn.png" alt="PadelNexo" className="h-9 w-auto" />
          <span className="font-black text-app-heading text-base">PadelNexo</span>
        </a>
        {user && (
          <div className="text-xs text-app-muted mt-2 truncate">{user.email}</div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                active
                  ? "bg-pn-green text-white shadow-md shadow-pn-green/20"
                  : "text-gray-500 hover:bg-app-bg hover:text-app-heading"
              }`}
            >
              <item.icon size={17} className={active ? "text-white" : "text-app-muted"} />
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5 pt-2 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold text-red-400 hover:bg-red-50 hover:text-red-500 transition-all w-full"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(160deg, #e8f5ee 0%, #f0faf5 60%, #e8f5f0 100%)" }}>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-white/90 backdrop-blur-sm border-r border-gray-100 fixed h-full z-20 shadow-sm">
        <SidebarContent />
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white flex flex-col shadow-xl">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-gray-400">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">

        {/* Header estilo app */}
        <header className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between md:justify-end mb-1">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-app-muted">
              <Menu size={22} />
            </button>
          </div>
          {/* "PadelNexo" watermark + section title — igual que la app */}
          <div className="text-center mb-2">
            <div className="text-2xl font-black italic text-app-muted/50 tracking-wide select-none">PadelNexo</div>
            <div className="text-xl font-black uppercase text-app-heading tracking-wider">{title}</div>
            {subtitle && <div className="text-sm text-app-muted mt-0.5">{subtitle}</div>}
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
