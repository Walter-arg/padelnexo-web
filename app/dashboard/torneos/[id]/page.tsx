"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, collection, onSnapshot, updateDoc, addDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp, query, orderBy, setDoc, increment, where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { sendPushNotification } from "@/lib/pushNotifications";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import FixtureTab from "./FixtureTab";
import {
  ChevronLeft, ChevronRight, Users, GitBranch, CreditCard, Settings,
  Trophy, CheckCircle, Clock, PencilLine, Trash2,
  Loader2, X, Plus, Banknote, ArrowLeftRight, Eye, Shield, MapPin, Printer, Bell, Send,
  Link2, Phone, MessageSquare, Bold, ImageIcon, Building2,
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

// Color unico y acorde a la marca para el titulo del torneo (antes rotaba
// entre varios colores sin relacion con la paleta de la app).
const TOURNAMENT_TITLE_COLOR = "#1FAB89";

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

// ── Aviso automatico al jugador por mensajeria interna ───────────────────────
// Mismo texto que usa la app (tournamentsService.buildTournamentWelcomeMessage)
// para que el jugador reciba el mismo aviso sin importar si el organizador
// confirma/agrega la pareja desde la app o desde la web.
function formatTournamentDaysLabel(startMs?: number, endMs?: number): string {
  const start = Number(startMs || 0);
  const end = Number(endMs || 0);
  const fmt = (v: number) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  if (start && end && end !== start) return `${fmt(start)} al ${fmt(end)}`;
  if (start) return fmt(start);
  return "a confirmar";
}

function buildTournamentWelcomeMessage(
  torneoName: string, startMs: number, endMs: number, clubLabel: string, hasAvailability: boolean, playerName?: string
): string {
  const days = formatTournamentDaysLabel(startMs, endMs);
  const greeting = playerName ? `Hola ${playerName}, ` : "";
  let text = `🎾 ${greeting}¡ya estás inscripto al torneo "${torneoName || "el torneo"}"!\n📅 Se juega los días ${days}, organizado por ${clubLabel || "el club organizador"}. ¡Mucha suerte!`;
  if (!hasAvailability) {
    text += `\n\n⏰ Recordá cargar tus horarios disponibles para jugar, así el organizador puede armar mejor las zonas.`;
  }
  return text;
}

async function sendTournamentWelcomeMessage(
  recipientId: string, recipientName: string, text: string, pushTitle?: string
) {
  if (!recipientId) return;
  const sender = auth.currentUser;
  if (!sender) return;

  const conversationId = [sender.uid, recipientId].sort().join("__");

  try {
    const convRef = doc(db, "conversations", conversationId);
    const msgsRef = collection(db, "conversations", conversationId, "messages");
    await setDoc(convRef, {
      participants: [sender.uid, recipientId].sort(),
      participantNames: { [sender.uid]: sender.displayName || "Organizador", [recipientId]: recipientName || "Jugador" },
      unreadBy: [recipientId], lastMessageText: text, lastMessageSenderId: sender.uid,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(msgsRef, { text, senderId: sender.uid, recipientId, createdAt: serverTimestamp() });
    await updateDoc(convRef, {
      updatedAt: serverTimestamp(), [`unreadCountBy.${recipientId}`]: increment(1),
      [`unreadCountBy.${sender.uid}`]: 0, unreadBy: [recipientId],
      lastMessageText: text, lastMessageSenderId: sender.uid,
    });
  } catch {
    // No bloqueamos la accion principal (confirmar/agregar pareja) si falla el aviso.
    return;
  }

  await sendPushNotification({
    recipientId,
    title: pushTitle || sender.displayName || "Nuevo mensaje",
    body: text,
    data: { type: "chat_message", conversationId, senderId: sender.uid },
  });
}

// ── Reglamento del torneo ────────────────────────────────────────────────────
// Reconoce **negrita** (el boton del editor) y tambien *negrita* (la
// convencion de WhatsApp), para que un texto pegado desde ahi ya se vea
// formateado sin tener que retocarlo.
function parseRulesSegments(text: string = ""): { bold: boolean; text: string }[] {
  const segments: { bold: boolean; text: string }[] = [];
  const regex = /\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*/g;
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) segments.push({ bold: false, text: text.slice(lastIndex, match.index) });
    segments.push({ bold: true, text: (match[1] !== undefined ? match[1] : match[2]) ?? "" });
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }
  if (lastIndex < text.length) segments.push({ bold: false, text: text.slice(lastIndex) });
  return segments;
}

function RulesText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className} style={{ whiteSpace: "pre-wrap" }}>
      {parseRulesSegments(text).map((seg, i) => (
        <span key={i} className={seg.bold ? "font-black" : undefined}>{seg.text}</span>
      ))}
    </p>
  );
}

