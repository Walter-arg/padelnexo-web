"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, collection, onSnapshot, updateDoc, addDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ChevronLeft, ChevronRight, Users, GitBranch, CreditCard, Settings,
  Trophy, CheckCircle, Clock, PencilLine, Trash2,
  Loader2, X, Plus, Banknote, ArrowLeftRight, Eye, Shield, MapPin, Printer, Bell, Send,
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

// ── Bracket layout ───────────────────────────────────────────────────────────
const B_W = 240, B_H = 120, B_COL = 264, B_GAP = 8, B_HDR = 34, B_PAD = 16;

function bracketRoundColor(ri: number, total: number): string {
  if (total <= 1) return BRACKET_ROUND_COLORS[3];
  const idx = Math.round((ri / (total - 1)) * (BRACKET_ROUND_COLORS.length - 1));
  return BRACKET_ROUND_COLORS[Math.min(idx, BRACKET_ROUND_COLORS.length - 1)];
}
function bracketRoundLabel(n: number) {
  if (n === 1) return "Final";
  if (n === 2) return "Semifinales";
  if (n === 4) return "Cuartos";
  if (n === 8) return "Octavos";
  if (n === 16) return "16avos";
  return `Ronda (${n})`;
}
function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function buildBracketLayout(rounds: any[][]) {
  const pos: { x: number; y: number }[][] = [];
  for (let ri = 0; ri < rounds.length; ri++) {
    pos[ri] = [];
    const x = B_PAD + ri * B_COL;
    if (ri === 0) {
      rounds[ri].forEach((_, mi) => { pos[ri][mi] = { x, y: B_PAD + B_HDR + B_GAP + mi * (B_H + B_GAP) }; });
    } else {
      rounds[ri].forEach((_, mi) => {
        const sA = pos[ri - 1]?.[mi * 2], sB = pos[ri - 1]?.[mi * 2 + 1];
        const y = sA && sB ? (sA.y + sB.y + B_H) / 2 - B_H / 2 : sA ? sA.y : B_PAD + B_HDR + B_GAP;
        pos[ri][mi] = { x, y };
      });
    }
  }
  const bw = B_PAD * 2 + rounds.length * B_COL - (B_COL - B_W);
  const maxY = pos.flat().reduce((m, p) => Math.max(m, p.y), 0);
  const bh = maxY + B_H + B_PAD;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let ri = 1; ri < rounds.length; ri++) {
    rounds[ri].forEach((_, mi) => {
      const cur = pos[ri][mi], sA = pos[ri - 1]?.[mi * 2], sB = pos[ri - 1]?.[mi * 2 + 1];
      const midX = cur.x - (B_COL - B_W) / 2, curCY = cur.y + B_H / 2;
      if (sA && sB) {
        const aCY = sA.y + B_H / 2, bCY = sB.y + B_H / 2;
        lines.push({ x1: sA.x + B_W, y1: aCY,   x2: midX,  y2: aCY   });
        lines.push({ x1: sB.x + B_W, y1: bCY,   x2: midX,  y2: bCY   });
        lines.push({ x1: midX,        y1: aCY,   x2: midX,  y2: bCY   });
        lines.push({ x1: midX,        y1: curCY, x2: cur.x, y2: curCY });
      } else if (sA) {
        const aCY = sA.y + B_H / 2;
        lines.push({ x1: sA.x + B_W, y1: aCY, x2: cur.x, y2: aCY });
        if (Math.abs(aCY - curCY) > 1) lines.push({ x1: cur.x, y1: aCY, x2: cur.x, y2: curCY });
      }
    });
  }
  return { pos, bw, bh, lines };
}
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

