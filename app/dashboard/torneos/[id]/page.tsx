"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, collection, onSnapshot, updateDoc, addDoc,
  serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ChevronLeft, Users, Grid3X3, GitBranch, CreditCard, Settings,
  Trophy, CheckCircle, Clock, XCircle, PencilLine, Trash2,
  Loader2, X, Plus, Banknote, ArrowLeftRight, Eye, Shield, MapPin,
} from "lucide-react";

// ── Paleta / helpers ────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; tint: string; border: string; accent: string }> = {
  draft:               { label: "Borrador",               tint: "#F3F5F7", border: "#D4DBE2", accent: "#667482" },
  published:           { label: "Publicado",              tint: "#EEF5FF", border: "#BED4F7", accent: "#356CB8" },
  registration_open:   { label: "Inscripciones abiertas", tint: "#D9FF63", border: "#A6D831", accent: "#295400" },
  registration_closed: { label: "Inscripción cerrada",    tint: "#EAF4FF", border: "#A9C8E7", accent: "#2D5B8C" },
  building:            { label: "Armando",                tint: "#F2F0FF", border: "#CDC6F5", accent: "#6751B6" },
  in_progress:         { label: "En juego",               tint: "#EAF6FF", border: "#B5D8F0", accent: "#1C76A7" },
  finished:            { label: "Finalizado",             tint: "#F2F5F7", border: "#CDD6DC", accent: "#576773" },
  cancelled:           { label: "Cancelado",              tint: "#FFF0F0", border: "#E7B8B8", accent: "#B24343" },
};

const REG_STATUS_META: Record<string, { label: string; tint: string; border: string; accent: string }> = {
  confirmed:  { label: "Confirmada",  tint: "#CFF4D8", border: "#72C98B", accent: "#0F5F36" },
  pending:    { label: "Pendiente",   tint: "#FFF6A8", border: "#D7CA22", accent: "#4C3A00" },
  in_review:  { label: "En revisión", tint: "#FFF7E3", border: "#E8D59A", accent: "#9B6A00" },
  rejected:   { label: "Rechazada",   tint: "#FFF1F1", border: "#E6C0C0", accent: "#B24343" },
};

const PAY_STATUS_META: Record<string, { label: string; tint: string; border: string; accent: string }> = {
  approved:  { label: "Aprobado",          tint: "#EEF8F1", border: "#C5E5CF", accent: "#1F7A43" },
  in_review: { label: "En revisión",        tint: "#FFF7E3", border: "#E8D59A", accent: "#9B6A00" },
  rejected:  { label: "Rechazado",          tint: "#FFF1F1", border: "#E6C0C0", accent: "#B24343" },
  pending:   { label: "Pendiente",          tint: "#F3F5F7", border: "#D4DBE2", accent: "#667482" },
};