type Tab = "inscripciones" | "fixture" | "pagos" | "gestion";

// ── Modal inscripción ───────────────────────────────────────────────────────
function RegistrationModal({ torneoId, initial, onClose, onSaved, onDelete }: {
  torneoId: string;
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [p1Name, setP1Name] = useState(initial?.player1Name ?? "");
  const [p2Name, setP2Name] = useState(initial?.player2Name ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pending");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const data = {
      player1Name: p1Name.trim(),
      player2Name: p2Name.trim(),
      pairLabel: `${p1Name.trim()} / ${p2Name.trim()}`,
      status,
      contactPhone: contactPhone.trim(),
      notes: notes.trim(),
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
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Teléfono de contacto</label>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} placeholder="Ej: 11 2345-6789" />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Observaciones</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none" style={{ borderColor: "#CFE7DC" }} placeholder="Notas para el armado del torneo" />
          </div>
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
    if (newFrom === newTo) { setError("El horario de inicio y fin no pueden ser iguales."); return; }
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
                <p className="text-sm font-black mt-0.5" style={{ color: "#173A2E" }}>Desde las {s.from} hs hasta las {s.to} hs</p>
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
function NewPairDrawer({ torneoId, tournament, players, onClose, onSaved }: {
  torneoId: string;
  tournament: any;
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
      const clubLabel = tournament?.venues?.[0]?.name ?? tournament?.complejo?.nombre ?? "";

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

        await Promise.all([
          sendTournamentWelcomeMessage(
            pair.player1.id, pair.player1.name,
            buildTournamentWelcomeMessage(tournament?.name, tournament?.startDateMillis, tournament?.endDateMillis, clubLabel, false, pair.player1.name),
            clubLabel
          ),
          sendTournamentWelcomeMessage(
            pair.player2.id, pair.player2.name,
            buildTournamentWelcomeMessage(tournament?.name, tournament?.startDateMillis, tournament?.endDateMillis, clubLabel, false, pair.player2.name),
            clubLabel
          ),
        ]);
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

// ── Página principal ────────────────────────────────────────────────────────
export default function TorneoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const torneoId = params.id as string;

  const [torneo, setTorneo]               = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [players, setPlayers]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<Tab>("inscripciones");
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);
  const [categorySiblings, setCategorySiblings] = useState<any[]>([]);

  // Modales
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
  const [pairLimitsEnabled, setPairLimitsEnabled] = useState(true);
  const [availabilityRequired, setAvailabilityRequired] = useState(false);
  const [championId, setChampionId] = useState("");
  const [runnerUpId, setRunnerUpId] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Reglamento
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesDraft, setRulesDraft] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  const rulesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Afiche / flyer
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

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
          setPairLimitsEnabled(d.pairLimitsEnabled !== false);
          setAvailabilityRequired(Boolean(d.availabilityRequired));
          setChampionId(d.championPairId ?? "");
          setRunnerUpId(d.runnerUpPairId ?? "");
        }
        setLoading(false);
      });

      const unsubRegs = onSnapshot(
        query(collection(db, "tournaments", torneoId, "registrations"), orderBy("createdAt", "asc")),
        (snap) => setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      const unsubNotifs = onSnapshot(
        query(collection(db, "tournaments", torneoId, "notifications"), orderBy("sentAt", "desc")),
        (snap) => setNotifHistory(snap.docs.slice(0, 5).map(d => ({ id: d.id, ...d.data() })))
      );

      return () => { unsubTorneo(); unsubRegs(); unsubNotifs(); };
    });
    return unsubAuth;
  }, [torneoId, router]);

  // Categorías hermanas (mismo lote de creación), para el selector del header
  useEffect(() => {
    const batchId = torneo?.creationBatchId || "";

    if (!batchId) {
      setCategorySiblings([]);
      return;
    }

    getDocs(query(collection(db, "tournaments"), where("creationBatchId", "==", batchId)))
      .then((snap) => setCategorySiblings(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setCategorySiblings([]));
  }, [torneo?.creationBatchId]);

  const categoryOptions = categorySiblings.length > 1
    ? [...categorySiblings]
        .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
        .map((t) => ({ id: t.id, label: t.compositionConfig?.label ?? t.compositionLabel ?? t.name ?? "Categoría" }))
    : [];

  function handleSelectCategory(nextTournamentId: string) {
    if (!nextTournamentId || nextTournamentId === torneoId) return;
    router.push(`/dashboard/torneos/${nextTournamentId}`);
  }

  // ── Confirmar pareja ────────────────────────────────────────────────────
  async function confirmRegistration(regId: string) {
    await updateDoc(doc(db, "tournaments", torneoId, "registrations", regId), {
      status: "confirmed", confirmedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    showToast("Pareja confirmada.");

    const reg = registrations.find((r: any) => r.id === regId);
    if (reg) {
      const hasAvailability = Object.keys(reg.availability ?? {}).length > 0;
      const clubLabel = torneo?.venues?.[0]?.name ?? torneo?.complejo?.nombre ?? "";
      await Promise.all([
        sendTournamentWelcomeMessage(
          reg.player1Id || reg.player1UserId, reg.player1Name,
          buildTournamentWelcomeMessage(torneo?.name, torneo?.startDateMillis, torneo?.endDateMillis, clubLabel, hasAvailability, reg.player1Name),
          clubLabel
        ),
        sendTournamentWelcomeMessage(
          reg.player2Id || reg.player2UserId, reg.player2Name,
          buildTournamentWelcomeMessage(torneo?.name, torneo?.startDateMillis, torneo?.endDateMillis, clubLabel, hasAvailability, reg.player2Name),
          clubLabel
        ),
      ]);
    }
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
    await updateDoc(doc(db, "tournaments", torneoId), {
      minPairs,
      maxPairs,
      showOccupancyCard: showOccupancy,
      pairLimitsEnabled,
      availabilityRequired,
      updatedAt: serverTimestamp(),
    });
    setSavingAction(false);
    showToast("Cupos y disponibilidad guardados.");
  }

  async function handleSaveChampion() {
    setSavingAction(true);
    await updateDoc(doc(db, "tournaments", torneoId), { championPairId: championId, runnerUpPairId: runnerUpId, updatedAt: serverTimestamp() });
    setSavingAction(false);
    showToast("Resultado final guardado.");
  }

  function openRulesModal() {
    setRulesDraft(torneo?.rules ?? "");
    setRulesModalOpen(true);
  }

  function toggleRulesBold() {
    const el = rulesTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const text = rulesDraft;

    if (start === end) {
      const next = `${text.slice(0, start)}****${text.slice(start)}`;
      setRulesDraft(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + 2, start + 2); });
      return;
    }

    const selected = text.slice(start, end);
    const isBold = selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**");
    let next: string, nextStart: number, nextEnd: number;

    if (isBold) {
      const inner = selected.slice(2, -2);
      next = `${text.slice(0, start)}${inner}${text.slice(end)}`;
      nextStart = start; nextEnd = start + inner.length;
    } else {
      next = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
      nextStart = start; nextEnd = end + 4;
    }

    setRulesDraft(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(nextStart, nextEnd); });
  }

  async function saveRules() {
    if (savingRules) return;
    setSavingRules(true);
    try {
      await updateDoc(doc(db, "tournaments", torneoId), { rules: rulesDraft, updatedAt: serverTimestamp() });
      const organizerId = torneo?.organizerId || torneo?.createdBy || "";
      if (organizerId) {
        await updateDoc(doc(db, "users", organizerId), { defaultTournamentRules: rulesDraft }).catch(() => {});
      }
      setTorneo((p: any) => ({ ...p, rules: rulesDraft }));
      setRulesModalOpen(false);
      showToast("Reglamento guardado.");
    } finally {
      setSavingRules(false);
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const uid = auth.currentUser?.uid;
    if (!file || !uid) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop();
      const sRef = storageRef(storage, `tournaments/covers/${uid}/${Date.now()}.${ext}`);
      const snap = await uploadBytes(sRef, file);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "tournaments", torneoId), { coverImage: url, updatedAt: serverTimestamp() });
      setTorneo((p: any) => ({ ...p, coverImage: url }));
      showToast("Afiche actualizado.");
    } catch (err: any) {
      console.error("handleCoverUpload failed", err);
      showToast(`Error al subir el afiche: ${err?.code || err?.message || "desconocido"}`, false);
    } finally {
      setUploadingCover(false);
      if (coverFileRef.current) coverFileRef.current.value = "";
    }
  }

  async function handleRemoveCover() {
    await updateDoc(doc(db, "tournaments", torneoId), { coverImage: "", updatedAt: serverTimestamp() });
    setTorneo((p: any) => ({ ...p, coverImage: "" }));
    showToast("Afiche eliminado.");
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

  const titleColor = TOURNAMENT_TITLE_COLOR;
  const realZones = torneo.fixtureSetup?.zonePlanning?.zones ?? [];
  const hasGrupos = realZones.length > 0;
  const hasBracket = (torneo.fixtureSetup?.bracketPreview?.rounds ?? []).length > 0;

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
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#173A2E", margin: "4px 0 6px", letterSpacing: "0.2px" }}>{torneoName}</h1>
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

      {rulesModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setRulesModalOpen(false)}>
          <div className="bg-white rounded-[22px] w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
            {/* Header fijo */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
              <h3 className="font-black text-lg" style={{ color: "#086847" }}>Reglamento del torneo</h3>
              <button onClick={() => setRulesModalOpen(false)}><X size={16} style={{ color: "#5F7D72" }} /></button>
            </div>

            {/* Cuerpo con scroll propio */}
            <div className="overflow-y-auto flex-1 min-h-0 px-6">
              <p className="text-xs font-semibold mb-3" style={{ color: "#5F7D72" }}>
                Escribí o pegá el reglamento (podés pegarlo directo desde WhatsApp, con emojis y todo). Los jugadores lo van a poder leer antes de inscribirse, pero no modificarlo.
              </p>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={toggleRulesBold} title="Negrita"
                  className="w-8 h-8 flex items-center justify-center rounded-lg border hover:opacity-80 transition-opacity flex-shrink-0"
                  style={{ borderColor: "#CFE7DC", background: "#E9FFF0" }}>
                  <Bold size={14} style={{ color: "#086847" }} />
                </button>
                <span className="text-xs" style={{ color: "#9BB8AE" }}>Seleccioná un texto y tocá el botón para resaltarlo.</span>
              </div>
              <textarea
                ref={rulesTextareaRef}
                value={rulesDraft}
                onChange={e => setRulesDraft(e.target.value)}
                placeholder="Ej: El torneo se juega al mejor de 3 sets. Las inasistencias sin aviso..."
                className="w-full min-h-[180px] border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
              />
              {rulesDraft && (
                <div className="mt-3 mb-4 rounded-xl p-3 border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: "#9BB8AE" }}>Vista previa (solo lectura)</p>
                  <RulesText text={rulesDraft} className="text-sm" />
                </div>
              )}
            </div>

            {/* Footer fijo, siempre visible */}
            <div className="flex gap-3 px-6 pt-4 pb-6 flex-shrink-0" style={{ borderTop: "1px solid #F0F7F4" }}>
              <button onClick={() => setRulesModalOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-black border" style={{ background: "#ECF8F2", borderColor: "#CFE7DC", color: "#173A2E" }}>
                Cancelar
              </button>
              <button onClick={saveRules} disabled={savingRules || rulesDraft === (torneo?.rules ?? "")}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: "#0B8457" }}>
                {savingRules ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {newPairOpen && (
        <NewPairDrawer
          torneoId={torneoId} tournament={torneo} players={players}
          onClose={() => setNewPairOpen(false)}
          onSaved={() => { setNewPairOpen(false); showToast("Pareja inscripta exitosamente."); }}
        />
      )}
      {regModal.open && (
        <RegistrationModal
          torneoId={torneoId} initial={regModal.initial}
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
                className="w-full mb-4 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ height: 140, background: "#0F2D22" }}
              >
                <img src={torneo.coverImage} alt="Afiche" className="w-full h-full object-contain" />
              </button>
            )}

            {/* Nombre */}
            <p className="text-[10px] font-black uppercase mb-1" style={{ color: "#086847", letterSpacing: "1px" }}>TORNEO</p>
            <h2 className="font-black text-xl leading-tight mb-1" style={{ color: titleColor, letterSpacing: "0.2px" }}>
              {torneo.name ?? torneo.nombre}
            </h2>

            {/* Club / complejo */}
            {(torneo.venues?.[0]?.name ?? torneo.complejo?.nombre) && (
              <p className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: "#2F8FCF" }}>
                <Building2 size={14} /> {torneo.venues?.[0]?.name ?? torneo.complejo?.nombre}
              </p>
            )}

            {/* Status badge */}
            <div className="mb-5">
              <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
            </div>

            {/* Categoría */}
            {categoryOptions.length > 1 ? (
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EEF5FF" }}>
                  <Shield size={13} style={{ color: "#356CB8" }} />
                </div>
                <select
                  value={torneoId}
                  onChange={(e) => handleSelectCategory(e.target.value)}
                  className="text-sm font-bold flex-1 bg-transparent cursor-pointer"
                  style={{ color: "#173A2E" }}
                >
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            ) : (torneo.compositionLabel ?? torneo.categoria) && (
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
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#F6FBF8" }}>
                <Users size={13} style={{ color: "#0B8457" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>
                {registrations.length} inscripto{registrations.length !== 1 ? "s" : ""}
                {torneo.pairLimitsEnabled !== false && (torneo.maxPairs ?? 0) > 0 ? ` / ${torneo.maxPairs}` : ""}
              </span>
            </div>

            <a
              href={`/dashboard/torneos/ranking?category=${encodeURIComponent(torneo.compositionLabel ?? torneo.categoria ?? "")}`}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-opacity hover:opacity-80"
              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}
            >
              <Trophy size={14} /> Ver ranking
            </a>
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
                <h2 className="font-black text-base truncate leading-tight mb-1" style={{ color: titleColor, letterSpacing: "0.2px" }}>
                  {torneo.name ?? torneo.nombre}
                </h2>
                {(torneo.venues?.[0]?.name ?? torneo.complejo?.nombre) && (
                  <p className="text-xs font-bold truncate mb-1 flex items-center gap-1" style={{ color: "#2F8FCF" }}>
                    <Building2 size={11} /> {torneo.venues?.[0]?.name ?? torneo.complejo?.nombre}
                  </p>
                )}
                <StatusBadge status={torneo.status ?? "draft"} meta={STATUS_META} />
              </div>
            </div>
            {categoryOptions.length > 1 ? (
              <select
                value={torneoId}
                onChange={(e) => handleSelectCategory(e.target.value)}
                className="text-xs font-bold mt-3 w-full border rounded-lg px-2 py-1.5 bg-white"
                style={{ borderColor: "#BED4F7", color: "#356CB8" }}
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            ) : (torneo.compositionLabel ?? torneo.categoria) ? (
              <p className="text-xs font-semibold mt-2" style={{ color: "#173A2E" }}>
                {torneo.compositionLabel ?? torneo.categoria}
              </p>
            ) : null}
            <a
              href={`/dashboard/torneos/ranking?category=${encodeURIComponent(torneo.compositionLabel ?? torneo.categoria ?? "")}`}
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold border mt-3"
              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}
            >
              <Trophy size={13} /> Ver ranking
            </a>
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
                    className="w-full flex items-center justify-center gap-2 rounded-2xl font-black uppercase text-white mb-2.5 transition-opacity hover:opacity-90"
                    style={{ background: "#086847", minHeight: 52, fontSize: 14, letterSpacing: "0.5px" }}>
                    <Users size={18} /> Inscribir nueva pareja
                  </button>

                  {/* Link de inscripción pública */}
                  <button data-print-hide
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/inscripcion/${torneoId}`);
                      showToast("Link copiado. Compartilo con los jugadores.");
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl font-bold mb-4 border transition-opacity hover:opacity-80"
                    style={{ minHeight: 44, fontSize: 13, borderColor: "#CFE7DC", color: "#086847", background: "#F0F7F4" }}>
                    <Link2 size={15} /> Copiar link de inscripción
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
                            <td>{realZones.find((z: any) => (z.registrationIds ?? []).includes(reg.id))?.label ?? "—"}</td>
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

                            {/* Origen por link + categoria + teléfono/observaciones */}
                            {(reg.registrationSource === "public_link" || reg.player1Category || reg.player2Category || reg.contactPhone || reg.notes) && (
                              <div className="flex flex-col gap-1 mb-2 px-1">
                                {reg.registrationSource === "public_link" && (
                                  <span className="inline-flex items-center gap-1 self-start text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                                    style={{ background: "#EBF2FF", borderColor: "#A8C6F0", color: "#4A78C0" }}>
                                    <Link2 size={10} /> Inscripto vía link
                                  </span>
                                )}
                                {(reg.player1Category || reg.player2Category) && (
                                  <span className="text-xs font-semibold" style={{ color: "#5F7D72" }}>
                                    Categorías: {[reg.player1Category, reg.player2Category].filter(Boolean).join(" / ") || "A confirmar"}
                                  </span>
                                )}
                                {reg.contactPhone && (
                                  <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#5F7D72" }}>
                                    <Phone size={12} /> {reg.contactPhone}
                                  </span>
                                )}
                                {reg.notes && (
                                  <span className="flex items-start gap-1.5 text-xs font-semibold rounded-lg px-2 py-1.5" style={{ color: "#5F7D72", background: "#F6FBF8" }}>
                                    <MessageSquare size={12} className="mt-0.5 flex-shrink-0" /> {reg.notes}
                                  </span>
                                )}
                              </div>
                            )}

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
                <FixtureTab
                  torneoId={torneoId}
                  fixtureSetup={torneo?.fixtureSetup}
                  registrations={registrations}
                  showToast={showToast}
                  tournament={torneo}
                />
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
                  {/* Afiche / flyer */}
                  <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Afiche del torneo</p>
                    {torneo.coverImage ? (
                      <div className="flex items-center gap-3">
                        <img src={torneo.coverImage} alt="Afiche" className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border" style={{ borderColor: "#CFE7DC" }} />
                        <div className="flex flex-col gap-2 flex-1">
                          <button onClick={() => coverFileRef.current?.click()} disabled={uploadingCover}
                            className="py-2 rounded-xl text-xs font-bold border disabled:opacity-50" style={{ borderColor: "#CFE7DC", color: "#086847" }}>
                            {uploadingCover ? "Subiendo…" : "Cambiar afiche"}
                          </button>
                          <button onClick={handleRemoveCover} disabled={uploadingCover}
                            className="py-2 rounded-xl text-xs font-bold border disabled:opacity-50" style={{ borderColor: "#F1C8C8", color: "#B24343" }}>
                            Quitar afiche
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => coverFileRef.current?.click()} disabled={uploadingCover}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed disabled:opacity-50"
                        style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}>
                        <ImageIcon size={18} />
                        <span className="text-sm font-bold">{uploadingCover ? "Subiendo imagen…" : "Subir afiche o flyer"}</span>
                      </button>
                    )}
                    <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    <p className="text-[11px] mt-2" style={{ color: "#9BB8AE" }}>
                      Recomendado: ~1080×1350px (JPG o PNG, hasta 2MB). Funciona cualquier proporción, vertical u horizontal, se muestra completo sin recortar.
                    </p>
                  </div>

                  {/* Reglamento */}
                  <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Reglamento del torneo</p>
                    {torneo.rules ? (
                      <div className="rounded-xl p-3 mb-3" style={{ background: "#F6FBF8" }}>
                        <RulesText text={torneo.rules} className="text-sm" />
                      </div>
                    ) : (
                      <p className="text-xs mb-3" style={{ color: "#9BB8AE" }}>Todavía no cargaste el reglamento de este torneo.</p>
                    )}
                    <button onClick={openRulesModal}
                      className="w-full py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#086847" }}>
                      {torneo.rules ? "Editar reglamento" : "Cargar reglamento"}
                    </button>
                  </div>

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
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>Limitar cantidad de parejas</span>
                      <button
                        onClick={() => setPairLimitsEnabled(!pairLimitsEnabled)}
                        className="relative flex-shrink-0 rounded-full transition-all"
                        style={{ width: 46, height: 26, background: pairLimitsEnabled ? "#0B8457" : "#CFE7DC" }}
                      >
                        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: pairLimitsEnabled ? 23 : 3 }} />
                      </button>
                    </div>
                    <div className="flex gap-3 mb-3" style={!pairLimitsEnabled ? { opacity: 0.4 } : undefined}>
                      <div className="flex-1">
                        <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Mínimo</label>
                        <input type="number" min={2} value={minPairs} disabled={!pairLimitsEnabled}
                          onChange={e => setMinPairs(Number(e.target.value))}
                          className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: "#CFE7DC" }} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Máximo</label>
                        <input type="number" min={2} value={maxPairs} disabled={!pairLimitsEnabled}
                          onChange={e => setMaxPairs(Number(e.target.value))}
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
                  </div>

                  {/* Disponibilidad */}
                  <div className="rounded-2xl border p-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                    <p className="font-black text-sm mb-3" style={{ color: "#173A2E" }}>Disponibilidad</p>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>Disponibilidad obligatoria</span>
                      <button
                        onClick={() => setAvailabilityRequired(!availabilityRequired)}
                        className="relative flex-shrink-0 rounded-full transition-all"
                        style={{ width: 46, height: 26, background: availabilityRequired ? "#0B8457" : "#CFE7DC" }}
                      >
                        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: availabilityRequired ? 23 : 3 }} />
                      </button>
                    </div>
                    <p className="text-xs font-semibold mb-3" style={{ color: "#5F7D72" }}>
                      {availabilityRequired
                        ? "El jugador no va a poder enviar su inscripción (desde la app o el link público) sin cargar al menos un horario."
                        : "El jugador puede inscribirse sin cargar disponibilidad."}
                    </p>
                    <button onClick={handleSaveCupos} disabled={savingAction}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "#0B8457" }}>
                      {savingAction ? "Guardando…" : "Guardar cambios"}
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
