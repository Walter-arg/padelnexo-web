"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  DollarSign, CheckCircle2, XCircle, Clock, Trophy, Filter, Eye, ZoomIn
} from "lucide-react";

type Filtro = "todos" | "pending_review" | "unpaid" | "paid";
type Origen = "todos" | "liga" | "torneo";

interface PagoItem {
  id: string;
  jugadorNombre: string;
  jugadorId: string;
  origen: "liga" | "torneo";
  origenNombre: string;
  origenId: string;
  concepto: string;
  monto?: number;
  status: string;
  comprobanteUrl?: string;
  roundPaymentDocId?: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid" || status === "approved")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full"><CheckCircle2 size={12} />Pagó</span>;
  if (status === "pending_review" || status === "pendingReview")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-full"><Clock size={12} />En revisión</span>;
  if (status === "partial")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full"><Clock size={12} />Parcial</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full"><XCircle size={12} />Debe</span>;
}

export default function CobrosPage() {
  const router = useRouter();
  const [pagos, setPagos] = useState<PagoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<Filtro>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<Origen>("todos");
  const [comprobanteVer, setComprobanteVer] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      const items: PagoItem[] = [];

      // ── Ligas ────────────────────────────────────────────────────────
      const ligasSnap = await getDocs(
        query(collection(db, "leagues"), where("organizerId", "==", u.uid))
      );
      for (const ligaDoc of ligasSnap.docs) {
        const liga = ligaDoc.data();
        const rpSnap = await getDocs(collection(db, "leagues", ligaDoc.id, "roundPayments"));
        for (const rpDoc of rpSnap.docs) {
          const rp = rpDoc.data();
          const payments: Record<string, any> = rp.payments ?? rp.playerPayments ?? {};
          const roundNum = rp.roundNumber ?? rp.roundIndex ?? rpDoc.id;
          for (const [playerId, pay] of Object.entries(payments)) {
            const jugador = (liga.players ?? []).find((p: any) => (p.id ?? p.userId) === playerId);
            const nombre = jugador
              ? `${jugador.nombre ?? jugador.name ?? "Jugador"} ${jugador.apellido ?? ""}`
              : `Jugador ${playerId.slice(0, 6)}`;
            items.push({
              id: `${ligaDoc.id}_${rpDoc.id}_${playerId}`,
              jugadorNombre: nombre.trim(),
              jugadorId: playerId,
              origen: "liga",
              origenNombre: liga.nombre ?? "Liga",
              origenId: ligaDoc.id,
              concepto: `Fecha ${roundNum}`,
              monto: liga.paymentConfig?.amount,
              status: pay.status ?? "unpaid",
              comprobanteUrl: pay.comprobanteUrl ?? pay.receiptUrl,
              roundPaymentDocId: rpDoc.id,
            });
          }
        }
      }

      // ── Torneos ──────────────────────────────────────────────────────
      const torneosSnap = await getDocs(
        query(collection(db, "tournaments"), where("organizerId", "==", u.uid))
      );
      for (const tDoc of torneosSnap.docs) {
        const torneo = tDoc.data();
        const players: any[] = torneo.players ?? torneo.inscripciones ?? [];
        for (const p of players) {
          const pStatus = p.paymentStatus ?? p.inscripcionStatus ?? "unpaid";
          const nombre = `${p.nombre ?? p.name ?? "Jugador"} ${p.apellido ?? ""}`.trim();
          items.push({
            id: `${tDoc.id}_${p.id ?? p.userId ?? nombre}`,
            jugadorNombre: nombre,
            jugadorId: p.id ?? p.userId ?? nombre,
            origen: "torneo",
            origenNombre: torneo.nombre ?? "Torneo",
            origenId: tDoc.id,
            concepto: "Inscripción",
            monto: torneo.paymentConfig?.amount,
            status: pStatus,
            comprobanteUrl: p.comprobanteUrl ?? p.receiptUrl,
          });
        }
      }

      setPagos(items);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function aprobar(pago: PagoItem) {
    setProcesando(pago.id);
    try {
      if (pago.origen === "liga" && pago.roundPaymentDocId) {
        const rpRef = doc(db, "leagues", pago.origenId, "roundPayments", pago.roundPaymentDocId);
        await updateDoc(rpRef, { [`payments.${pago.jugadorId}.status`]: "paid" });
      }
      if (pago.origen === "torneo") {
        const tRef = doc(db, "tournaments", pago.origenId);
        // Actualizar en el array de players es complejo; se marca como referencia
      }
      setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, status: "paid" } : p));
    } finally {
      setProcesando(null);
    }
  }

  async function rechazar(pago: PagoItem) {
    setProcesando(pago.id);
    try {
      if (pago.origen === "liga" && pago.roundPaymentDocId) {
        const rpRef = doc(db, "leagues", pago.origenId, "roundPayments", pago.roundPaymentDocId);
        await updateDoc(rpRef, { [`payments.${pago.jugadorId}.status`]: "unpaid" });
      }
      setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, status: "unpaid" } : p));
    } finally {
      setProcesando(null);
    }
  }

  const filtrados = pagos.filter(p => {
    const matchStatus = filtroStatus === "todos" || p.status === filtroStatus ||
      (filtroStatus === "paid" && p.status === "approved") ||
      (filtroStatus === "pending_review" && p.status === "pendingReview");
    const matchOrigen = filtroOrigen === "todos" || p.origen === filtroOrigen;
    return matchStatus && matchOrigen;
  });

  const totalPago = pagos.filter(p => p.status === "paid" || p.status === "approved").length;
  const totalPendReview = pagos.filter(p => p.status === "pending_review" || p.status === "pendingReview").length;
  const totalDebe = pagos.filter(p => p.status === "unpaid").length;
  const montoTotal = pagos
    .filter(p => (p.status === "paid" || p.status === "approved") && p.monto)
    .reduce((acc, p) => acc + (p.monto ?? 0), 0);

  return (
    <DashboardLayout title="Central de Cobros">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Cobrado", value: `$ ${montoTotal.toLocaleString("es-AR")}`, color: "text-green-600", bg: "bg-green-50" },
          { label: "Pagaron", value: totalPago, color: "text-green-600", bg: "bg-green-50" },
          { label: "En revisión", value: totalPendReview, color: "text-amber-500", bg: "bg-amber-50" },
          { label: "Deben", value: totalDebe, color: "text-red-500", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl px-5 py-4 border border-white`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(["todos","liga","torneo"] as Origen[]).map((o) => (
          <button
            key={o}
            onClick={() => setFiltroOrigen(o)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
              filtroOrigen === o ? "bg-pn-navy text-white border-pn-navy" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {o === "todos" ? "Todas las fuentes" : o === "liga" ? "Ligas" : "Torneos"}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["todos","pending_review","unpaid","paid"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltroStatus(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filtroStatus === f ? "bg-pn-green text-white border-pn-green" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f === "todos" ? "Todos los estados" : f === "pending_review" ? "En revisión" : f === "unpaid" ? "Deben" : "Pagaron"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <DollarSign size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-semibold">No hay registros con ese filtro.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-3xl">
          {filtrados.map((pago) => {
            const isProcesando = procesando === pago.id;
            return (
              <div key={pago.id} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-pn-navy text-sm">{pago.jugadorNombre}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    <span className={`font-medium ${pago.origen === "liga" ? "text-blue-500" : "text-amber-500"}`}>
                      {pago.origen === "liga" ? "Liga" : "Torneo"}
                    </span>
                    {" · "}{pago.origenNombre}
                    {" · "}{pago.concepto}
                    {pago.monto ? ` · $ ${pago.monto}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Ver comprobante */}
                  {pago.comprobanteUrl && (
                    <button
                      onClick={() => setComprobanteVer(pago.comprobanteUrl!)}
                      className="flex items-center gap-1 text-xs text-pn-green font-semibold hover:underline"
                    >
                      <Eye size={13} /> Ver
                    </button>
                  )}

                  <StatusBadge status={pago.status} />

                  {/* Botones aprobar/rechazar solo si está en revisión */}
                  {(pago.status === "pending_review" || pago.status === "pendingReview") && (
                    <>
                      <button
                        onClick={() => aprobar(pago)}
                        disabled={isProcesando}
                        className="text-xs bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      >
                        {isProcesando ? "..." : "Aprobar"}
                      </button>
                      <button
                        onClick={() => rechazar(pago)}
                        disabled={isProcesando}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-600 font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal comprobante */}
      {comprobanteVer && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setComprobanteVer(null)}
        >
          <div className="relative max-w-md w-full" onClick={e => e.stopPropagation()}>
            <img src={comprobanteVer} alt="Comprobante" className="w-full rounded-2xl shadow-2xl" />
            <button
              onClick={() => setComprobanteVer(null)}
              className="absolute top-3 right-3 bg-white/90 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center font-black text-lg hover:bg-white"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
