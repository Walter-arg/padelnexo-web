"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  orderBy,
  serverTimestamp,
  onSnapshot,
  increment,
  arrayRemove,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { MessageSquare, Send } from "lucide-react";

export default function MensajesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizerName, setOrganizerName] = useState("Organizador");
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any | null>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);

      try {
        const profileSnap = await getDoc(doc(db, "users", u.uid));
        if (profileSnap.exists()) {
          const profile: any = profileSnap.data();
          const nombre = [profile.nombre, profile.apellido].filter(Boolean).join(" ");
          if (nombre) setOrganizerName(nombre);
        }
      } catch {}

      const q = query(
        collection(db, "conversations"),
        where("participants", "array-contains", u.uid)
      );
      const unsubConv = onSnapshot(q, (snap) => {
        const convs = snap.docs
          .map((d) => {
            const data: any = d.data();
            const participants = Array.isArray(data.participants) ? data.participants : [];
            const otherUserId = participants.find((p: string) => p !== u.uid) || "";
            const hiddenFor = Array.isArray(data.hiddenFor) ? data.hiddenFor : [];

            if (hiddenFor.includes(u.uid)) return null;

            const unreadCountBy = data.unreadCountBy || {};
            const unreadBy = Array.isArray(data.unreadBy) ? data.unreadBy : [];
            const unreadCount = Number(unreadCountBy[u.uid] || 0);

            return {
              id: d.id,
              otherUserId,
              userName: data.participantNames?.[otherUserId] || "Usuario eliminado",
              lastMessage: data.lastMessageText || "Todavía no hay mensajes.",
              updatedAtMillis: data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : 0,
              hasUnread: unreadCount > 0 || unreadBy.includes(u.uid),
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.updatedAtMillis - a.updatedAtMillis);

        setConversaciones(convs as any[]);
        setLoading(false);
      });

      return () => unsubConv();
    });
    return unsub;
  }, [router]);

  // Escuchar mensajes en tiempo real cuando se selecciona conversación
  useEffect(() => {
    if (!seleccionada || !user) return;
    const unsub = onSnapshot(
      query(
        collection(db, "conversations", seleccionada.id, "messages"),
        orderBy("createdAt", "asc")
      ),
      (snap) => setMensajes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Marcar como leída al abrir la conversación.
    updateDoc(doc(db, "conversations", seleccionada.id), {
      [`unreadCountBy.${user.uid}`]: 0,
      unreadBy: arrayRemove(user.uid),
    }).catch(() => {});

    return unsub;
  }, [seleccionada, user]);

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !seleccionada || !user) return;
    setEnviando(true);
    const normalizedText = texto.trim();
    try {
      await addDoc(collection(db, "conversations", seleccionada.id, "messages"), {
        text: normalizedText,
        senderId: user.uid,
        recipientId: seleccionada.otherUserId,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "conversations", seleccionada.id), {
        updatedAt: serverTimestamp(),
        [`unreadCountBy.${seleccionada.otherUserId}`]: increment(1),
        [`unreadCountBy.${user.uid}`]: 0,
        unreadBy: [seleccionada.otherUserId],
        lastMessageText: normalizedText,
        lastMessageSenderId: user.uid,
        [`participantNames.${user.uid}`]: organizerName,
        hiddenFor: arrayRemove(user.uid, seleccionada.otherUserId),
      });

      setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  function formatHora(ts: any) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatFecha(millis: number) {
    if (!millis) return "";
    const d = new Date(millis);
    const hoy = new Date();
    if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  }

  return (
    <DashboardLayout title="Mensajes">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[400px] max-w-5xl">
          {/* Lista conversaciones */}
          <div className={`flex flex-col gap-1 w-full sm:w-72 flex-shrink-0 overflow-y-auto ${seleccionada ? "hidden sm:flex" : "flex"}`}>
            {conversaciones.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-sm">Sin mensajes todavía</p>
                <p className="text-xs mt-1">Los jugadores te escribirán desde la app.</p>
              </div>
            )}
            {conversaciones.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSeleccionada(conv)}
                className={`text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${
                  seleccionada?.id === conv.id ? "bg-pn-green text-white" : "bg-white border border-gray-100 hover:border-pn-green/30 hover:shadow-sm"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm relative ${seleccionada?.id === conv.id ? "bg-white/20 text-white" : "bg-sky-50 text-sky-600"}`}>
                  {conv.userName[0]?.toUpperCase()}
                  {conv.hasUnread && seleccionada?.id !== conv.id && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-sky-400 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm truncate ${seleccionada?.id === conv.id ? "text-white" : "text-pn-navy"}`}>
                    {conv.userName}
                  </div>
                  <div className={`text-xs truncate ${seleccionada?.id === conv.id ? "text-white/70" : "text-gray-400"}`}>
                    {conv.lastMessage}
                  </div>
                </div>
                <div className={`text-xs flex-shrink-0 ${seleccionada?.id === conv.id ? "text-white/60" : "text-gray-400"}`}>
                  {formatFecha(conv.updatedAtMillis)}
                </div>
              </button>
            ))}
          </div>

          {/* Panel de chat */}
          <div className={`flex-1 flex flex-col bg-white rounded-3xl border border-gray-100 overflow-hidden ${!seleccionada ? "hidden sm:flex" : "flex"}`}>
            {!seleccionada ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-semibold">Seleccioná una conversación</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header chat */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                  <button onClick={() => setSeleccionada(null)} className="sm:hidden text-pn-green mr-1">←</button>
                  <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center font-black text-sky-600 text-sm">
                    {seleccionada.userName[0]?.toUpperCase()}
                  </div>
                  <div className="font-bold text-pn-navy text-sm">{seleccionada.userName}</div>
                </div>

                {/* Mensajes */}
                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                  {mensajes.length === 0 && (
                    <p className="text-gray-400 text-xs text-center mt-8">Todavía no hay mensajes en esta conversación.</p>
                  )}
                  {mensajes.map((m) => {
                    const esOrganizador = m.senderId === user?.uid;
                    return (
                      <div key={m.id} className={`flex ${esOrganizador ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                          esOrganizador
                            ? "bg-pn-green text-white rounded-br-sm"
                            : "bg-slate-100 text-pn-navy rounded-bl-sm"
                        }`}>
                          <div>{m.text}</div>
                          <div className={`text-xs mt-1 ${esOrganizador ? "text-white/60 text-right" : "text-gray-400"}`}>
                            {formatHora(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Input mensaje */}
                <form onSubmit={enviarMensaje} className="px-4 py-3 border-t border-gray-100 flex gap-2">
                  <input
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder="Escribí un mensaje..."
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20"
                  />
                  <button
                    type="submit"
                    disabled={enviando || !texto.trim()}
                    className="bg-pn-green hover:bg-pn-dark text-white w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 flex-shrink-0"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
