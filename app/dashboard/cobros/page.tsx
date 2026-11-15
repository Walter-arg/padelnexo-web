"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  resolveLeaguePaymentRounds,
  serializeRoundPayments,
  patchRoundPaymentEntry,
} from "@/lib/leaguePayments";
import {
  DollarSign, CheckCircle2, XCircle, Clock, Filter, Eye
} from "lucide-react";

type Filtro = "todos" | "pending_review" | "unpaid" | "paid";
type Origen = "todos" | "liga" | "torneo";

interface PagoItem {
  id: string;
  jugadorNombre: string;
  origen: "liga" | "torneo";
  origenNombre: string;
  origenId: string;
  concepto: string;
  monto?: number;
  status: string;
  comprobanteUrl?: string;
  // Para ligas: donde aplicar el patch.
  roundId?: string;
  participantId?: string;
  // Para torneos: donde aplicar el patch.
  registrationId?: string;
  playerIndex?: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full"><CheckCircle2 size={12} />Pagó</span>;
  if (status === "pending_review")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-full"><Clock size={12} />En revisión</span>;
  if (status === "rejected")
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full"><XCircle size={12} />Rechazado</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full"><XCircle size={12} />Debe</span>;
}

export default function CobrosPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizerName, setOrganizerName] = useState("Organizador");
  const [pagos, setPagos] = useState<PagoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<Filtro>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<Origen>("todos");
  const [comprobanteVer, setComprobanteVer] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

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

      const items: PagoItem[] = [];

      // ── Ligas ────────────────────────────────────────────────────────
      const ligasSnap = await getDocs(
        query(collection(db, "leagues"), where("organizerId", "==", u.uid))
      );
      for (const ligaDoc of ligasSnap.docs) {
        const liga: any = { id: ligaDoc.id, ...ligaDoc.data() };
        const paymentRounds = resolveLeaguePaymentRounds(liga);

        for (const round of paymentRounds) {
          for (const entry of round.entries) {
            // Una fecha que todavia no se jugo (y nunca tuvo ningun pago
            // cargado) no tiene nada que cobrar todavia: se omite para no
            // llenar la lista de obligaciones futuras.
            const hasActivity = entry.paymentStatus !== "pendiente" || Boolean(entry.proofUrl);
            if (entry.completedAtMillis <= 0 && !hasActivity) continue;

            const status =
              entry.paymentStatus === "pagado"
                ? "paid"
                : entry.paymentStatus === "informo_transferencia" || entry.paymentStatus === "in_review"
                  ? "pending_review"
                  : "unpaid";

            items.push({
              id: `liga_${liga.id}_${round.roundId}_${entry.participantId}`,
              jugadorNombre: entry.participantLabel,
              origen: "liga",
              origenNombre: liga.nombre || "Liga",
              origenId: liga.id,
              concepto: round.title,
              monto: round.amountPerEntry || undefined,
              status,
              comprobanteUrl: entry.proofUrl || undefined,
              roundId: round.roundId,
              participantId: entry.participantId,
            });
          }
        }
      }

      // ── Torneos ──────────────────────────────────────────────────────
      const torneosSnap = await getDocs(
        query(collection(db, "tournaments"), where("organizerId", "==", u.uid))
      );
      for (const tDoc of torneosSnap.docs) {
        const torneo: any = tDoc.data();
        const regsSnap = await getDocs(collection(db, "tournaments", tDoc.id, "registrations"));

        for (const regDoc of regsSnap.docs) {
          const reg: any = regDoc.data();
          if (reg.status === "rejected") continue;

          const payments: any[] = Array.isArray(reg.payments) ? reg.payments : [];

          payments.forEach((pay, playerIndex) => {
            const status =
              pay.status === "approved" ? "paid" : pay.status === "in_review" ? "pending_review" : pay.status === "rejected" ? "rejected" : "unpaid";

            items.push({
              id: `torneo_${tDoc.id}_${regDoc.id}_${playerIndex}`,
              jugadorNombre: pay.playerName || `Jugador ${playerIndex + 1}`,
              origen: "torneo",
              origenNombre: torneo.nombre || torneo.name || "Torneo",
              origenId: tDoc.id,
              concepto: "Inscripción",
              monto: pay.amount || torneo.entryFee || undefined,
              status,
              comprobanteUrl: pay.receiptUrl || undefined,
              registrationId: regDoc.id,
              playerIndex,
            });
          });
        }
      }

      setPagos(items);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function aprobar(pago: PagoItem) {
    if (!user) return;
    setProcesando(pago.id);
    try {
      if (pago.origen === "liga" && pago.roundId && pago.participantId) {
        const leagueRef = doc(db, "leagues", pago.origenId);
        const leagueSnap = await getDoc(leagueRef);
        if (!leagueSnap.exists()) return;
        const liga: any = { id: leagueSnap.id, ...leagueSnap.data() };
        const draft = resolveLeaguePaymentRounds(liga);
        const patched = patchRoundPaymentEntry(
          draft,
          pago.roundId,
          pago.participantId,
          {
            paymentStatus: "pagado",
            paymentMethod: "efectivo",
            confirmedAtMillis: Date.now(),
            confirmedBy: user.uid,
            confirmedByName: organizerName,
            rejectedAtMillis: 0,
            rejectedBy: "",
            rejectedByName: "",
          },
          { id: user.uid, name: organizerName }
        );
        await updateDoc(leagueRef, { roundPayments: serializeRoundPayments(patched), updatedAt: serverTimestamp() });
      }

      if (pago.origen === "torneo" && pago.registrationId && pago.playerIndex !== undefined) {
        const regRef = doc(db, "tournaments", pago.origenId, "registrations", pago.registrationId);
        const regSnap = await getDoc(regRef);
        if (!regSnap.exists()) return;
        const reg: any = regSnap.data();
        const payments = (reg.payments ?? []).map((p: any, i: number) =>
          i === pago.playerIndex ? { ...p, status: "approved", reviewedAt: Date.now(), reviewedBy: user.uid, reviewedByName: organizerName } : p
        );
        await updateDoc(regRef, { payments, updatedAt: serverTimestamp() });
      }

      setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, status: "paid" } : p));
    } finally {
      setProcesando(null);
    }
  }

  async function rechazar(pago: PagoItem) {
    if (!user) return;
    setProcesando(pago.id);
    try {
      if (pago.origen === "liga" && pago.roundId && pago.participantId) {
        const leagueRef = doc(db, "leagues", pago.origenId);
        const leagueSnap = await getDoc(leagueRef);
        if (!leagueSnap.exists()) return;
        const liga: any = { id: leagueSnap.id, ...leagueSnap.data() };
        const draft = resolveLeaguePaymentRounds(liga);
        const patched = patchRoundPaymentEntry(
          draft,
          pago.roundId,
          pago.participantId,
          {
            paymentStatus: "pendiente",
            paymentMethod: "",
            proofUrl: "",
            confirmedAtMillis: 0,
            confirmedBy: "",
            confirmedByName: "",
            rejectedAtMillis: Date.now(),
            rejectedBy: user.uid,
            rejectedByName: organizerName,
          },
          { id: user.uid, name: organizerName }
        );
        await updateDoc(leagueRef, { roundPayments: serializeRoundPayments(patched), updatedAt: serverTimestamp() });
        setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, status: "unpaid" } : p));
        return;
      }

      if (pago.origen === "torneo" && pago.registrationId && pago.playerIndex !== undefined) {
        const regRef = doc(db, "tournaments", pago.origenId, "registrations", pago.registrationId);
        const regSnap = await getDoc(regRef);
        if (!regSnap.exists()) return;
        const reg: any = regSnap.data();
        const payments = (reg.payments ?? []).map((p: any, i: number) =>
          i === pago.playerIndex ? { ...p, status: "rejected", reviewedAt: Date.now(), reviewedBy: user.uid, reviewedByName: organizerName } : p
        );
        await updateDoc(regRef, { payments, updatedAt: serverTimestamp() });
        setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, status: "rejected" } : p));
      }
    } finally {
      setProcesando(null);
    }
  }

  const filtrados = pagos.filter(p => {
    const matchStatus = filtroStatus === "todos" || p.status === filtroStatus ||
      (filtroStatus === "unpaid" && p.status === "rejected");
    const matchOrigen = filtroOrigen === "todos" || p.origen === filtroOrigen;
    return matchStatus && matchOrigen;
  });

  const totalPago = pagos.filter(p => p.status === "paid").length;
  const totalPendReview = pagos.filter(p => p.status === "pending_review").length;
  const totalDebe = pagos.filter(p => p.status === "unpaid" || p.status === "rejected").length;
  const montoTotal = pagos
    .filter(p => p.status === "paid" && p.monto)
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
                  {pago.comprobanteUrl && (
                    <button
                      onClick={() => setComprobanteVer(pago.comprobanteUrl!)}
                      className="flex items-center gap-1 text-xs text-pn-green font-semibold hover:underline"
                    >
                      <Eye size={13} /> Ver
                    </button>
                  )}

                  <StatusBadge status={pago.status} />

                  {(pago.status === "pending_review") && (
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

                  {pago.status === "unpaid" && (
                    <button
                      onClick={() => aprobar(pago)}
                      disabled={isProcesando}
                      className="text-xs bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    >
                      {isProcesando ? "..." : "Marcar pagado"}
                    </button>
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