type Tab = "inscripciones" | "fixture" | "pagos" | "gestion";

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
function RegistrationModal({ torneoId, grupos, initial, onClose, onSaved, onDelete }: {
  torneoId: string;
  grupos: any[];
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
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

        <div className="flex flex-col gap-2">
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
          {initial?.id && onDelete && (
            <button onClick={onDelete}
              className="w-full py-2 rounded-xl text-sm font-bold border"
              style={{ borderColor: "#F1C8C8", color: "#B24343", background: "#FFF1F1" }}>
              Eliminar pareja
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal disponibilidad ─────────────────────────────────────────────────────
function buildDayOptions(startMs?: number, endMs?: number): { key: string; label: string }[] {
  if (!startMs || !endMs) return [];
  const days: { key: string; label: string }[] = [];
  const cur = new Date(startMs);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  while (cur <= end && days.length < 45) {
    const key = cur.toISOString().slice(0, 10);
    const raw = cur.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
    days.push({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

type AvailSlot = { dateKey: string; dayLabel: string; from: string; to: string };

function AvailabilityModal({ torneoId, reg, torneo, onClose }: {
  torneoId: string; reg: any; torneo: any; onClose: () => void;
}) {
  const days = buildDayOptions(torneo?.startDateMillis, torneo?.endDateMillis);

  // Flatten existing availability (customSlots) into a list
  const initSlots: AvailSlot[] = [];
  for (const [dateKey, dayData] of Object.entries(reg.availability ?? {})) {
    const dayLabel = days.find(d => d.key === dateKey)?.label ?? dateKey;
    for (const cs of (dayData as any).customSlots ?? []) {
      initSlots.push({ dateKey, dayLabel, from: cs.from, to: cs.to });
    }
  }

  const [slots, setSlots]   = useState<AvailSlot[]>(initSlots);
  const [adding, setAdding] = useState(false);
  const [newDay, setNewDay] = useState(days[0]?.key ?? "");
  const [newFrom, setNewFrom] = useState("08:00");
  const [newTo, setNewTo]   = useState("10:00");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  function addSlot() {
    if (!newDay || !newFrom || !newTo) { setError("Completá todos los campos."); return; }
    if (newFrom >= newTo) { setError("El horario de inicio debe ser antes del fin."); return; }
    const dayLabel = days.find(d => d.key === newDay)?.label ?? newDay;
    setSlots(prev => [...prev, { dateKey: newDay, dayLabel, from: newFrom, to: newTo }]);
    setAdding(false);
    setError("");
    setNewFrom("08:00");
    setNewTo("10:00");
  }

  async function handleSave() {
    setSaving(true);
    const avail: Record<string, { quickSlots: string[]; customSlots: { from: string; to: string }[] }> = {};
    for (const s of slots) {
      if (!avail[s.dateKey]) avail[s.dateKey] = { quickSlots: [], customSlots: [] };
      avail[s.dateKey].customSlots.push({ from: s.from, to: s.to });
    }
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", reg.id), {
      availability: avail, updatedAt: serverTimestamp(),
    });
    setSaving(false);
    onClose();
  }

  const inputStyle = { borderColor: "#CFE7DC", color: "#173A2E" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-t-[22px] shadow-xl flex flex-col" style={{ background: "#FFFFFF", maxHeight: "80vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #CFE7DC" }}>
          <div>
            <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Horarios disponibles</h3>
            <p className="text-xs mt-0.5" style={{ color: "#5F7D72" }}>{reg.player1Name} / {reg.player2Name}</p>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3">

          {/* Lista de horarios cargados */}
          {slots.length === 0 && !adding && (
            <div className="text-center py-6 rounded-2xl" style={{ background: "#F6FBF8" }}>
              <p className="text-sm font-semibold" style={{ color: "#9BB8AE" }}>Sin horarios cargados</p>
              <p className="text-xs mt-1" style={{ color: "#9BB8AE" }}>Agregá hasta 4 horarios disponibles.</p>
            </div>
          )}

          {slots.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border px-4 py-3"
              style={{ background: "#F0FAF5", borderColor: "#B7DFBF" }}>
              <div>
                <p className="text-[10px] font-black uppercase" style={{ color: "#5F7D72", letterSpacing: "0.5px" }}>{s.dayLabel}</p>
                <p className="text-sm font-black mt-0.5" style={{ color: "#173A2E" }}>{s.from} → {s.to}</p>
              </div>
              <button onClick={() => setSlots(prev => prev.filter((_, j) => j !== i))}
                className="rounded-full p-1.5" style={{ background: "#FFF1F1" }}>
                <X size={12} style={{ color: "#B24343" }} />
              </button>
            </div>
          ))}

          {/* Formulario agregar */}
          {adding && (
            <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ borderColor: "#CFE7DC", background: "#F6FBF8" }}>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Día</label>
                {days.length === 0 ? (
                  <p className="text-xs" style={{ color: "#B24343" }}>El torneo no tiene fechas configuradas.</p>
                ) : (
                  <select value={newDay} onChange={e => setNewDay(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={inputStyle}>
                    {days.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Desde</label>
                  <input type="time" value={newFrom} onChange={e => setNewFrom(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={inputStyle} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Hasta</label>
                  <input type="time" value={newTo} onChange={e => setNewTo(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={inputStyle} />
                </div>
              </div>
              {error && <p className="text-xs font-semibold" style={{ color: "#B24343" }}>{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setAdding(false); setError(""); }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                  Cancelar
                </button>
                <button onClick={addSlot}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#0B8457" }}>
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* Botón agregar horario */}
          {!adding && slots.length < 4 && (
            <button onClick={() => setAdding(true)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border text-sm font-bold"
              style={{ borderColor: "#CFE7DC", color: "#0B8457", background: "#F6FBF8", borderStyle: "dashed" }}>
              <Plus size={14} /> Agregar horario
            </button>
          )}
          {!adding && slots.length >= 4 && (
            <p className="text-xs text-center font-semibold" style={{ color: "#9BB8AE" }}>Máximo de 4 horarios alcanzado.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid #CFE7DC" }}>
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#0B8457" }}>
            {saving ? "Guardando…" : "Guardar horarios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal perfil de jugador ──────────────────────────────────────────────────
function PlayerProfileModal({ player, regName, onClose }: {
  player: any; regName: string; onClose: () => void;
}) {
  const foto = player?.fotoURL || "";
  const fullName = [player?.nombre, player?.apellido].filter(Boolean).join(" ") || regName;
  const MANO: Record<string, string> = { izquierda: "Zurdo", derecha: "Diestro" };
  const LADO: Record<string, string> = { reves: "Revés", drive: "Drive" };

  const rows = [
    player?.ciudad && { label: "Ciudad", value: [player.ciudad, player.provincia].filter(Boolean).join(", ") },
    player?.sexo && { label: "Género", value: player.sexo },
    player?.manoHabil && { label: "Mano hábil", value: MANO[player.manoHabil] ?? player.manoHabil },
    player?.ladoJuego && { label: "Lado", value: LADO[player.ladoJuego] ?? player.ladoJuego },
    player?.mostrarTelefono && player?.telefono && { label: "Teléfono", value: `${player.countryCode ?? "+54"} ${player.telefono}` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-[22px] overflow-hidden shadow-xl" style={{ background: "#FFFFFF" }}>
        <div className="flex flex-col items-center py-6 px-5" style={{ background: "#F0FAF5" }}>
          {foto ? (
            <img src={foto} alt="" className="w-20 h-20 rounded-full object-cover mb-3 border-4" style={{ borderColor: "#FFFFFF" }} />
          ) : (
            <div className="w-20 h-20 rounded-full overflow-hidden mb-3 border-4" style={{ background: "#DDE8E3", borderColor: "#FFFFFF" }}>
              <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
                <circle cx="16" cy="12" r="5.5" fill="#9BB8AE" />
                <path d="M3 30c0-7.18 5.82-13 13-13s13 5.82 13 13" fill="#9BB8AE" />
              </svg>
            </div>
          )}
          <h3 className="font-black text-lg leading-tight text-center" style={{ color: "#173A2E" }}>{fullName}</h3>
          {player?.categoria && (
            <span className="mt-1.5 text-xs font-bold px-3 py-0.5 rounded-full" style={{ background: "#0B845718", color: "#0B8457" }}>
              {player.categoria}
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <div className="px-5 py-4 flex flex-col gap-1">
            {rows.map(r => (
              <div key={r.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid #F0FAF5" }}>
                <span className="text-xs font-bold" style={{ color: "#5F7D72" }}>{r.label}</span>
                <span className="text-xs font-semibold" style={{ color: "#173A2E" }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {player?.descripcion && (
          <div className="px-5 pb-4">
            <p className="text-xs leading-relaxed rounded-xl p-3" style={{ background: "#F6FBF8", color: "#5F7D72" }}>
              {player.descripcion}
            </p>
          </div>
        )}

        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold border"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NewPairDrawer ────────────────────────────────────────────────────────────
function NewPairDrawer({ torneoId, players, onClose, onSaved }: {
  torneoId: string;
  players: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pendingPairs, setPendingPairs] = useState<{ player1: any; player2: any }[]>([]);
  const [selectedPlayer1, setSelectedPlayer1] = useState<any>(null);
  const [activePairSlot, setActivePairSlot] = useState<"player1" | "player2">("player1");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCatFilter, setPickerCatFilter] = useState("");
  const [pickerSexFilter, setPickerSexFilter] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestTarget, setGuestTarget] = useState<"player1" | "player2">("player1");
  const [guestName, setGuestName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestCategoria, setGuestCategoria] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const occupiedIds = new Set(pendingPairs.flatMap(p => [p.player1.id, p.player2.id]).filter(Boolean));

  const categories = Array.from(new Set(players.map((p: any) => p.categoria).filter(Boolean))).sort() as string[];

  const pickerResults = players
    .filter((p: any) => !occupiedIds.has(p.id))
    .filter((p: any) => activePairSlot === "player2" ? p.id !== selectedPlayer1?.id : true)
    .filter((p: any) => !pickerCatFilter || (p.categoria || "") === pickerCatFilter)
    .filter((p: any) => !pickerSexFilter || (p.sexo || "").toLowerCase() === pickerSexFilter.toLowerCase())
    .filter((p: any) => {
      if (!pickerQuery) return true;
      const hay = [p.nombre, p.apellido, p.categoria, p.ciudad].join(" ").toLowerCase();
      return hay.includes(pickerQuery.toLowerCase());
    })
    .slice(0, 25);

  function getDisplayName(p: any) {
    return [p.nombre || p.name || "", p.apellido || ""].filter(Boolean).join(" ").trim() || "Jugador";
  }

  function buildPayload(p: any) {
    return {
      id: p.isGuest ? "" : (p.id || ""),
      name: getDisplayName(p),
      categoria: p.categoria || "",
      ciudad: p.ciudad || "",
      foto: p.foto || "",
      isGuest: !!p.isGuest,
    };
  }

  function openPicker(slot: "player1" | "player2") {
    setActivePairSlot(slot);
    setPickerQuery("");
    setPickerCatFilter("");
    setPickerSexFilter("");
    setPickerOpen(true);
  }

  function handleSelectPlayer(player: any) {
    if (activePairSlot === "player1") {
      setSelectedPlayer1(buildPayload(player));
      setActivePairSlot("player2");
      setPickerQuery("");
    } else {
      if (selectedPlayer1) {
        setPendingPairs(prev => [...prev, { player1: selectedPlayer1, player2: buildPayload(player) }]);
        setSelectedPlayer1(null);
        setActivePairSlot("player1");
        setPickerOpen(false);
      }
    }
  }

  function handleCreateGuest() {
    if (!guestName.trim()) return;
    const guestPlayer = {
      id: `guest-${Date.now()}`,
      name: [guestName.trim(), guestLastName.trim()].filter(Boolean).join(" "),
      categoria: guestCategoria,
      ciudad: "",
      foto: "",
      isGuest: true,
    };
    setGuestOpen(false);
    setGuestName(""); setGuestLastName(""); setGuestCategoria("");
    if (guestTarget === "player1") {
      setSelectedPlayer1(guestPlayer);
      openPicker("player2");
    } else if (selectedPlayer1) {
      setPendingPairs(prev => [...prev, { player1: selectedPlayer1, player2: guestPlayer }]);
      setSelectedPlayer1(null);
      setActivePairSlot("player1");
      setPickerOpen(false);
    }
  }

  async function handleSubmit() {
    if (!pendingPairs.length) return;
    setError("");
    setSubmitting(true);
    try {
      for (const pair of pendingPairs) {
        await addDoc(collection(db, "tournaments", torneoId, "registrations"), {
          player1Id: pair.player1.id,
          player1Name: pair.player1.name,
          player1UserId: pair.player1.id,
          player2Id: pair.player2.id,
          player2Name: pair.player2.name,
          player2UserId: pair.player2.id,
          pairLabel: `${pair.player1.name} / ${pair.player2.name}`,
          status: "confirmed",
          organizerConfirmed: true,
          withdrawalStatus: "none",
          payments: [],
          availability: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "No pudimos cargar las inscripciones.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] flex flex-col overflow-hidden" style={{ background: "#FFFFFF", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: "#CFE7DC" }}>
          <div>
            <h3 className="font-black text-lg" style={{ color: "#173A2E" }}>Inscribir pareja</h3>
            <p className="text-xs" style={{ color: "#5F7D72" }}>Seleccioná los jugadores para cada pareja</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: "#F6FBF8" }}>
            <X size={18} style={{ color: "#5F7D72" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-3">
          {/* Parejas confirmadas */}
          {pendingPairs.map((pair, i) => (
            <div key={i} className="rounded-2xl p-3 border" style={{ background: "#F0FAF5", borderColor: "#B7DFBF" }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={13} style={{ color: "#1D7A34" }} />
                  <span className="text-xs font-black" style={{ color: "#1D7A34" }}>Pareja {i + 1}</span>
                </div>
                <button onClick={() => setPendingPairs(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded-full" style={{ background: "#FFF1F1" }}>
                  <Trash2 size={11} style={{ color: "#B24343" }} />
                </button>
              </div>
              <p className="text-xs font-bold" style={{ color: "#173A2E" }}>J1 · {pair.player1.name}</p>
              <p className="text-xs font-bold" style={{ color: "#173A2E" }}>J2 · {pair.player2.name}</p>
            </div>
          ))}

          {/* Pareja en curso (J1 elegido, esperando J2) */}
          {selectedPlayer1 && !pickerOpen && !guestOpen && (
            <div className="rounded-2xl p-3 border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
              <p className="text-[10px] font-black uppercase mb-2" style={{ color: "#086847" }}>Pareja {pendingPairs.length + 1} — en curso</p>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[11px]" style={{ color: "#5F7D72" }}>Jugador 1 seleccionado:</p>
                  <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{selectedPlayer1.name}</p>
                </div>
                <button onClick={() => { setSelectedPlayer1(null); setActivePairSlot("player1"); }} className="text-[11px] font-bold" style={{ color: "#B24343" }}>Quitar</button>
              </div>
              <button onClick={() => openPicker("player2")}
                className="w-full py-2 rounded-xl text-xs font-black uppercase text-white"
                style={{ background: "#086847" }}>
                + Seleccionar Jugador 2
              </button>
            </div>
          )}

          {/* Botón agregar pareja */}
          {!selectedPlayer1 && (
            <button onClick={() => openPicker("player1")}
              className="w-full py-5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 font-black text-sm uppercase"
              style={{ borderColor: "#C9E5D8", color: "#0B8457", background: "#F6FBF8" }}>
              <Users size={18} />
              {pendingPairs.length > 0 ? "Agregar otra pareja" : "Seleccionar pareja"}
            </button>
          )}

          {error && <p className="text-xs font-bold text-center" style={{ color: "#B24343" }}>{error}</p>}
        </div>

        {/* Footer submit */}
        <div className="px-6 pb-6 pt-3 border-t" style={{ borderColor: "#CFE7DC" }}>
          <button onClick={handleSubmit} disabled={submitting || !pendingPairs.length}
            className="w-full py-4 rounded-2xl font-black text-sm uppercase text-white disabled:opacity-40 transition-opacity"
            style={{ background: "#086847", minHeight: 52 }}>
            {submitting ? "Cargando..." : pendingPairs.length > 1 ? `Cargar ${pendingPairs.length} parejas` : "Cargar pareja"}
          </button>
        </div>
      </div>

      {/* ── Player Picker (nested) ────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-lg rounded-t-[28px] flex flex-col overflow-hidden" style={{ background: "#FFFFFF", maxHeight: "88vh" }}>
            <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#CFE7DC" }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10px] font-black uppercase" style={{ color: "#086847", letterSpacing: "0.8px" }}>PAREJA {pendingPairs.length + 1}</p>
                  <h4 className="font-black text-base" style={{ color: "#173A2E" }}>
                    {activePairSlot === "player1" ? "Seleccioná el Jugador 1" : "Seleccioná el Jugador 2"}
                  </h4>
                </div>
                <button onClick={() => setPickerOpen(false)}><X size={18} style={{ color: "#5F7D72" }} /></button>
              </div>
              <div className="flex gap-1.5 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: "#0B8457" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: activePairSlot === "player2" ? "#0B8457" : "#CFE7DC" }} />
              </div>
              {activePairSlot === "player2" && selectedPlayer1 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ background: "#EEF9F1", border: "1px solid #B7DFBF" }}>
                  <CheckCircle size={12} style={{ color: "#1D7A34" }} />
                  <span className="text-xs font-bold" style={{ color: "#1D7A34" }}>{selectedPlayer1.name} · J1 ✓</span>
                </div>
              )}
              <input value={pickerQuery} onChange={e => setPickerQuery(e.target.value)}
                placeholder="Buscar jugador..." autoFocus
                className="w-full border rounded-xl px-3 py-2 text-sm mb-2"
                style={{ borderColor: "#CFE7DC", color: "#173A2E" }} />
              {categories.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {categories.slice(0, 10).map(cat => (
                    <button key={cat} onClick={() => setPickerCatFilter(v => v === cat ? "" : cat)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0"
                      style={pickerCatFilter === cat
                        ? { background: "#0B8457", color: "#FFFFFF" }
                        : { background: "#F6FBF8", color: "#5F7D72", border: "1px solid #CFE7DC" }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              <button onClick={() => { setPickerOpen(false); setGuestTarget(activePairSlot); setGuestOpen(true); }}
                className="w-full px-6 py-3 text-left text-sm font-bold border-b"
                style={{ color: "#0B8457", borderColor: "#F0F7F4", background: "#FAFFFE" }}>
                + Crear jugador no registrado
              </button>
              {pickerResults.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "#9AB5AB" }}>No encontramos jugadores con ese filtro.</p>
              ) : pickerResults.map((player: any) => (
                <button key={player.id} onClick={() => handleSelectPlayer(player)}
                  className="w-full flex items-center gap-3 px-6 py-3 border-b text-left hover:opacity-80"
                  style={{ borderColor: "#F0F7F4" }}>
                  {player.foto ? (
                    <img src={player.foto} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EFF2F4" }}>
                      <Users size={15} style={{ color: "#9CA3AF" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "#173A2E" }}>
                      {[player.nombre, player.apellido].filter(Boolean).join(" ")}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#5F7D72" }}>
                      {[player.categoria, player.ciudad].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight size={15} style={{ color: "#CFE7DC", flexShrink: 0 }} />
                </button>
              ))}
            </div>
            <div className="px-6 py-4 border-t" style={{ borderColor: "#CFE7DC" }}>
              <button onClick={() => setPickerOpen(false)}
                className="w-full py-3 rounded-2xl text-sm font-bold border"
                style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                {pendingPairs.length > 0 ? "Finalizar" : "Cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Guest player modal ────────────────────────────── */}
      {guestOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-[24px] p-6" style={{ background: "#FFFFFF" }}>
            <h4 className="font-black text-base mb-1" style={{ color: "#173A2E" }}>Jugador no registrado</h4>
            <p className="text-xs mb-4" style={{ color: "#5F7D72" }}>Solo quedará cargado dentro de esta inscripción.</p>
            <div className="flex flex-col gap-3 mb-4">
              <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Nombre *"
                className="border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }} />
              <input value={guestLastName} onChange={e => setGuestLastName(e.target.value)} placeholder="Apellido"
                className="border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }} />
              <input value={guestCategoria} onChange={e => setGuestCategoria(e.target.value)} placeholder="Categoría"
                className="border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setGuestOpen(false); setPickerOpen(true); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Cancelar</button>
              <button onClick={handleCreateGuest} disabled={!guestName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: "#086847" }}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bracket components ───────────────────────────────────────────────────────
function BracketTeamRow({ label, isBye, isWinner, isLoser }: {
  label?: string; isBye?: boolean; isWinner?: boolean; isLoser?: boolean;
}) {
  return (
    <div style={{
      height: 42, display: "flex", alignItems: "center", padding: "0 8px", gap: 6,
      background: isWinner ? "#E8F6F6" : "#FFFFFF",
      borderLeft: `3px solid ${isWinner ? "#1F6F78" : "transparent"}`,
      opacity: isLoser ? 0.45 : 1, flexShrink: 0,
    }}>
      {isBye ? (
        <span style={{ fontSize: 13, fontWeight: 900, color: "#086847", textTransform: "uppercase", width: "100%", textAlign: "center" }}>BYE</span>
      ) : label ? (
        <>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: isWinner ? "#C8E8E6" : "#EFF2F4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: isWinner ? "#1F6F78" : "#5F7D72" }}>{label[0].toUpperCase()}</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 900, color: isWinner ? "#086847" : "#173A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
          {isWinner && <span style={{ fontSize: 8, fontWeight: 900, color: "#FFFFFF", background: "#0B8457", borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>✓</span>}
        </>
      ) : (
        <span style={{ fontSize: 10, fontStyle: "italic", color: "#9AB5AB", paddingLeft: 2 }}>Por definir</span>
      )}
    </div>
  );
}

function BracketMatchCard({ match, color, style, onResultClick }: {
  match: any; color: string; style: React.CSSProperties; onResultClick: () => void;
}) {
  const done   = match.status === "completed";
  const aWon   = done && match.winnerPairId && match.winnerPairId === match.sideARef;
  const bWon   = done && match.winnerPairId && match.winnerPairId === match.sideBRef;
  const aIsBye = match.sideAType === "bye";
  const bIsBye = match.sideBType === "bye";
  const canEnter = match.sideAType === "pair" && match.sideBType === "pair";
  const hasBoth  = (match.sideALabel || aIsBye) && (match.sideBLabel || bIsBye);
  const score    = done ? (match.scoreText || match.sets?.map((s: any) => `${s.sideA}-${s.sideB}`).join(" ") || "•") : null;

  return (
    <div style={{ ...style, width: B_W, height: B_H, borderRadius: 12, border: `1.5px solid ${hexAlpha(color, 0.38)}`, background: hexAlpha(color, 0.12), overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <BracketTeamRow label={match.sideALabel} isBye={aIsBye} isWinner={!!aWon} isLoser={!!bWon} />
      <div style={{ height: 1, background: "#CFE7DC", flexShrink: 0 }} />
      <BracketTeamRow label={match.sideBLabel} isBye={bIsBye} isWinner={!!bWon} isLoser={!!aWon} />
      <div style={{ height: 1, background: "#CFE7DC", flexShrink: 0 }} />
      <div style={{ flex: 1, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px", gap: 6 }}>
        {done ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#173A2E" }}>{score}</span>
            <button onClick={onResultClick} style={{ fontSize: 10, fontWeight: 700, color: "#086847", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Editar</button>
          </>
        ) : canEnter ? (
          <button onClick={onResultClick} style={{ fontSize: 10, fontWeight: 900, color: "#244A66", background: "#EEF4FA", border: "1px solid #B8CCE0", borderRadius: 20, padding: "3px 10px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Cargar resultado
          </button>
        ) : (
          <span style={{ fontSize: 10, color: "#9AB5AB", fontStyle: "italic" }}>
            {hasBoth ? "Esperando resultado" : "Esperando clasificados"}
          </span>
        )}
      </div>
    </div>
  );
}

function BracketBoard({ rounds, onMatchClick, printScale, onPrint }: {
  rounds: any[][]; onMatchClick: (m: any) => void; printScale?: number; onPrint?: (bw: number) => void;
}) {
  if (!rounds.length) return null;
  const { pos, bw, bh, lines } = buildBracketLayout(rounds);
  const scale = printScale ?? 1;

  return (
    <div>
      {onPrint && (
        <div data-print-hide className="flex justify-end mb-3">
          <button
            onClick={() => onPrint(bw)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold border transition-opacity hover:opacity-70"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
          >
            <Printer size={14} /> Imprimir bracket
          </button>
        </div>
      )}
      <div className="print-bracket-wrap -mx-4 sm:mx-0" style={{ overflowX: "auto", overflowY: "visible", paddingBottom: 16 }}>
      <div style={{ position: "relative", width: bw * scale, height: bh * scale, minWidth: bw * scale }}><div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: bw, height: bh, position: "relative" }}>
        <svg style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }} width={bw} height={bh}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#B6CBD9" strokeWidth={2} strokeLinecap="round" />
          ))}
        </svg>

        {rounds.map((roundMatches, ri) => {
          const color  = bracketRoundColor(ri, rounds.length);
          const isDark = color === "#2E8FE8" || color === "#0B4FB3";
          const label  = bracketRoundLabel(roundMatches.length);
          const p0     = pos[ri][0];
          return (
            <div key={ri}>
              <div style={{ position: "absolute", left: p0.x, top: B_PAD, width: B_W, height: B_HDR, background: color, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: isDark ? "#FFFFFF" : "#173A2E", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
              </div>
              {roundMatches.map((match, mi) => (
                <BracketMatchCard
                  key={match.id}
                  match={match}
                  color={color}
                  style={{ position: "absolute", left: pos[ri][mi].x, top: pos[ri][mi].y }}
                  onResultClick={() => onMatchClick(match)}
                />
              ))}
            </div>
          );
        })}
      </div></div></div>
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
  const [players, setPlayers]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<Tab>("inscripciones");
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);
  const [bracketScale, setBracketScale]   = useState(1);

  // Modales
  const [matchModal, setMatchModal]       = useState<any | null>(null);
  const [newPairOpen, setNewPairOpen]     = useState(false);
  const [regModal, setRegModal]           = useState<{ open: boolean; initial?: any }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [posterOpen, setPosterOpen]       = useState(false);
  const [availModal, setAvailModal]       = useState<{ reg: any } | null>(null);
  const [playerProfile, setPlayerProfile] = useState<{ player: any; name: string } | null>(null);

  // Gestión
  const [minPairs, setMinPairs]   = useState(2);
  const [maxPairs, setMaxPairs]   = useState(0);
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [championId, setChampionId] = useState("");
  const [runnerUpId, setRunnerUpId] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Notificaciones
  const [notifTitle,    setNotifTitle]    = useState("");
  const [notifBody,     setNotifBody]     = useState("");
  const [notifAudience, setNotifAudience] = useState<"all" | "confirmed" | "pending_payment">("confirmed");
  const [notifConfirm,  setNotifConfirm]  = useState(false);
  const [sendingNotif,  setSendingNotif]  = useState(false);
  const [notifHistory,  setNotifHistory]  = useState<any[]>([]);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Cargar directorio de jugadores una sola vez
  useEffect(() => {
    getDocs(collection(db, "users"))
      .then(snap => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
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

      const unsubNotifs = onSnapshot(
        query(collection(db, "tournaments", torneoId, "notifications"), orderBy("sentAt", "desc")),
        (snap) => setNotifHistory(snap.docs.slice(0, 5).map(d => ({ id: d.id, ...d.data() })))
      );

      return () => { unsubTorneo(); unsubRegs(); unsubGroups(); unsubMatches(); unsubNotifs(); };
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
    await deleteDoc(doc(db, "tournaments", torneoId, "registrations", regId));
    setDeleteConfirm(null);
    showToast("Pareja eliminada.");
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

  async function handleSendNotification() {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setSendingNotif(true);
    try {
      const targets = registrations.filter(reg => {
        if (notifAudience === "confirmed")       return reg.status === "confirmed";
        if (notifAudience === "pending_payment") return reg.payments?.some((p: any) => p.status !== "approved");
        return true;
      });
      const uids = [...new Set(
        targets.flatMap((r: any) => [r.player1UserId, r.player2UserId].filter(Boolean))
      )] as string[];

      let tokens: string[] = [];
      if (uids.length > 0) {
        const tokenDocs = await Promise.all(uids.map(uid => getDoc(doc(db, "users", uid))));
        tokens = tokenDocs.map(d => d.data()?.expoPushToken).filter(Boolean) as string[];
      }

      if (tokens.length > 0) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(tokens.map(to => ({
            to, sound: "default",
            title: notifTitle.trim(),
            body:  notifBody.trim(),
            data:  { type: "tournament_organizer_message", tournamentId: torneoId },
            channelId: "default",
          }))),
        });
      }

      await addDoc(collection(db, "tournaments", torneoId, "notifications"), {
        title: notifTitle.trim(), body: notifBody.trim(),
        audience: notifAudience, recipientCount: tokens.length,
        sentAt: serverTimestamp(),
      });

      setNotifTitle(""); setNotifBody(""); setNotifConfirm(false);
      showToast(tokens.length > 0
        ? `Notificación enviada a ${tokens.length} dispositivo${tokens.length !== 1 ? "s" : ""}.`
        : "Guardado. No se encontraron tokens activos (la app requiere EAS Build)."
      );
    } catch {
      showToast("Error al enviar la notificación.", false);
    }
    setSendingNotif(false);
  }

  function handlePrintBracket(boardWidth: number) {
    const scale = Math.min(1, 700 / boardWidth);
    setBracketScale(scale);
    setTimeout(() => {
      window.print();
      window.onafterprint = () => setBracketScale(1);
    }, 80);
  }

  function handlePrintList() {
    window.print();
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

  const modules: { id: Tab; label: string; description: string; icon: any; color: string; lightBg: string; lightText: string }[] = [
    {
      id: "inscripciones",
      label: "Inscripciones",
      description: registrations.length > 0 ? `${registrations.length} pareja${registrations.length !== 1 ? "s" : ""} anotada${registrations.length !== 1 ? "s" : ""}` : "Sin inscriptos aún",
      icon: Users,
      color: "bg-blue-600",
      lightBg: "bg-blue-50",
      lightText: "text-blue-700",
    },
    {
      id: "fixture",
      label: "Fixture",
      description: hasGrupos && hasBracket ? "Zonas + Bracket" : hasGrupos ? "Zonas de grupos" : hasBracket ? "Bracket eliminatorio" : "Sin fixture generado",
      icon: GitBranch,
      color: "bg-emerald-600",
      lightBg: "bg-emerald-50",
      lightText: "text-emerald-700",
    },
    {
      id: "pagos",
      label: "Pagos",
      description: torneo.entryFee > 0 ? `Cuota $ ${torneo.entryFee}` : "Sin cuota de inscripción",
      icon: CreditCard,
      color: "bg-amber-500",
      lightBg: "bg-amber-50",
      lightText: "text-amber-700",
    },
    {
      id: "gestion",
      label: "Gestión",
      description: "Estado y configuración",
      icon: Settings,
      color: "bg-slate-600",
      lightBg: "bg-slate-50",
      lightText: "text-slate-700",
    },
  ];

  const activeModule = modules.find(m => m.id === tab) ?? modules[0];

  // Agrupar bracket por ronda
  const bracketByRound: Record<number, any[]> = {};
  for (const m of bracketMatches) {
    const r = m.roundOrder ?? 0;
    if (!bracketByRound[r]) bracketByRound[r] = [];
    bracketByRound[r].push(m);
  }
  const bracketRounds = Object.entries(bracketByRound)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, ms]) => [...ms].sort((a: any, b: any) => (a.matchOrder ?? 0) - (b.matchOrder ?? 0)));

  const confirmedRegs = registrations.filter(r => r.status === "confirmed");

  const torneoName    = torneo.name ?? torneo.nombre ?? "Torneo";
  const printVenue    = torneo.venues?.[0]?.name ?? torneo.complejo?.nombre ?? "";
  const printCategory = torneo.compositionLabel ?? torneo.categoria ?? "";
  const printDate     = [formatDate(torneo.startDateMillis), formatDate(torneo.endDateMillis)].filter(Boolean).join(" — ");

  return (
    <DashboardLayout title={torneoName} wide>
      {/* ── Print styles ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          nav, aside, [data-print-hide] { display: none !important; }
          body { margin: 0; background: white; }
          .print-header { display: block !important; }
          .print-bracket-wrap {
            overflow: visible !important;
            transform-origin: top left;
          }
          .print-reg-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .print-reg-table th, .print-reg-table td {
            border: 1px solid #ccc; padding: 6px 10px; font-size: 11px; text-align: left;
          }
          .print-reg-table th { background: #f0f0f0; font-weight: 900; }
          .print-reg-table tr:nth-child(even) td { background: #fafafa; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-header { display: none; }
        .print-reg-table { display: none; }
        @media print { .print-reg-table { display: table; } }
      `}</style>

      {/* ── Print header (oculto en pantalla) ────────────────────────── */}
      <div className="print-header" style={{ borderBottom: "2px solid #173A2E", paddingBottom: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 900, color: "#5F7D72", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>TORNEO · PADELNEXO</p>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#173A2E", margin: "4px 0 6px", fontFamily: "Georgia, serif" }}>{torneoName}</h1>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#5F7D72" }}>
          {printCategory && <span>🏅 {printCategory}</span>}
          {printDate     && <span>📅 {printDate}</span>}
          {printVenue    && <span>📍 {printVenue}</span>}
          <span style={{ marginLeft: "auto" }}>Impreso: {new Date().toLocaleDateString("es-AR")}</span>
        </div>
      </div>

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
      {newPairOpen && (
        <NewPairDrawer
          torneoId={torneoId} players={players}
          onClose={() => setNewPairOpen(false)}
          onSaved={() => { setNewPairOpen(false); showToast("Pareja inscripta exitosamente."); }}
        />
      )}
      {regModal.open && (
        <RegistrationModal
          torneoId={torneoId} grupos={grupos} initial={regModal.initial}
          onClose={() => setRegModal({ open: false })}
          onSaved={() => { setRegModal({ open: false }); showToast("Inscripción guardada."); }}
          onDelete={regModal.initial?.id ? () => { setRegModal({ open: false }); setDeleteConfirm(regModal.initial!.id); } : undefined}
        />
      )}
      {availModal && (
        <AvailabilityModal
          torneoId={torneoId} reg={availModal.reg} torneo={torneo}
          onClose={() => setAvailModal(null)}
        />
      )}
      {playerProfile && (
        <PlayerProfileModal
          player={playerProfile.player} regName={playerProfile.name}
          onClose={() => setPlayerProfile(null)}
        />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}>
            <h3 className="font-black mb-2" style={{ color: "#173A2E" }}>Eliminar pareja</h3>
            <p className="text-sm mb-4" style={{ color: "#5F7D72" }}>Esta acción quitará la pareja de las inscripciones del torneo.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Cancelar</button>
              <button onClick={() => deleteRegistration(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#B24343" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Back link ─────────────────────────────────────────────────── */}
      <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:opacity-70" style={{ color: "#5F7D72" }}>
        <ChevronLeft size={15} /> Todos los torneos
      </a>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div className="flex gap-6 items-start">

        {/* ── LEFT SIDEBAR ───────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 sticky top-20">
          <div className="rounded-3xl p-6 border" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>

            {/* Logo organizador */}
            {torneo.organizerLogoUrl ? (
              <div className="flex items-center gap-3 mb-4">
                <img src={torneo.organizerLogoUrl} alt="Logo" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" style={{ border: "1px solid #D5EADF" }} />
                {torneo.organizerName && (
                  <span className="text-xs font-bold leading-tight" style={{ color: "#5F7D72" }}>{torneo.organizerName}</span>
                )}
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F3FAF6", border: "1px solid #D5EADF" }}>
                <Trophy size={24} style={{ color: "#0B8457" }} />
              </div>
            )}

            {/* Afiche / cover */}
            {torneo.coverImage && (
              <button
                onClick={() => setPosterOpen(true)}
                className="w-full mb-4 rounded-2xl overflow-hidden"
                style={{ height: 140 }}
              >
                <img src={torneo.coverImage} alt="Afiche" className="w-full h-full object-cover" />
              </button>
            )}

            {/* Nombre */}
            <p className="text-[10px] font-black uppercase mb-1" style={{ color: "#086847", letterSpacing: "1px" }}>TORNEO</p>
            <h2 className="font-bold text-xl leading-tight mb-3" style={{ fontFamily: "Georgia, serif", color: titleColor }}>
              {torneo.name ?? torneo.nombre}
            </h2>

            {/* Status badge */}
            <div className="mb-5">
              <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
            </div>

            {/* Categoría */}
            {(torneo.compositionLabel ?? torneo.categoria) && (
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EEF5FF" }}>
                  <Shield size={13} style={{ color: "#356CB8" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>
                  {torneo.compositionLabel ?? torneo.categoria}
                </span>
              </div>
            )}

            {/* Fechas */}
            {(torneo.startDateMillis || torneo.endDateMillis) && (
              <div className="flex items-start gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#F2F0FF" }}>
                  <Clock size={13} style={{ color: "#6751B6" }} />
                </div>
                <span className="text-sm" style={{ color: "#5F7D72" }}>
                  {formatDate(torneo.startDateMillis)}{torneo.endDateMillis && formatDate(torneo.endDateMillis) !== formatDate(torneo.startDateMillis) ? ` — ${formatDate(torneo.endDateMillis)}` : ""}
                </span>
              </div>
            )}

            {/* Sede con link a Maps */}
            {(() => {
              const venue = torneo.venues?.[0];
              const vname = venue?.name ?? torneo.complejo?.nombre ?? "";
              const address = venue?.address ?? torneo.complejo?.direccion ?? "";
              const q = encodeURIComponent(address || vname);
              if (!vname && !address) return null;
              return (
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#EAF6FF" }}>
                    <MapPin size={13} style={{ color: "#1C76A7" }} />
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${q}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
                    style={{ color: "#1C76A7" }}
                  >
                    {vname || address}
                  </a>
                </div>
              );
            })()}

            {/* Inscriptos */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#F6FBF8" }}>
                <Users size={13} style={{ color: "#0B8457" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>
                {registrations.length} inscripto{registrations.length !== 1 ? "s" : ""}
                {(torneo.maxPairs ?? 0) > 0 ? ` / ${torneo.maxPairs}` : ""}
              </span>
            </div>
          </div>
        </aside>

        {/* ── RIGHT CONTENT ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Mobile header (lg:hidden) */}
          <div className="lg:hidden bg-white rounded-2xl p-4 mb-5 border" style={{ borderColor: "#CFE7DC" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F3FAF6", border: "1px solid #D5EADF" }}>
                <Trophy size={16} style={{ color: "#0B8457" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base truncate leading-tight mb-1" style={{ fontFamily: "Georgia, serif", color: titleColor }}>
                  {torneo.name ?? torneo.nombre}
                </h2>
                <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
              </div>
            </div>
          </div>

          {/* 2×2 Module grid */}
          <div className="grid grid-cols-2 gap-3 mb-6" data-print-hide>
            {modules.map(m => {
              const isActive = tab === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setTab(m.id)}
                  className={`group relative rounded-2xl p-5 text-left transition-all duration-200 border-2 ${
                    isActive
                      ? `${m.lightBg} border-current ${m.lightText} shadow-md`
                      : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                  }`}
                >
                  {isActive && <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${m.color}`} />}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${isActive ? m.color : "bg-slate-100 group-hover:bg-slate-200"}`}>
                    <m.icon size={22} className={isActive ? "text-white" : "text-gray-500"} />
                  </div>
                  <div className="font-black text-base mb-0.5" style={{ color: isActive ? undefined : "#173A2E" }}>
                    {m.label}
                  </div>
                  <div className={`text-xs font-medium ${isActive ? "opacity-70" : "text-gray-400"}`}>
                    {m.description}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Content panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Colored header strip */}
            <div className={`px-6 py-4 flex items-center gap-3 border-b border-gray-100 ${activeModule.lightBg}`} data-print-hide>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${activeModule.color}`}>
                <activeModule.icon size={16} className="text-white" />
              </div>
              <div>
                <h2 className="font-black text-base" style={{ color: "#173A2E" }}>{activeModule.label}</h2>
                <p className="text-xs" style={{ color: "#5F7D72" }}>{activeModule.description}</p>
              </div>
            </div>

            {/* Content body */}
            <div className="p-6">

              {/* ═══════════════════════════════════════════════════════
                  INSCRIPCIONES
              ═══════════════════════════════════════════════════════ */}
              {tab === "inscripciones" && (
                <div>
                  {/* Botón principal */}
                  <button data-print-hide onClick={() => setNewPairOpen(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl font-black uppercase text-white mb-4 transition-opacity hover:opacity-90"
                    style={{ background: "#086847", minHeight: 52, fontSize: 14, letterSpacing: "0.5px" }}>
                    <Users size={18} /> Inscribir nueva pareja
                  </button>

                  {/* Imprimir + conteo */}
                  {registrations.length > 0 && (
                    <div className="flex items-center justify-between mb-4" data-print-hide>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#F0F7F4", color: "#5F7D72" }}>
                        {registrations.length} pareja{registrations.length !== 1 ? "s" : ""}
                      </span>
                      <button onClick={handlePrintList}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold border hover:opacity-70"
                        style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                        <Printer size={13} /> Imprimir
                      </button>
                    </div>
                  )}

                  {/* Tabla impresión */}
                  {registrations.length > 0 && (
                    <table className="print-reg-table">
                      <thead><tr><th>#</th><th>Jugador 1</th><th>Jugador 2</th><th>Estado</th><th>Zona</th></tr></thead>
                      <tbody>
                        {registrations.map((reg, ri) => (
                          <tr key={reg.id}>
                            <td>{ri + 1}</td>
                            <td>{reg.player1Name ?? "—"}</td>
                            <td>{reg.player2Name ?? "—"}</td>
                            <td>{REG_STATUS_META[reg.status]?.label ?? reg.status}</td>
                            <td>{grupos.find(g => g.id === reg.groupId)?.name ?? grupos.find(g => g.id === reg.groupId)?.nombre ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Estado vacío */}
                  {registrations.length === 0 ? (
                    <div data-print-hide className="rounded-2xl border p-8 text-center" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                      <Users size={40} className="mx-auto mb-3" style={{ color: "#CFE7DC" }} />
                      <p className="font-black text-lg mb-1" style={{ color: "#173A2E" }}>Todavía no hay parejas inscriptas</p>
                      <p className="text-sm" style={{ color: "#5F7D72" }}>Cuando lleguen solicitudes o parejas confirmadas, las vas a ver acá.</p>
                    </div>
                  ) : (
                    <div data-print-hide className="flex flex-col gap-3">
                      {registrations.map((reg, ri) => {
                        // Badge de estado (4 estados) — 2 líneas
                        let statusLine1: string, statusLine2: string, statusColor: string;
                        if (reg.withdrawalStatus === "confirmed")       { statusLine1 = "BAJA";      statusLine2 = "CONFIRMADA"; statusColor = "#576773"; }
                        else if (reg.withdrawalStatus === "requested")  { statusLine1 = "BAJA";      statusLine2 = "SOLICITADA"; statusColor = "#B66A16"; }
                        else if (reg.status === "confirmed")            { statusLine1 = "PAREJA";    statusLine2 = "CONFIRMADA"; statusColor = "#1D7A34"; }
                        else                                            { statusLine1 = "PENDIENTE"; statusLine2 = "A CONFIRMAR"; statusColor = "#B24343"; }

                        const hasAvailability = Object.keys(reg.availability || {}).length > 0;

                        return (
                          <div key={reg.id} className="rounded-[18px] border-2 p-3" style={{ background: "#FFFFFF", borderColor: "#A8CFBC" }}>
                            {/* Fila principal: número | jugadores | acciones */}
                            <div className="flex items-center gap-2 mb-2">
                              {/* Pareja # */}
                              <div className="flex-shrink-0 flex flex-col items-center leading-none w-11">
                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#9BB8AE" }}>PAREJA</span>
                                <span className="text-2xl font-black" style={{ color: "#173A2E" }}>{ri + 1}</span>
                              </div>

                              {/* Jugadores lado a lado */}
                              <div className="flex gap-1.5 flex-1 min-w-0">
                                {[
                                  { id: reg.player1Id || reg.player1UserId, name: reg.player1Name },
                                  { id: reg.player2Id || reg.player2UserId, name: reg.player2Name },
                                ].filter(pl => pl.name).map((pl, pi) => {
                                  const pd = players.find((p: any) => p.id && p.id === pl.id);
                                  const foto = pd?.fotoURL || pd?.foto || "";
                                  return (
                                    <button key={pi} onClick={() => { const pd = players.find((p: any) => p.id === pl.id); if (pd) setPlayerProfile({ player: pd, name: pl.name ?? "" }); }} className="flex items-center gap-1 rounded-xl border px-1.5 py-1 min-w-0 text-left" style={{ flex: "1 1 0", background: "#F7FAF8", borderColor: "#CFE7DC" }}>
                                      {foto ? (
                                        <img src={foto} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                      ) : (
                                        <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden" style={{ background: "#DDE8E3" }}>
                                          <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
                                            <circle cx="16" cy="12" r="5.5" fill="#9BB8AE" />
                                            <path d="M3 30c0-7.18 5.82-13 13-13s13 5.82 13 13" fill="#9BB8AE" />
                                          </svg>
                                        </div>
                                      )}
                                      <p className="text-[12px] font-bold leading-tight truncate" style={{ color: "#173A2E" }}>{pl.name}</p>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Estado + Horarios + Editar */}
                              <div className="flex-shrink-0 flex items-center gap-2">
                                {/* Estado — 2 líneas */}
                                <div className="flex flex-col items-center rounded-lg border px-2.5 py-1 text-center leading-snug"
                                  style={{ color: statusColor, background: statusColor + "18", borderColor: statusColor + "40" }}>
                                  <span className="text-[10px] font-black uppercase">{statusLine1}</span>
                                  <span className="text-[10px] font-black uppercase">{statusLine2}</span>
                                </div>
                                {/* Horarios — 2 líneas, clickeable */}
                                <button onClick={() => setAvailModal({ reg })}
                                  className="flex flex-col items-center rounded-lg border px-2.5 py-1 text-center leading-snug cursor-pointer"
                                  style={hasAvailability
                                    ? { background: "#EEF9F1", borderColor: "#B7DFBF", color: "#1D7A34" }
                                    : { background: "#EBF2FF", borderColor: "#A8C6F0", color: "#4A78C0" }}>
                                  <span className="text-[10px] font-black uppercase">HORARIOS</span>
                                  <span className="text-[10px] font-black uppercase">{hasAvailability ? "CARGADOS" : "PENDIENTES"}</span>
                                </button>
                                {/* Editar (incluye eliminar dentro) */}
                                <button onClick={() => setRegModal({ open: true, initial: reg })}
                                  className="rounded-full border p-2"
                                  style={{ background: "#EDF7F2", borderColor: "#C9E5D8" }}>
                                  <PencilLine size={13} style={{ color: "#086847" }} />
                                </button>
                              </div>
                            </div>

                            {/* Acciones extra condicionales */}
                            {(reg.withdrawalStatus === "requested" || (reg.status !== "confirmed" && reg.withdrawalStatus !== "requested" && reg.withdrawalStatus !== "confirmed")) && (
                              <div className="flex items-center justify-center gap-2 mt-2">
                                {reg.withdrawalStatus === "requested" && (
                                  <button onClick={() => confirmWithdrawal(reg.id)}
                                    className="text-[10px] font-bold rounded-full border px-2.5 py-0.5 text-white"
                                    style={{ background: "#C27A1C", borderColor: "#C27A1C" }}>
                                    Confirmar baja
                                  </button>
                                )}
                                {reg.status !== "confirmed" && reg.withdrawalStatus !== "requested" && reg.withdrawalStatus !== "confirmed" && (
                                  <button onClick={() => confirmRegistration(reg.id)}
                                    className="flex items-center gap-1 text-[10px] font-bold rounded-full border px-2.5 py-0.5 text-white"
                                    style={{ background: "#086847", borderColor: "#086847" }}>
                                    <CheckCircle size={10} /> Confirmar pareja
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  FIXTURE (Zonas + Bracket)
              ═══════════════════════════════════════════════════════ */}
              {tab === "fixture" && (
                <div>
                  {!hasGrupos && !hasBracket && (
                    <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>El fixture todavía no fue generado.</p>
                  )}

                  {/* Zonas */}
                  {hasGrupos && (
                    <div className={hasBracket ? "mb-8" : ""}>
                      {hasBracket && (
                        <p className="text-xs font-black uppercase mb-3" style={{ color: "#5F7D72", letterSpacing: "0.8px" }}>ZONAS DE GRUPOS</p>
                      )}
                      <div className="flex flex-col gap-4">
                        {grupos.map((g) => {
                          const gMatches = matches.filter(m => m.groupId === g.id);
                          return (
                            <div key={g.id} className="rounded-[22px] overflow-hidden border" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                              <div className="px-5 py-3 font-black text-base border-b" style={{ color: "#173A2E", background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                                Zona {g.name ?? g.nombre}
                              </div>
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
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bracket */}
                  {hasBracket && (
                    <div>
                      {hasGrupos && <div className="border-t mb-6" style={{ borderColor: "#F0F7F4" }} />}
                      {hasGrupos && (
                        <p className="text-xs font-black uppercase mb-3" style={{ color: "#5F7D72", letterSpacing: "0.8px" }}>BRACKET ELIMINATORIO</p>
                      )}
                      {bracketRounds.length === 0 ? (
                        <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>El bracket todavía no fue generado.</p>
                      ) : (
                        <BracketBoard
                          rounds={bracketRounds}
                          onMatchClick={(m) => setMatchModal(m)}
                          printScale={bracketScale}
                          onPrint={handlePrintBracket}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  PAGOS
              ═══════════════════════════════════════════════════════ */}
              {tab === "pagos" && (
                <div>
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
                                      {pay.receiptUrl && (
                                        <a href={pay.receiptUrl} target="_blank" rel="noreferrer"
                                          className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border"
                                          style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}>
                                          <Eye size={11} /> Comprobante
                                        </a>
                                      )}
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

              {/* ═══════════════════════════════════════════════════════
                  GESTIÓN
              ═══════════════════════════════════════════════════════ */}
              {tab === "gestion" && (
                <div className="flex flex-col gap-4 max-w-lg">
                  {/* Estado */}
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
                        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: showOccupancy ? 23 : 3 }} />
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

                  {/* Notificaciones push */}
                  <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Bell size={15} style={{ color: "#0B8457" }} />
                      <p className="font-black text-sm" style={{ color: "#173A2E" }}>Enviar notificación</p>
                    </div>
                    <div className="flex flex-col gap-1.5 mb-3">
                      {([
                        { val: "confirmed",       label: "Solo confirmados" },
                        { val: "all",             label: "Todos los inscriptos" },
                        { val: "pending_payment", label: "Solo con pago pendiente" },
                      ] as const).map(opt => (
                        <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                          <div
                            onClick={() => setNotifAudience(opt.val)}
                            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-pointer"
                            style={{ borderColor: notifAudience === opt.val ? "#0B8457" : "#CFE7DC", background: notifAudience === opt.val ? "#0B8457" : "transparent" }}
                          >
                            {notifAudience === opt.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm" style={{ color: "#173A2E" }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold" style={{ color: "#5F7D72" }}>Título</label>
                        <span className="text-[10px]" style={{ color: notifTitle.length > 45 ? "#B24343" : "#9AB5AB" }}>{notifTitle.length}/50</span>
                      </div>
                      <input
                        value={notifTitle}
                        onChange={e => setNotifTitle(e.target.value.slice(0, 50))}
                        placeholder="ej: ¡Arranca el torneo!"
                        className="w-full border rounded-xl px-3 py-2 text-sm"
                        style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                      />
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold" style={{ color: "#5F7D72" }}>Mensaje</label>
                        <span className="text-[10px]" style={{ color: notifBody.length > 130 ? "#B24343" : "#9AB5AB" }}>{notifBody.length}/150</span>
                      </div>
                      <textarea
                        value={notifBody}
                        onChange={e => setNotifBody(e.target.value.slice(0, 150))}
                        placeholder="ej: Los partidos empiezan mañana a las 9hs. ¡Buena suerte!"
                        rows={3}
                        className="w-full border rounded-xl px-3 py-2 text-sm resize-none"
                        style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                      />
                    </div>
                    <button
                      onClick={() => setNotifConfirm(true)}
                      disabled={!notifTitle.trim() || !notifBody.trim() || sendingNotif}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: "#0B8457" }}
                    >
                      <Send size={13} /> Enviar notificación
                    </button>
                    <p className="text-[10px] mt-2 text-center" style={{ color: "#9AB5AB" }}>
                      Solo llega a jugadores inscriptos desde la app con EAS Build activo.
                    </p>
                    {notifHistory.length > 0 && (
                      <div className="mt-4 pt-3 border-t" style={{ borderColor: "#F0F7F4" }}>
                        <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Últimas enviadas</p>
                        <div className="flex flex-col gap-1.5">
                          {notifHistory.map(n => (
                            <div key={n.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "#F0F7F4", background: "#F6FBF8" }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold truncate" style={{ color: "#173A2E" }}>{n.title}</span>
                                <span className="text-[10px] flex-shrink-0" style={{ color: "#9AB5AB" }}>
                                  {n.sentAt?.toDate ? n.sentAt.toDate().toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : ""}
                                </span>
                              </div>
                              <p className="text-[11px] truncate" style={{ color: "#5F7D72" }}>{n.body}</p>
                              <p className="text-[10px] mt-0.5" style={{ color: "#9AB5AB" }}>
                                {n.recipientCount} dispositivo{n.recipientCount !== 1 ? "s" : ""} · {
                                  n.audience === "confirmed" ? "Confirmados" :
                                  n.audience === "pending_payment" ? "Pago pendiente" : "Todos"
                                }
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Modal confirmación de envío */}
                  {notifConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
                      <div className="w-full max-w-sm rounded-2xl p-6 shadow-xl" style={{ background: "#FFFFFF" }}>
                        <div className="flex items-center gap-2 mb-3">
                          <Bell size={16} style={{ color: "#0B8457" }} />
                          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Confirmar envío</h3>
                        </div>
                        <div className="rounded-xl border p-3 mb-4" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                          <p className="text-xs font-bold mb-0.5" style={{ color: "#5F7D72" }}>Título</p>
                          <p className="text-sm font-bold mb-2" style={{ color: "#173A2E" }}>{notifTitle}</p>
                          <p className="text-xs font-bold mb-0.5" style={{ color: "#5F7D72" }}>Mensaje</p>
                          <p className="text-sm" style={{ color: "#173A2E" }}>{notifBody}</p>
                          <p className="text-xs mt-2" style={{ color: "#9AB5AB" }}>
                            Destinatarios: <strong style={{ color: "#086847" }}>
                              {notifAudience === "confirmed" ? "Solo confirmados" :
                               notifAudience === "pending_payment" ? "Solo con pago pendiente" : "Todos los inscriptos"}
                            </strong>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setNotifConfirm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                            Cancelar
                          </button>
                          <button
                            onClick={handleSendNotification}
                            disabled={sendingNotif}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                            style={{ background: "#0B8457" }}
                          >
                            {sendingNotif ? <><Loader2 size={13} className="animate-spin" /> Enviando…</> : <><Send size={13} /> Confirmar</>}
                          </button>
                        </div>
                      </div>
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

            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