const BRACKET_ROUND_COLORS = ["#AEEBFF", "#6FCBFF", "#2E8FE8", "#0B4FB3"];
const TITLE_COLORS = ["#E4572E", "#1C7ED6", "#0F9D58", "#C77D00", "#D63384", "#6C5CE7"];
function getTitleColor(seed: string): string {
  let h = 0;
  for (const c of (seed ?? "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TITLE_COLORS[h % TITLE_COLORS.length];
}

function StatusBadge({ status, meta }: { status: string; meta: Record<string, any> }) {
  const m = meta[status] ?? meta[Object.keys(meta)[0]];
  return (
    <span
      className="inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-full border"
      style={{ background: m.tint, borderColor: m.border, color: m.accent, letterSpacing: "0.5px" }}
    >
      {m.label}
    </span>
  );
}

function formatDate(ms?: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

type Tab = "inscripciones" | "grupos" | "bracket" | "pagos" | "gestion";

// ── Modal resultado ─────────────────────────────────────────────────────────
function MatchResultModal({ match, onClose, onSave }: {
  match: any;
  onClose: () => void;
  onSave: (result: { winnerSide: string; sets: { sideA: number; sideB: number }[]; scoreText: string }) => Promise<void>;
}) {
  const [winnerSide, setWinnerSide] = useState<string>(match.winnerPairId ? (match.sideARef === match.winnerPairId ? "sideA" : "sideB") : "");
  const [sets, setSets] = useState<{ sideA: string; sideB: string }[]>(
    match.sets?.length ? match.sets.map((s: any) => ({ sideA: String(s.sideA ?? ""), sideB: String(s.sideB ?? "") }))
      : [{ sideA: "", sideB: "" }, { sideA: "", sideB: "" }]
  );
  const [scoreText, setScoreText] = useState(match.scoreText ?? "");
  const [saving, setSaving] = useState(false);
  const isWO = winnerSide === "walkover";

  async function handleSave() {
    if (!winnerSide) return;
    setSaving(true);
    const filteredSets = isWO ? [] : sets
      .filter(s => s.sideA !== "" || s.sideB !== "")
      .map(s => ({ sideA: parseInt(s.sideA) || 0, sideB: parseInt(s.sideB) || 0 }));
    await onSave({ winnerSide, sets: filteredSets, scoreText: isWO ? "Walkover" : scoreText });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-[20px] p-6 shadow-xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Resultado del partido</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>

        <p className="text-xs font-semibold mb-3" style={{ color: "#5F7D72" }}>¿Quién ganó?</p>

        {/* Selector de ganador */}
        <div className="flex gap-2 mb-2">
          {[
            { side: "sideA", label: match.sideALabel ?? "Pareja A" },
            { side: "sideB", label: match.sideBLabel ?? "Pareja B" },
          ].map(({ side, label }) => (
            <button
              key={side}
              onClick={() => setWinnerSide(side)}
              className="flex-1 rounded-xl py-3 px-2 text-sm font-bold border transition-all text-center"
              style={winnerSide === side
                ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                : { background: "#F6FBF8", color: "#173A2E", borderColor: "#CFE7DC" }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWinnerSide("walkover")}
          className="w-full rounded-xl py-2 text-xs font-bold border mb-4 transition-all"
          style={winnerSide === "walkover"
            ? { background: "#667482", color: "#FFFFFF", borderColor: "#667482" }
            : { background: "#F3F5F7", color: "#667482", borderColor: "#D4DBE2" }}
        >
          Walkover
        </button>

        {/* Sets */}
        {!isWO && (
          <div className="mb-4">
            <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Sets</p>
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-12" style={{ color: "#5F7D72" }}>Set {i + 1}</span>
                <input
                  type="number" min={0} max={7} value={s.sideA}
                  onChange={e => setSets(prev => prev.map((p, j) => j === i ? { ...p, sideA: e.target.value } : p))}
                  className="w-14 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
                <span className="text-xs font-black" style={{ color: "#5F7D72" }}>:</span>
                <input
                  type="number" min={0} max={7} value={s.sideB}
                  onChange={e => setSets(prev => prev.map((p, j) => j === i ? { ...p, sideB: e.target.value } : p))}
                  className="w-14 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
                {sets.length > 1 && (
                  <button onClick={() => setSets(prev => prev.filter((_, j) => j !== i))}>
                    <X size={14} style={{ color: "#B24343" }} />
                  </button>
                )}
              </div>
            ))}
            {sets.length < 3 && (
              <button
                onClick={() => setSets(prev => [...prev, { sideA: "", sideB: "" }])}
                className="text-xs font-bold flex items-center gap-1"
                style={{ color: "#0B8457" }}
              >
                <Plus size={12} /> Agregar set
              </button>
            )}
          </div>
        )}

        {!isWO && (
          <div className="mb-4">
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Score (texto libre)</label>
            <input
              value={scoreText}
              onChange={e => setScoreText(e.target.value)}
              placeholder="ej: 6-4 7-5"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!winnerSide || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: "#0B8457" }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal inscripción ───────────────────────────────────────────────────────
function RegistrationModal({ torneoId, grupos, initial, onClose, onSaved }: {
  torneoId: string;
  grupos: any[];
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p1Name, setP1Name] = useState(initial?.player1Name ?? "");
  const [p2Name, setP2Name] = useState(initial?.player2Name ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pending");
  const [groupId, setGroupId] = useState(initial?.groupId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const data = {
      player1Name: p1Name.trim(),
      player2Name: p2Name.trim(),
      pairLabel: `${p1Name.trim()} / ${p2Name.trim()}`,
      status,
      groupId,
      updatedAt: serverTimestamp(),
    };
    if (initial?.id) {
      await updateDoc(doc(db, "tournaments", torneoId, "registrations", initial.id), data);
    } else {
      await addDoc(collection(db, "tournaments", torneoId, "registrations"), {
        ...data,
        payments: [],
        withdrawalStatus: "none",
        createdAt: serverTimestamp(),
      });
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-[22px] p-6 shadow-xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>
            {initial ? "Editar inscripción" : "Inscribir pareja"}
          </h3>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Jugador 1</label>
            <input value={p1Name} onChange={e => setP1Name(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Jugador 2</label>
            <input value={p2Name} onChange={e => setP2Name(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }}>
              <option value="pending">Pendiente</option>
              <option value="in_review">En revisión</option>
              <option value="confirmed">Confirmada</option>
              <option value="rejected">Rechazada</option>
            </select>
          </div>
          {grupos.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Grupo asignado</label>
              <select value={groupId} onChange={e => setGroupId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }}>
                <option value="">Sin grupo</option>
                {grupos.map(g => <option key={g.id} value={g.id}>Zona {g.name ?? g.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !p1Name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#0B8457" }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function TorneoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const torneoId = params.id as string;

  const [torneo, setTorneo]               = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [grupos, setGrupos]               = useState<any[]>([]);
  const [matches, setMatches]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<Tab>("inscripciones");
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);

  // Modales
  const [matchModal, setMatchModal]   = useState<any | null>(null);
  const [regModal, setRegModal]       = useState<{ open: boolean; initial?: any }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [posterOpen, setPosterOpen]   = useState(false);

  // Gestión
  const [minPairs, setMinPairs]   = useState(2);
  const [maxPairs, setMaxPairs]   = useState(0);
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [championId, setChampionId] = useState("");
  const [runnerUpId, setRunnerUpId] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Firestore listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push("/login"); return; }

      const unsubTorneo = onSnapshot(doc(db, "tournaments", torneoId), (snap) => {
        if (snap.exists()) {
          const d = { id: snap.id, ...snap.data() } as any;
          setTorneo(d);
          setMinPairs(d.minPairs ?? 2);
          setMaxPairs(d.maxPairs ?? 0);
          setShowOccupancy(d.showOccupancyCard ?? false);
          setChampionId(d.championPairId ?? "");
          setRunnerUpId(d.runnerUpPairId ?? "");
        }
        setLoading(false);
      });

      const unsubRegs = onSnapshot(
        query(collection(db, "tournaments", torneoId, "registrations"), orderBy("createdAt", "asc")),
        (snap) => setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      const unsubGroups = onSnapshot(
        collection(db, "tournaments", torneoId, "groups"),
        (snap) => setGrupos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      const unsubMatches = onSnapshot(
        query(collection(db, "tournaments", torneoId, "matches"), orderBy("roundOrder", "asc")),
        (snap) => setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      return () => { unsubTorneo(); unsubRegs(); unsubGroups(); unsubMatches(); };
    });
    return unsubAuth;
  }, [torneoId, router]);

  // ── Guardar resultado de partido ────────────────────────────────────────
  async function handleSaveMatchResult(match: any, { winnerSide, sets, scoreText }: any) {
    const isWO = winnerSide === "walkover";
    const winnerPairId = isWO ? "" : winnerSide === "sideA" ? (match.sideARef ?? "") : (match.sideBRef ?? "");
    const winnerLabel  = winnerSide === "sideA" ? match.sideALabel : winnerSide === "sideB" ? match.sideBLabel : "Walkover";

    await updateDoc(doc(db, "tournaments", torneoId, "matches", match.id), {
      status: "completed",
      winnerPairId,
      scoreText,
      sets,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Propagar ganador al siguiente partido
    if (match.nextMatchId && winnerPairId) {
      const slot = match.nextMatchSlot ?? "sideA";
      const nextRef = doc(db, "tournaments", torneoId, "matches", match.nextMatchId);
      await updateDoc(nextRef, {
        [`${slot}Ref`]:   winnerPairId,
        [`${slot}Label`]: winnerLabel,
        [`${slot}Type`]:  "pair",
        updatedAt: serverTimestamp(),
      });
    }

    // Recalcular standings del grupo si aplica
    if (match.groupId) {
      const groupMatches = [...matches.filter(m => m.groupId === match.groupId)].map(m =>
        m.id === match.id ? { ...m, status: "completed", winnerPairId, sets, scoreText } : m
      );
      const group = grupos.find(g => g.id === match.groupId);
      if (group) {
        const standingsMap: Record<string, any> = {};
        const ensureEntry = (pairId: string, pairLabel: string) => {
          if (!standingsMap[pairId]) standingsMap[pairId] = { pairId, pairLabel, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 };
        };
        for (const m of groupMatches) {
          if (m.status !== "completed" || !m.winnerPairId) continue;
          const loserId = m.winnerPairId === (m.sideARef ?? "") ? (m.sideBRef ?? "") : (m.sideARef ?? "");
          const loserLabel = m.winnerPairId === (m.sideARef ?? "") ? m.sideBLabel : m.sideALabel;
          ensureEntry(m.winnerPairId, m.sideARef === m.winnerPairId ? m.sideALabel : m.sideBLabel);
          ensureEntry(loserId, loserLabel);
          standingsMap[m.winnerPairId].played++; standingsMap[m.winnerPairId].won++; standingsMap[m.winnerPairId].points += 2;
          standingsMap[loserId].played++; standingsMap[loserId].lost++; standingsMap[loserId].points += 1;
          (m.sets ?? []).forEach((s: any) => {
            if (m.winnerPairId === (m.sideARef ?? "")) {
              standingsMap[m.winnerPairId].setsWon += s.sideA ?? 0; standingsMap[m.winnerPairId].setsLost += s.sideB ?? 0;
              standingsMap[loserId].setsWon += s.sideB ?? 0; standingsMap[loserId].setsLost += s.sideA ?? 0;
            } else {
              standingsMap[m.winnerPairId].setsWon += s.sideB ?? 0; standingsMap[m.winnerPairId].setsLost += s.sideA ?? 0;
              standingsMap[loserId].setsWon += s.sideA ?? 0; standingsMap[loserId].setsLost += s.sideB ?? 0;
            }
          });
        }
        const newStandings = Object.values(standingsMap).sort((a: any, b: any) =>
          b.points - a.points || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
        ).map((s: any, i) => ({ ...s, position: i + 1, qualified: i < (group.qualifiedCount ?? 2) }));
        await updateDoc(doc(db, "tournaments", torneoId, "groups", match.groupId), {
          standings: newStandings, updatedAt: serverTimestamp(),
        });
      }
    }

    setMatchModal(null);
    showToast("Resultado guardado.");
  }

  // ── Confirmar pareja ────────────────────────────────────────────────────
  async function confirmRegistration(regId: string) {
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", regId), {
      status: "confirmed", confirmedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    showToast("Pareja confirmada.");
  }

  // ── Eliminar inscripción ────────────────────────────────────────────────
  async function deleteRegistration(regId: string) {
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", regId), {
      status: "rejected", updatedAt: serverTimestamp(),
    });
    setDeleteConfirm(null);
    showToast("Inscripción eliminada.");
  }

  // ── Confirmar baja ──────────────────────────────────────────────────────
  async function confirmWithdrawal(regId: string) {
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", regId), {
      withdrawalStatus: "confirmed", withdrawalConfirmedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    showToast("Baja confirmada.");
  }

  // ── Acciones de pago ────────────────────────────────────────────────────
  async function handlePaymentAction(reg: any, playerIndex: number, newStatus: string) {
    const payments = (reg.payments ?? []).map((p: any, i: number) =>
      i === playerIndex ? { ...p, status: newStatus, reviewedAt: Date.now() } : p
    );
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", reg.id), {
      payments, updatedAt: serverTimestamp(),
    });
    showToast(newStatus === "approved" ? "Pago aprobado." : "Pago rechazado.");
  }

  async function handleSetPaymentMethod(reg: any, playerIndex: number, method: string) {
    const payments = (reg.payments ?? []).map((p: any, i: number) =>
      i === playerIndex ? { ...p, method } : p
    );
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", reg.id), { payments });
  }

  // ── Acciones de gestión ─────────────────────────────────────────────────
  async function handleStatusChange(newStatus: string) {
    setSavingAction(true);
    await updateDoc(doc(db, "tournaments", torneoId), { status: newStatus, updatedAt: serverTimestamp() });
    setSavingAction(false);
    showToast(`Estado actualizado a: ${STATUS_META[newStatus]?.label ?? newStatus}`);
  }

  async function handleSaveCupos() {
    setSavingAction(true);
    await updateDoc(doc(db, "tournaments", torneoId), { minPairs, maxPairs, showOccupancyCard: showOccupancy, updatedAt: serverTimestamp() });
    setSavingAction(false);
    showToast("Cupos guardados.");
  }

  async function handleSaveChampion() {
    setSavingAction(true);
    await updateDoc(doc(db, "tournaments", torneoId), { championPairId: championId, runnerUpPairId: runnerUpId, updatedAt: serverTimestamp() });
    setSavingAction(false);
    showToast("Resultado final guardado.");
  }

  // ── Renders ─────────────────────────────────────────────────────────────
  if (loading) return (
    <DashboardLayout title="Torneos" wide>
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
      </div>
    </DashboardLayout>
  );

  if (!torneo) return (
    <DashboardLayout title="Torneos" wide>
      <p className="text-center py-20" style={{ color: "#5F7D72" }}>Torneo no encontrado.</p>
    </DashboardLayout>
  );

  const titleColor = getTitleColor(torneo.name ?? torneo.nombre ?? "");
  const groupMatches = grupos.length > 0 ? matches.filter(m => m.stage === "groups" || m.groupId) : [];
  const bracketMatches = matches.filter(m => ["final","semifinal","quarterfinal","knockout"].includes(m.stage));
  const hasBracket = bracketMatches.length > 0;
  const hasGrupos = grupos.length > 0 || groupMatches.length > 0;

  const TABS: { id: Tab; label: string; icon: any; badge?: string }[] = [
    { id: "inscripciones", label: "Inscripciones", icon: Users,
      badge: registrations.length > 0 ? `${registrations.length}` : undefined },
    ...(hasGrupos  ? [{ id: "grupos"   as Tab, label: "Grupos",   icon: Grid3X3 }] : []),
    ...(hasBracket ? [{ id: "bracket"  as Tab, label: "Bracket",  icon: GitBranch }] : []),
    ...(torneo.entryFee > 0 ? [{ id: "pagos" as Tab, label: "Pagos", icon: CreditCard }] : []),
    { id: "gestion", label: "Gestión", icon: Settings },
  ];

  // Agrupar bracket por ronda
  const bracketByRound: Record<number, any[]> = {};
  for (const m of bracketMatches) {
    const r = m.roundOrder ?? 0;
    if (!bracketByRound[r]) bracketByRound[r] = [];
    bracketByRound[r].push(m);
  }
  const bracketRounds = Object.entries(bracketByRound)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, ms]) => ms);

  const confirmedRegs = registrations.filter(r => r.status === "confirmed");

  return (
    <DashboardLayout title={torneo.name ?? torneo.nombre ?? "Torneo"} wide>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-white"
          style={{ background: toast.ok ? "#0B8457" : "#B24343" }}
        >
          {toast.msg}
        </div>
      )}

      {/* Poster lightbox */}
      {posterOpen && torneo.coverImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setPosterOpen(false)}>
          <img src={torneo.coverImage} alt="Afiche" className="max-h-[90vh] max-w-full rounded-2xl" onClick={e => e.stopPropagation()} />
          <button className="absolute top-4 right-4 text-white" onClick={() => setPosterOpen(false)}><X size={24} /></button>
        </div>
      )}

      {/* Modales */}
      {matchModal && (
        <MatchResultModal
          match={matchModal}
          onClose={() => setMatchModal(null)}
          onSave={(r) => handleSaveMatchResult(matchModal, r)}
        />
      )}
      {regModal.open && (
        <RegistrationModal
          torneoId={torneoId} grupos={grupos} initial={regModal.initial}
          onClose={() => setRegModal({ open: false })}
          onSaved={() => { setRegModal({ open: false }); showToast("Inscripción guardada."); }}
        />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}>
            <h3 className="font-black mb-2" style={{ color: "#173A2E" }}>¿Eliminar inscripción?</h3>
            <p className="text-sm mb-4" style={{ color: "#5F7D72" }}>La pareja quedará marcada como rechazada.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Cancelar</button>
              <button onClick={() => deleteRegistration(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#B24343" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header card ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:opacity-70" style={{ color: "#5F7D72" }}>
          <ChevronLeft size={15} /> Todos los torneos
        </a>

        <div className="rounded-[22px] p-4 px-6 border relative" style={{ background: "#FFFFFF", borderColor: "rgba(31,171,137,0.12)" }}>
          <div className="relative flex items-center justify-center" style={{ minHeight: 56 }}>
            {/* Logo organizador */}
            {torneo.organizerLogoUrl ? (
              <img src={torneo.organizerLogoUrl} alt="Logo" className="absolute left-0 top-0.5 rounded-full border object-cover" style={{ width: 42, height: 42, borderColor: "#D5EADF" }} />
            ) : (
              <div className="absolute left-0 top-0.5 rounded-full border flex items-center justify-center" style={{ width: 42, height: 42, background: "#F3FAF6", borderColor: "#D5EADF" }}>
                <Shield size={18} style={{ color: STATUS_META[torneo.status]?.accent ?? "#0B8457" }} />
              </div>
            )}

            {/* Título */}
            <div className="text-center px-14">
              <p className="text-[11px] font-black uppercase mb-0.5" style={{ color: "#086847", letterSpacing: "0.8px" }}>TORNEO</p>
              <h1 className="font-bold leading-tight" style={{ fontFamily: "Georgia, serif", fontSize: 22, color: titleColor }}>
                {torneo.name ?? torneo.nombre}
              </h1>
              <div className="mt-1">
                <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
              </div>
            </div>

            {/* Afiche */}
            {torneo.coverImage && (
              <button onClick={() => setPosterOpen(true)} className="absolute right-0 top-0 rounded-xl border overflow-hidden" style={{ width: 36, height: 46, borderColor: "#D5EADF" }}>
                <img src={torneo.coverImage} alt="Afiche" className="w-full h-full object-cover" />
              </button>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            {(torneo.compositionLabel ?? torneo.categoria) && (
              <span className="text-xs font-bold" style={{ color: "#086847" }}>
                🏅 {torneo.compositionLabel ?? torneo.categoria}
              </span>
            )}
            {(torneo.startDateMillis || torneo.endDateMillis) && (
              <>
                <span style={{ color: "#086847" }}>·</span>
                <span className="text-xs font-bold" style={{ color: "#086847" }}>
                  📅 {formatDate(torneo.startDateMillis)}{torneo.endDateMillis ? ` — ${formatDate(torneo.endDateMillis)}` : ""}
                </span>
              </>
            )}
            {(() => {
              const venue = torneo.venues?.[0];
              const name    = venue?.name ?? torneo.complejo?.nombre ?? "";
              const address = venue?.address ?? torneo.complejo?.direccion ?? "";
              const query   = encodeURIComponent(address || name);
              if (!name && !address) return null;
              return (
                <>
                  <span style={{ color: "#086847" }}>·</span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${query}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                    style={{ color: "#086847" }}
                  >
                    <MapPin size={12} />
                    {name || address}
                  </a>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition-all flex-shrink-0"
            style={tab === t.id
              ? { background: "#086847", color: "#FFFFFF", borderColor: "#086847" }
              : { background: "#FFFFFF", color: "#5F7D72", borderColor: "#CFE7DC" }}
          >
            <t.icon size={14} />
            {t.label}
            {t.badge && (
              <span className="ml-1 text-[10px] font-black rounded-full px-1.5" style={tab === t.id ? { background: "rgba(255,255,255,0.25)" } : { background: "#F0F7F4" }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: INSCRIPCIONES
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "inscripciones" && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-black" style={{ color: "#173A2E" }}>
              Parejas inscriptas
              {registrations.length > 0 && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#F0F7F4", color: "#5F7D72" }}>
                  {registrations.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => setRegModal({ open: true })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold text-white"
              style={{ background: "#0B8457" }}
            >
              <Plus size={14} /> Inscribir pareja
            </button>
          </div>

          {registrations.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>No hay inscripciones todavía.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {registrations.map((reg, ri) => {
                const regMeta = REG_STATUS_META[reg.status ?? "pending"];
                return (
                  <div key={reg.id} className="rounded-[18px] border p-3" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    {/* Cabecera */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase" style={{ color: "#5F7D72" }}>PAREJA {ri + 1}</span>
                        <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                          style={{ background: regMeta.tint, borderColor: regMeta.border, color: regMeta.accent }}>
                          {regMeta.label}
                        </span>
                        {reg.groupId && grupos.find(g => g.id === reg.groupId) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC", color: "#5F7D72" }}>
                            Zona {grupos.find(g => g.id === reg.groupId)?.name ?? grupos.find(g => g.id === reg.groupId)?.nombre}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setRegModal({ open: true, initial: reg })}
                          className="rounded-full border p-1.5 hover:opacity-70 transition-opacity"
                          style={{ background: "#EDF7F2", borderColor: "#C9E5D8" }}>
                          <PencilLine size={13} style={{ color: "#086847" }} />
                        </button>
                        <button onClick={() => setDeleteConfirm(reg.id)}
                          className="rounded-full border p-1.5 hover:opacity-70 transition-opacity"
                          style={{ background: "#FFF1F1", borderColor: "#F1C8C8" }}>
                          <Trash2 size={13} style={{ color: "#B24343" }} />
                        </button>
                      </div>
                    </div>

                    {/* Jugadores */}
                    <div className="flex flex-col gap-1.5 mb-2">
                      {[
                        { name: reg.player1Name, label: "Jugador 1" },
                        { name: reg.player2Name, label: "Jugador 2" },
                      ].map((pl, pi) => (
                        <div key={pi} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                          style={{ background: "#F7FAF8", borderColor: "#CFE7DC" }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                            style={{ background: "#EFF2F4", color: "#5F7D72" }}>
                            {pl.name ? pl.name[0].toUpperCase() : "?"}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold" style={{ color: "#173A2E" }}>
                              {pl.name ?? <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>Sin asignar</span>}
                            </p>
                            <p className="text-[11px]" style={{ color: "#5F7D72" }}>{pl.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chips de acción */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {reg.availability ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold rounded-full border px-2.5 py-1"
                          style={{ background: "#EEF9F1", borderColor: "#B7DFBF", color: "#1D7A34" }}>
                          <CheckCircle size={12} /> Disponibilidad OK
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold rounded-full border px-2.5 py-1"
                          style={{ background: "#EBF2FF", borderColor: "#A8C6F0", color: "#4A78C0" }}>
                          <Clock size={12} /> Disponibilidad pendiente
                        </span>
                      )}

                      {reg.withdrawalStatus === "requested" && (
                        <button onClick={() => confirmWithdrawal(reg.id)}
                          className="flex items-center gap-1 text-[11px] font-bold rounded-full border px-2.5 py-1 text-white"
                          style={{ background: "#C27A1C", borderColor: "#C27A1C" }}>
                          Confirmar baja
                        </button>
                      )}

                      {reg.status !== "confirmed" && reg.withdrawalStatus !== "confirmed" && (
                        <button onClick={() => confirmRegistration(reg.id)}
                          className="flex items-center gap-1 text-[11px] font-bold rounded-full border px-2.5 py-1 text-white"
                          style={{ background: "#086847", borderColor: "#086847" }}>
                          <CheckCircle size={12} /> Confirmar pareja
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: GRUPOS
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "grupos" && (
        <div className="flex flex-col gap-4">
          {grupos.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>Las zonas todavía no fueron generadas.</p>
          ) : (
            grupos.map((g) => {
              const gMatches = matches.filter(m => m.groupId === g.id);
              return (
                <div key={g.id} className="rounded-[22px] overflow-hidden border" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                  {/* Header grupo */}
                  <div className="px-5 py-3 font-black text-base border-b" style={{ color: "#173A2E", background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                    Zona {g.name ?? g.nombre}
                  </div>

                  {/* Partidos */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-bold uppercase mb-3" style={{ color: "#5F7D72", letterSpacing: "0.5px" }}>Partidos</p>
                    {gMatches.length === 0 ? (
                      <p className="text-xs italic" style={{ color: "#5F7D72" }}>Sin partidos todavía.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {gMatches.map(m => {
                          const completed = m.status === "completed";
                          const aWon = completed && m.winnerPairId === (m.sideARef ?? "");
                          const bWon = completed && m.winnerPairId === (m.sideBRef ?? "");
                          return (
                            <div key={m.id} className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "#F0F7F4" }}>
                              <span className="flex-1 text-right text-sm font-semibold truncate" style={{ color: aWon ? "#0B8457" : "#173A2E", fontWeight: aWon ? 800 : 500 }}>
                                {m.sideALabel ?? "TBD"}
                              </span>
                              {completed ? (
                                <span className="text-xs font-black px-2 py-1 rounded-lg text-white min-w-[52px] text-center" style={{ background: "#173A2E" }}>
                                  {m.scoreText || (m.sets?.map((s: any) => `${s.sideA}-${s.sideB}`).join(" ")) || "•"}
                                </span>
                              ) : (
                                <span className="text-xs font-black px-2 py-1 rounded-lg min-w-[52px] text-center" style={{ background: "#F0F7F4", color: "#5F7D72" }}>vs</span>
                              )}
                              <span className="flex-1 text-sm font-semibold truncate" style={{ color: bWon ? "#0B8457" : "#173A2E", fontWeight: bWon ? 800 : 500 }}>
                                {m.sideBLabel ?? "TBD"}
                              </span>
                              <button
                                onClick={() => setMatchModal(m)}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 transition-colors"
                                style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}
                              >
                                {completed ? "Editar" : "Resultado"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Standings */}
                  {(g.standings ?? []).length > 0 && (
                    <div className="px-5 pb-4">
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: "#5F7D72", letterSpacing: "0.5px" }}>Posiciones</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ minWidth: 340 }}>
                          <thead>
                            <tr className="text-xs" style={{ borderBottom: "2px solid #CFE7DC", color: "#5F7D72" }}>
                              <th className="py-2 text-left w-6">#</th>
                              <th className="py-2 text-left">Pareja</th>
                              <th className="py-2 text-center w-10" style={{ color: "#086847" }}>Pts</th>
                              <th className="py-2 text-center w-10">PJ</th>
                              <th className="py-2 text-center w-10">PG</th>
                              <th className="py-2 text-center w-10">PP</th>
                              <th className="py-2 text-center w-10">SF</th>
                              <th className="py-2 text-center w-10">SC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.standings.map((s: any, si: number) => (
                              <tr key={s.pairId ?? si} style={{ borderBottom: "1px solid #F0F7F4", background: si === 0 ? "rgba(11,132,87,0.05)" : undefined }}>
                                <td className="py-2 font-black" style={{ color: "#5F7D72" }}>{si + 1}</td>
                                <td className="py-2 font-semibold truncate max-w-[120px]" style={{ color: si === 0 ? "#0B8457" : "#173A2E" }}>
                                  {si === 0 && <Shield size={10} className="inline mr-1" style={{ color: "#0B8457" }} />}
                                  {s.pairLabel}
                                  {s.qualified && (
                                    <span className="ml-1.5 text-[9px] font-black rounded-full px-1.5 py-0.5" style={{ background: "#CFF4D8", color: "#0F5F36" }}>
                                      Clasifica
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-center font-black" style={{ color: "#086847" }}>{s.points ?? 0}</td>
                                <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.played ?? 0}</td>
                                <td className="py-2 text-center font-semibold" style={{ color: "#0B8457" }}>{s.won ?? 0}</td>
                                <td className="py-2 text-center" style={{ color: "#E87070" }}>{s.lost ?? 0}</td>
                                <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.setsWon ?? 0}</td>
                                <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.setsLost ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: BRACKET
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "bracket" && (
        <div className="flex flex-col gap-4">
          {bracketRounds.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>El bracket todavía no fue generado.</p>
          ) : (
            bracketRounds.map((roundMatches, ri) => {
              const bgColor = BRACKET_ROUND_COLORS[Math.min(ri, BRACKET_ROUND_COLORS.length - 1)];
              const isDark = ri >= 2;
              const stageLabel = roundMatches[0]?.stage;
              const roundLabel = stageLabel === "final" ? "Final"
                : stageLabel === "semifinal" ? "Semifinales"
                : stageLabel === "quarterfinal" ? "Cuartos de final"
                : `Ronda ${ri + 1}`;
              return (
                <div key={ri} className="rounded-[22px] overflow-hidden border" style={{ borderColor: "#CFE7DC" }}>
                  <div className="px-5 py-3 font-black text-sm" style={{ background: bgColor, color: isDark ? "#FFFFFF" : "#173A2E" }}>
                    {roundLabel}
                  </div>
                  <div style={{ background: "#FFFFFF" }}>
                    {roundMatches.map((m) => {
                      const completed = m.status === "completed";
                      const aWon = completed && m.winnerPairId && m.winnerPairId === (m.sideARef ?? "");
                      const bWon = completed && m.winnerPairId && m.winnerPairId === (m.sideBRef ?? "");
                      const canEnter = m.sideAType === "pair" && m.sideBType === "pair";
                      return (
                        <div key={m.id} className="flex items-center gap-2 px-4 py-3 border-b last:border-0" style={{ borderColor: "#F0F7F4" }}>
                          <span className="flex-1 text-right text-sm truncate" style={{ color: aWon ? "#0B8457" : m.sideAType === "bye" ? "#CFE7DC" : "#173A2E", fontWeight: aWon ? 800 : 500 }}>
                            {m.sideALabel ?? (m.sideAType === "bye" ? "BYE" : "Por definir")}
                          </span>
                          {completed ? (
                            <span className="text-xs font-black px-2 py-1 rounded-lg text-white min-w-[52px] text-center" style={{ background: "#173A2E" }}>
                              {m.scoreText || (m.sets?.map((s: any) => `${s.sideA}-${s.sideB}`).join(" ")) || "•"}
                            </span>
                          ) : (
                            <span className="text-xs font-black px-2 py-1 rounded-lg min-w-[52px] text-center" style={{ background: "#F0F7F4", color: "#5F7D72" }}>vs</span>
                          )}
                          <span className="flex-1 text-sm truncate" style={{ color: bWon ? "#0B8457" : m.sideBType === "bye" ? "#CFE7DC" : "#173A2E", fontWeight: bWon ? 800 : 500 }}>
                            {m.sideBLabel ?? (m.sideBType === "bye" ? "BYE" : "Por definir")}
                          </span>
                          {canEnter && (
                            <button
                              onClick={() => setMatchModal(m)}
                              className="text-[11px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 transition-colors"
                              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}
                            >
                              {completed ? "Editar" : "Resultado"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: PAGOS
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "pagos" && (
        <div>
          {/* Info de pago */}
          {torneo.entryFee > 0 && (
            <div className="rounded-xl border p-3 mb-4 flex flex-wrap gap-4 text-sm" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
              <span className="font-bold" style={{ color: "#173A2E" }}>Cuota: <span style={{ color: "#0B8457" }}>$ {torneo.entryFee}</span></span>
              {torneo.paymentMethods?.length > 0 && (
                <span style={{ color: "#5F7D72" }}>Métodos: {torneo.paymentMethods.join(", ")}</span>
              )}
              {torneo.paymentAlias && (
                <span style={{ color: "#5F7D72" }}>Alias: <strong style={{ color: "#173A2E" }}>{torneo.paymentAlias}</strong></span>
              )}
            </div>
          )}

          {/* Contadores */}
          {registrations.length > 0 && (() => {
            const allPayments = registrations.flatMap(r => r.payments ?? []);
            const approved = allPayments.filter(p => p.status === "approved").length;
            const inReview = allPayments.filter(p => p.status === "in_review").length;
            const pending  = allPayments.filter(p => !p.status || p.status === "pending").length;
            return (
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 rounded-full border" style={{ background: "#EEF8F1", borderColor: "#C5E5CF", color: "#1F7A43" }}>Aprobados {approved}</span>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full border" style={{ background: "#FFF7E3", borderColor: "#E8D59A", color: "#9B6A00" }}>En revisión {inReview}</span>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full border" style={{ background: "#F3F5F7", borderColor: "#D4DBE2", color: "#667482" }}>Pendientes {pending}</span>
              </div>
            );
          })()}

          {registrations.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>No hay inscriptos todavía.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {registrations.filter(r => r.status !== "rejected").map((reg) => {
                const payments: any[] = reg.payments ?? [];
                return (
                  <div key={reg.id} className="rounded-[18px] border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-bold text-sm" style={{ color: "#173A2E" }}>{reg.pairLabel ?? reg.player1Name}</p>
                      <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                        style={{ background: REG_STATUS_META[reg.status]?.tint, borderColor: REG_STATUS_META[reg.status]?.border, color: REG_STATUS_META[reg.status]?.accent }}>
                        {REG_STATUS_META[reg.status]?.label ?? reg.status}
                      </span>
                    </div>

                    {payments.length === 0 ? (
                      <p className="text-xs" style={{ color: "#5F7D72" }}>Sin datos de pago.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {payments.map((pay, pi) => {
                          const pm = PAY_STATUS_META[pay.status ?? "pending"];
                          return (
                            <div key={pi} className="flex items-center gap-2 rounded-xl border px-3 py-2 flex-wrap" style={{ borderColor: "#F0F7F4" }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold" style={{ color: "#173A2E" }}>{pay.playerName ?? `Jugador ${pi + 1}`}</p>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border inline-block mt-0.5"
                                  style={{ background: pm.tint, borderColor: pm.border, color: pm.accent }}>
                                  {pm.label}
                                </span>
                              </div>

                              {/* Selector de método */}
                              {(!pay.method || pay.status === "pending") && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSetPaymentMethod(reg, pi, "efectivo")}
                                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border transition-colors"
                                    style={pay.method === "efectivo" ? { background: "#086847", color: "#FFFFFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}
                                  >
                                    <Banknote size={11} /> Efectivo
                                  </button>
                                  <button
                                    onClick={() => handleSetPaymentMethod(reg, pi, "transferencia")}
                                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border transition-colors"
                                    style={pay.method === "transferencia" ? { background: "#086847", color: "#FFFFFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}
                                  >
                                    <ArrowLeftRight size={11} /> Transfer.
                                  </button>
                                </div>
                              )}

                              {/* Ver comprobante */}
                              {pay.receiptUrl && (
                                <a href={pay.receiptUrl} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border"
                                  style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}>
                                  <Eye size={11} /> Comprobante
                                </a>
                              )}

                              {/* Acciones */}
                              {pay.status !== "approved" && (
                                <button onClick={() => handlePaymentAction(reg, pi, "approved")}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                                  style={{ background: "#0B8457" }}>
                                  Aprobar
                                </button>
                              )}
                              {(pay.status === "in_review" || pay.status === "approved") && (
                                <button onClick={() => handlePaymentAction(reg, pi, "rejected")}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                                  style={{ borderColor: "#E6C0C0", color: "#B24343", background: "#FFF1F1" }}>
                                  Rechazar
                                </button>
                              )}
                              {pay.status === "approved" && (
                                <button onClick={() => handlePaymentAction(reg, pi, "pending")}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                                  style={{ borderColor: "#D4DBE2", color: "#667482" }}>
                                  Revertir
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: GESTIÓN
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "gestion" && (
        <div className="flex flex-col gap-4 max-w-lg">
          {/* Estado actual */}
          <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
            <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Estado del torneo</p>
            <div className="flex justify-center mb-4">
              <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
            </div>
            <div className="flex flex-col gap-2">
              {torneo.status === "draft" && (
                <button onClick={() => handleStatusChange("published")} disabled={savingAction}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "#0B8457" }}>
                  Publicar torneo
                </button>
              )}
              {["published", "registration_closed"].includes(torneo.status) && (
                <button onClick={() => handleStatusChange("registration_open")} disabled={savingAction}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "#0B8457" }}>
                  Abrir inscripciones
                </button>
              )}
              {torneo.status === "registration_open" && (
                <button onClick={() => handleStatusChange("registration_closed")} disabled={savingAction}
                  className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#FFF7E3", color: "#9B6A00", border: "1px solid #E8D59A" }}>
                  Cerrar inscripciones
                </button>
              )}
              {["registration_closed", "building", "in_progress"].includes(torneo.status) && (
                <button onClick={() => handleStatusChange("finished")} disabled={savingAction}
                  className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#F2F5F7", color: "#576773", border: "1px solid #CDD6DC" }}>
                  Marcar como finalizado
                </button>
              )}
              {!["cancelled", "finished"].includes(torneo.status ?? "") && (
                <button onClick={() => handleStatusChange("cancelled")} disabled={savingAction}
                  className="w-full py-2 text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: "#D64545" }}>
                  Cancelar torneo
                </button>
              )}
            </div>
          </div>

          {/* Cupos */}
          <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
            <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Cupos de parejas</p>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Mínimo</label>
                <input type="number" min={2} value={minPairs} onChange={e => setMinPairs(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Máximo</label>
                <input type="number" min={2} value={maxPairs} onChange={e => setMaxPairs(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} />
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>Mostrar % de cupos cubiertos</span>
              <button
                onClick={() => setShowOccupancy(!showOccupancy)}
                className="relative flex-shrink-0 rounded-full transition-all"
                style={{ width: 46, height: 26, background: showOccupancy ? "#0B8457" : "#CFE7DC" }}
              >
                <span
                  className="absolute top-[3px] rounded-full bg-white transition-all"
                  style={{ width: 20, height: 20, left: showOccupancy ? 23 : 3 }}
                />
              </button>
            </div>
            <button onClick={handleSaveCupos} disabled={savingAction}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "#0B8457" }}>
              {savingAction ? "Guardando…" : "Guardar cupos"}
            </button>
          </div>

          {/* Resultado final */}
          {["in_progress", "finished"].includes(torneo.status ?? "") && (
            <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
              <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Resultado final</p>
              <div className="flex flex-col gap-3 mb-3">
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>🏆 Campeón</label>
                  <select value={championId} onChange={e => setChampionId(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }}>
                    <option value="">Sin definir</option>
                    {confirmedRegs.map(r => <option key={r.id} value={r.id}>{r.pairLabel ?? r.player1Name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>🥈 Subcampeón</label>
                  <select value={runnerUpId} onChange={e => setRunnerUpId(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }}>
                    <option value="">Sin definir</option>
                    {confirmedRegs.map(r => <option key={r.id} value={r.id}>{r.pairLabel ?? r.player1Name}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={handleSaveChampion} disabled={savingAction}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "#0B8457" }}>
                {savingAction ? "Guardando…" : "Guardar resultado"}
              </button>
            </div>
          )}

          {/* Link editar */}
          <a href={`/dashboard/torneos/nueva?edit=${torneoId}`}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-colors hover:opacity-80"
            style={{ borderColor: "#CFE7DC", color: "#173A2E" }}>
            <PencilLine size={14} /> Editar detalles del torneo
          </a>
        </div>
      )}
    </DashboardLayout>
  );
}
