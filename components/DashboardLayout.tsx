"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import {
  LogOut, ChevronDown, UserCircle, Settings, Building2,
  MessageSquare, Bell, X, ChevronRight,
} from "lucide-react";

const navItems = [
  { label: "Inicio",         href: "/dashboard" },
  { label: "Ligas",          href: "/dashboard/ligas" },
  { label: "Torneos",        href: "/dashboard/torneos" },
  { label: "Turnos",         href: "/dashboard/turnos" },
  { label: "Cobros",         href: "/dashboard/cobros" },
  { label: "Jugadores",      href: "/dashboard/jugadores" },
];

type PanelType = "messages" | "notifications" | null;

export default function DashboardLayout({
  children,
  title,
  subtitle,
  wide,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  wide?: boolean;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser]         = useState<User | null>(null);
  const [profile, setProfile]   = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel]       = useState<PanelType>(null);

  // Tiempo real — mensajes no leídos
  const [conversations, setConversations] = useState<any[]>([]);
  const [unreadMsgs, setUnreadMsgs]       = useState(0);

  // Notificaciones (cobros pendientes de verificar)
  const [pendingPayments, setPendingPayments] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch {}

      // Real-time: conversaciones con mensajes sin leer
      const convQ = query(
        collection(db, "conversations"),
        where("participants", "array-contains", u.uid)
      );
      const unsubConv = onSnapshot(convQ, (snap) => {
        const convs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const total = convs.reduce((sum: number, c: any) =>
          sum + Number(c.unreadCountBy?.[u.uid] || 0), 0
        );
        setUnreadMsgs(total);
        setConversations(
          convs
            .filter((c: any) => Number(c.unreadCountBy?.[u.uid] || 0) > 0)
            .sort((a: any, b: any) => (b.lastMessageAt?.seconds ?? 0) - (a.lastMessageAt?.seconds ?? 0))
        );
      });

      // Real-time: ligas activas → cobros pendientes de verificar
      const ligasQ = query(
        collection(db, "leagues"),
        where("organizerId", "==", u.uid),
        where("status", "==", "active")
      );
      const unsubLigas = onSnapshot(ligasQ, async (ligasSnap) => {
        let pending = 0;
        await Promise.all(
          ligasSnap.docs.map(async (ligaDoc) => {
            const rpSnap = await import("firebase/firestore").then(({ getDocs, collection: col, query: q2, where: w }) =>
              getDocs(q2(col(db, "leagues", ligaDoc.id, "roundPayments"), w("status", "in", ["pending_review", "pendingReview", "informo_transferencia", "in_review"])))
            );
            pending += rpSnap.size;
          })
        );
        setPendingPayments(pending);
      });

      return () => { unsubConv(); unsubLigas(); };
    });
    return unsub;
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    document.cookie = "pn_session=; path=/; max-age=0";
    router.push("/login");
  }

  // Cerrar panel al navegar
  useEffect(() => { setPanel(null); }, [pathname]);

  const nombre  = profile?.nombre  || user?.displayName || user?.email?.split("@")[0] || "Organizador";
  const apellido = profile?.apellido || "";
  const logoUrl  = profile?.organizerLogoURL || profile?.organizerLogoUrl;

  const totalNotif = pendingPayments;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Topbar ──────────────────────────────────────────────────── */}
      <header className="bg-pn-navy text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50 gap-4">

        {/* Logo + nav */}
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <a href="/" className="flex-shrink-0">
            <img src="/logopn.png" alt="PadelNexo" className="h-10 w-auto" />
          </a>
          <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <a key={item.href} href={item.href}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    active ? "bg-white/20 text-white" : "text-gray-300 hover:text-white hover:bg-white/10"
                  }`}>
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Mensajes */}
          <button
            onClick={() => setPanel(panel === "messages" ? null : "messages")}
            className={`relative p-2.5 rounded-xl transition-all ${
              panel === "messages" ? "bg-white/25" : "hover:bg-white/10"
            }`}
            title="Mensajes"
          >
            <MessageSquare size={20} className={unreadMsgs > 0 ? "text-white" : "text-gray-400"} />
            {unreadMsgs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-sky-400 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">
                {unreadMsgs > 99 ? "99+" : unreadMsgs}
              </span>
            )}
          </button>

          {/* Notificaciones */}
          <button
            onClick={() => setPanel(panel === "notifications" ? null : "notifications")}
            className={`relative p-2.5 rounded-xl transition-all ${
              panel === "notifications" ? "bg-white/25" : "hover:bg-white/10"
            }`}
            title="Notificaciones"
          >
            <Bell size={20} className={totalNotif > 0 ? "text-white" : "text-gray-400"} />
            {totalNotif > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">
                {totalNotif > 99 ? "99+" : totalNotif}
              </span>
            )}
          </button>

          {/* Divisor */}
          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Avatar + menú */}
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
        </div>
      </header>

      {/* ── Layout principal + panel derecho ────────────────────────── */}
      <div className="flex relative">

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          {title && (
            <div className="px-6 pt-6 pb-2">
              <div className="text-xl font-black uppercase text-pn-navy tracking-wider">{title}</div>
              {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
            </div>
          )}
          <main className={wide ? "max-w-7xl mx-auto px-3 md:px-5 py-6" : "max-w-5xl mx-auto px-4 md:px-6 py-6"}>
            {children}
          </main>
        </div>

        {/* ── Panel derecho deslizable ─────────────────────────────── */}
        {panel && (
          <>
            {/* Overlay semitransparente */}
            <div
              className="fixed inset-0 bg-black/20 z-30"
              onClick={() => setPanel(null)}
            />

            {/* Panel */}
            <aside className="fixed right-0 top-[64px] h-[calc(100vh-64px)] w-96 bg-white shadow-2xl border-l border-gray-100 z-40 flex flex-col">

              {/* Header panel */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex gap-1">
                  <button
                    onClick={() => setPanel("messages")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      panel === "messages" ? "bg-pn-navy text-white" : "text-gray-400 hover:text-pn-navy hover:bg-slate-50"
                    }`}
                  >
                    <MessageSquare size={15} />
                    Mensajes
                    {unreadMsgs > 0 && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${panel === "messages" ? "bg-white/20 text-white" : "bg-sky-100 text-sky-500"}`}>
                        {unreadMsgs}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setPanel("notifications")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      panel === "notifications" ? "bg-pn-navy text-white" : "text-gray-400 hover:text-pn-navy hover:bg-slate-50"
                    }`}
                  >
                    <Bell size={15} />
                    Alertas
                    {totalNotif > 0 && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${panel === "notifications" ? "bg-white/20 text-white" : "bg-red-100 text-red-500"}`}>
                        {totalNotif}
                      </span>
                    )}
                  </button>
                </div>
                <button onClick={() => setPanel(null)} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Contenido panel */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Mensajes ── */}
                {panel === "messages" && (
                  <div>
                    {conversations.length === 0 ? (
                      <div className="text-center py-16 text-gray-400">
                        <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-semibold">Sin mensajes sin leer</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {conversations.map((conv: any) => {
                          const unread = Number(conv.unreadCountBy?.[user?.uid || ""] || 0);
                          const otherName = conv.otherUserName || conv.playerName || "Jugador";
                          const lastMsg   = conv.lastMessage || "";
                          return (
                            <a
                              key={conv.id}
                              href="/dashboard/mensajes"
                              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                            >
                              <div className="w-10 h-10 rounded-full bg-pn-mint flex items-center justify-center font-black text-pn-green text-sm flex-shrink-0">
                                {otherName[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-bold text-pn-navy text-sm truncate">{otherName}</span>
                                  {unread > 0 && (
                                    <span className="bg-sky-400 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2">
                                      {unread}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 truncate">{lastMsg}</p>
                              </div>
                              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <div className="p-4 border-t border-gray-100">
                      <a href="/dashboard/mensajes"
                        className="block text-center text-sm font-bold text-pn-green hover:text-pn-dark transition-colors">
                        Ver todos los mensajes →
                      </a>
                    </div>
                  </div>
                )}

                {/* ── Notificaciones / Alertas ── */}
                {panel === "notifications" && (
                  <div>
                    {totalNotif === 0 ? (
                      <div className="text-center py-16 text-gray-400">
                        <Bell size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-semibold">Sin alertas pendientes</p>
                        <p className="text-xs mt-1 text-gray-300">Todo al día 👍</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {pendingPayments > 0 && (
                          <a href="/dashboard/cobros"
                            className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xl">💰</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-pn-navy text-sm">Cobros a verificar</div>
                              <p className="text-xs text-amber-500 font-semibold">
                                {pendingPayments} pago{pendingPayments !== 1 ? "s" : ""} esperando confirmación
                              </p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                    )}
                    <div className="p-4 border-t border-gray-100">
                      <a href="/dashboard/notificaciones"
                        className="block text-center text-sm font-bold text-pn-green hover:text-pn-dark transition-colors">
                        Enviar notificación a liga →
                      </a>
                    </div>
                  </div>
                )}

              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
