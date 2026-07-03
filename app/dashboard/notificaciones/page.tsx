"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Bell, Send, CheckCircle2, Trophy, Clock } from "lucide-react";

export default function NotificacionesPage() {
  const router = useRouter();
  const [ligas, setLigas] = useState<any[]>([]);
  const [torneos, setTorneos] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [uid, setUid] = useState("");

  // Form state
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [destino, setDestino] = useState<"todos" | "liga" | "torneo">("todos");
  const [destinoId, setDestinoId] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUid(u.uid);

      const [ligasSnap, torneosSnap, histSnap] = await Promise.all([
        getDocs(query(collection(db, "leagues"), where("organizerId", "==", u.uid))),
        getDocs(query(collection(db, "tournaments"), where("organizerId", "==", u.uid))),
        getDocs(query(
          collection(db, "organizerNotifications"),
          where("organizerId", "==", u.uid)
        )),
      ]);

      setLigas(ligasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTorneos(torneosSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setHistorial(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !mensaje.trim()) return;
    setEnviando(true);
    try {
      // Guardar la notificación en Firestore
      // La app móvil escucha esta colección para notificar a los jugadores
      await addDoc(collection(db, "organizerNotifications"), {
        organizerId: uid,
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        destino,
        destinoId: destino !== "todos" ? destinoId : null,
        destinoNombre: destino === "liga"
          ? ligas.find(l => l.id === destinoId)?.nombre
          : destino === "torneo"
          ? torneos.find(t => t.id === destinoId)?.nombre
          : "Todos los jugadores",
        sentAt: serverTimestamp(),
        status: "sent",
      });

      setHistorial(prev => [{
        id: Date.now().toString(),
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        destino,
        destinoNombre: destino === "liga"
          ? ligas.find(l => l.id === destinoId)?.nombre
          : destino === "torneo"
          ? torneos.find(t => t.id === destinoId)?.nombre
          : "Todos",
        sentAt: { seconds: Date.now() / 1000 },
      }, ...prev]);

      setTitulo("");
      setMensaje("");
      setEnviado(true);
      setTimeout(() => setEnviado(false), 3000);
    } finally {
      setEnviando(false);
    }
  }

  function formatFecha(ts: any) {
    if (!ts) return "";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <DashboardLayout title="Notificaciones">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 max-w-5xl">
          {/* Formulario de envío */}
          <div className="flex-1 max-w-lg">
            <div className="bg-white rounded-3xl p-7 border border-gray-100 shadow-sm">
              <h2 className="font-black text-pn-navy text-lg mb-6 flex items-center gap-2">
                <Bell size={18} className="text-rose-500" />
                Enviar notificación
              </h2>

              <form onSubmit={handleEnviar} className="flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">Título</label>
                  <input
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="ej: Recordatorio de pago de fecha 3"
                    required
                    maxLength={80}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">Mensaje</label>
                  <textarea
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    placeholder="ej: Recordamos que el plazo de pago vence el viernes..."
                    required
                    rows={4}
                    maxLength={300}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 resize-none"
                  />
                  <div className="text-right text-xs text-gray-400 mt-1">{mensaje.length}/300</div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Destinatarios</label>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {(["todos","liga","torneo"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setDestino(d); setDestinoId(""); }}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          destino === d ? "bg-pn-navy text-white border-pn-navy" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {d === "todos" ? "Todos mis jugadores" : d === "liga" ? "Una liga" : "Un torneo"}
                      </button>
                    ))}
                  </div>

                  {destino === "liga" && (
                    <select
                      value={destinoId}
                      onChange={e => setDestinoId(e.target.value)}
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green bg-white"
                    >
                      <option value="">Seleccioná una liga...</option>
                      {ligas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  )}

                  {destino === "torneo" && (
                    <select
                      value={destinoId}
                      onChange={e => setDestinoId(e.target.value)}
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green bg-white"
                    >
                      <option value="">Seleccioná un torneo...</option>
                      {torneos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={enviando || enviado}
                  className="flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-black py-3.5 rounded-xl transition-all disabled:opacity-60"
                >
                  {enviado ? (
                    <><CheckCircle2 size={16} /> Enviado</>
                  ) : (
                    <><Send size={16} /> {enviando ? "Enviando..." : "Enviar notificación"}</>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Historial */}
          <div className="flex-1 max-w-lg">
            <h2 className="font-black text-pn-navy text-base mb-4">Historial enviado</h2>
            {historial.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-3xl border border-gray-100">
                <Bell size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">Todavía no enviaste notificaciones</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {historial.map((n) => (
                  <div key={n.id} className="bg-white rounded-2xl px-5 py-4 border border-gray-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-pn-navy text-sm">{n.titulo}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatFecha(n.sentAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2 line-clamp-2">{n.mensaje}</p>
                    <span className="text-xs bg-slate-100 text-gray-500 px-2.5 py-1 rounded-full">
                      {n.destino === "todos" ? "Todos los jugadores" : n.destinoNombre ?? n.destino}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
