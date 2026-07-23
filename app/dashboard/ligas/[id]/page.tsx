"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, addDoc, setDoc, increment, serverTimestamp, getDocs, query as fsQuery, where } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, UserPlus, User as UserIcon, Trash2, ArrowLeftRight,
  X, Save, RefreshCw, Eye, Archive, Shield,
  MapPin, Clock, ChevronLeft, ChevronDown, Trophy,
  Contact, CalendarDays, Wallet, Check, MoreVertical,
  MessageSquare, Smartphone, Banknote, Search, Plus, AlertCircle, SlidersHorizontal,
} from "lucide-react";

type Tab = "jugadores" | "fixture" | "posiciones" | "pagos";

// ── Helpers de jugadores ───────────────────────────────────────────────────
function normalizeText(str: string): string {
  return (str ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function normalizePlayerEntry(p: any): any {
  return {
    id: p.id ?? `guest-${Date.now()}`,
    type: p.type ?? "guest",
    linkedUserId: p.linkedUserId ?? "",
    nombre: p.nombre ?? "Jugador",
    apellido: p.apellido ?? "",
    telefono: p.telefono ?? p.celular ?? p.whatsapp ?? "",
    categoria: p.categoria ?? "",
    sexo: p.sexo ?? "",
    ciudad: p.ciudad ?? "",
    provincia: p.provincia ?? "",
    foto: p.foto ?? "",
    ladoJuego: p.ladoJuego ?? "ambos",
    ladoPreferido: p.ladoPreferido ?? "Ambos lados",
    pairNumber: p.pairNumber ?? 0,
  };
}

// ── PlayerSlotRow ──────────────────────────────────────────────────────────
function PlayerSlotRow({ player, onView, onDelete, onSwap, isSwapActive, showSide }: {
  player: any;
  onView: () => void;
  onDelete: () => void;
  onSwap?: () => void;
  isSwapActive?: boolean;
  showSide?: boolean;
}) {
  const isGuest = player.type === "guest";
  return (
    <div className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onView} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {player.foto
            ? <img src={player.foto} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
            : <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
                <UserIcon size={13} className="text-[#9CA3AF]" />
              </div>
          }
          <div className="min-w-0">
            <div className="text-sm font-black text-[#173A2E] truncate">{player.nombre} {player.apellido ?? ""}</div>
            <div className="text-[11px] text-[#5F7D72] font-semibold">{isGuest ? "Solo visible en esta liga" : "Ver perfil"}</div>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onSwap && (
            <button onClick={onSwap}
              className={`w-7 h-7 rounded-[10px] border flex items-center justify-center transition-colors ${isSwapActive ? "bg-[#086847] border-[#086847]" : "bg-[#EDF7F2] border-[#C9E5D8] hover:bg-[#C9E5D8]"}`}
              title="Reemplazar por jugador registrado">
              <ArrowLeftRight size={12} className={isSwapActive ? "text-white" : "text-[#086847]"} />
            </button>
          )}
          <button onClick={onDelete}
            className="w-7 h-7 rounded-[10px] bg-[#FFF1F1] border border-[#F2C4C4] flex items-center justify-center hover:bg-red-100 transition-colors"
            title="Eliminar de la liga">
            <Trash2 size={12} className="text-[#D64545]" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {showSide && player.ladoJuego && player.ladoJuego !== "ambos" && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#EDF7F2] border border-[#C9E5D8] text-[#086847]">
            {player.ladoJuego === "drive" ? "Drive" : "Reves"}
          </span>
        )}
        {player.categoria && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#EDF7F2] border border-[#C9E5D8] text-[#086847]">
            {player.categoria}
          </span>
        )}
        {player.sexo && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#FFF4E7] border border-[#E8C58E] text-[#8A5A2B] capitalize">
            {player.sexo}
          </span>
        )}
      </div>
      {isSwapActive && (
        <p className="text-[11px] text-[#086847] font-bold mt-1.5 leading-tight">
          Seleccioná arriba un jugador registrado para reemplazar este nombre manual.
        </p>
      )}
    </div>
  );
}

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
};

// ── Fixture: algoritmos de generación ──────────────────────────────────────
function fxBuildTeamLabel(players: any[]): string {
  return players.map(p => p?.nombre ?? "").filter(Boolean).join(" / ");
}
function fxNormalizeTeam(t: any, idx: number): any {
  return { id: t?.id ?? `team-${idx}`, label: t?.label ?? fxBuildTeamLabel(t?.players ?? []), players: t?.players ?? [] };
}
function fxNormalizePlayer(p: any): any {
  return { id: p?.id ?? `guest-${Date.now()}`, type: p?.type ?? "guest", linkedUserId: p?.linkedUserId ?? "", nombre: p?.nombre ?? "Jugador", apellido: p?.apellido ?? "", categoria: p?.categoria ?? "", sexo: p?.sexo ?? "", foto: p?.foto ?? p?.avatarUrl ?? p?.fotoURL ?? p?.photoURL ?? "", ladoJuego: p?.ladoJuego ?? "ambos", pairNumber: p?.pairNumber ?? 0 };
}
function fxBuildPairTeams(league: any): any[] {
  const players = (Array.isArray(league?.players) ? league.players : []).map(fxNormalizePlayer);
  const grouped: Record<number, any[]> = {};
  players.forEach((p: any) => { const n = Number(p.pairNumber) || 0; if (n > 0) grouped[n] = [...(grouped[n] ?? []), p]; });
  const groupedTeams = Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).filter(([, tp]) => (tp as any[]).length >= 2).map(([n, tp]: [string, any]) => ({ id: `pair-team-${n}`, label: fxBuildTeamLabel((tp as any[]).slice(0, 2)), players: (tp as any[]).slice(0, 2) }));
  if (Object.keys(grouped).length > 0) return groupedTeams;
  const manualTeams = Array.isArray(league?.fixtureConfig?.manualTeams) ? league.fixtureConfig.manualTeams.map((t: any, i: number) => fxNormalizeTeam(t, i)) : [];
  if (manualTeams.length) return manualTeams;
  const teams: any[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) { const tp = [players[i], players[i + 1]]; teams.push({ id: `pair-team-${teams.length + 1}`, label: fxBuildTeamLabel(tp), players: tp }); }
  return teams;
}
function fxRoundRobin(teams: any[]): any[] {
  if (!teams.length) return [];
  const rot = teams.length % 2 === 0 ? [...teams] : [...teams, { id: "__bye__", label: "Libre" }];
  const rounds: any[] = [];
  for (let ri = 0; ri < rot.length - 1; ri++) {
    const matches: any[] = []; const byeLabels: string[] = [];
    for (let i = 0; i < rot.length / 2; i++) {
      const a = rot[i], b = rot[rot.length - 1 - i];
      if (a.id === "__bye__" || b.id === "__bye__") { byeLabels.push((a.id === "__bye__" ? b : a).label); continue; }
      matches.push({ teamA: a, teamB: b });
    }
    rounds.push({ matches, byeLabels });
    const fixed = rot[0], rotating = rot.slice(1); rotating.unshift(rotating.pop()); rot.splice(0, rot.length, fixed, ...rotating);
  }
  return rounds;
}
function fxCreateMatch(match: any, ri: number, mi: number, timeSlot = ""): any {
  return { id: `round-${ri + 1}-match-${mi + 1}`, order: mi + 1, timeSlot, teamA: fxNormalizeTeam(match.teamA, mi * 2), teamB: fxNormalizeTeam(match.teamB, mi * 2 + 1), result: { winner: "", score: "", reason: "", sets: [] }, replacements: {} };
}
function fxRotate<T>(arr: T[], by: number): T[] { if (!arr.length) return arr; const n = ((by % arr.length) + arr.length) % arr.length; return [...arr.slice(n), ...arr.slice(0, n)]; }
function fxGeneratePair(league: any): any {
  const teams = fxBuildPairTeams(league);
  const roundsCount = Number(league?.fixtureConfig?.roundsCount) || 6;
  const timeSlots: string[] = league?.scheduleConfig?.timeSlots ?? [];
  const base = fxRoundRobin(teams);
  return { generatedAtMillis: Date.now(), rounds: Array.from({ length: roundsCount }, (_, ri) => { const b = base[ri % Math.max(base.length, 1)] ?? { matches: [], byeLabels: [] }; return { id: `round-${ri + 1}`, number: ri + 1, title: `Fecha ${ri + 1}`, scheduleLabel: "", completedAtMillis: 0, suspendedAtMillis: 0, suspensionReason: "", suspensionMode: "", rescheduledDateMillis: 0, byeLabels: b.byeLabels, matches: b.matches.map((m: any, mi: number) => fxCreateMatch(m, ri, mi, timeSlots[mi % timeSlots.length] ?? "")) }; }) };
}
function fxGenerateIndividual(league: any): any {
  const players = (Array.isArray(league?.players) ? league.players : []).map(fxNormalizePlayer);
  const drive = players.filter((p: any) => p.ladoJuego === "drive");
  const reves = players.filter((p: any) => p.ladoJuego === "reves");
  const pairsCount = Math.min(drive.length, reves.length);
  const roundsCount = Number(league?.fixtureConfig?.roundsCount) || 6;
  const timeSlots: string[] = league?.scheduleConfig?.timeSlots ?? [];
  return { generatedAtMillis: Date.now(), rounds: Array.from({ length: roundsCount }, (_, ri) => { const rotReves = fxRotate(reves, ri); const teams = Array.from({ length: pairsCount }, (_2: any, pi: number) => { const tp = [drive[pi], rotReves[pi]]; return { id: `round-${ri + 1}-team-${pi + 1}`, label: fxBuildTeamLabel(tp), players: tp }; }); const rotTeams = fxRotate(teams, ri); const matches: any[] = []; const byeLabels: string[] = []; for (let i = 0; i < rotTeams.length; i += 2) { const a = rotTeams[i], b = rotTeams[i + 1]; if (!b) { byeLabels.push(a.label); continue; } matches.push(fxCreateMatch({ teamA: a, teamB: b }, ri, matches.length, timeSlots[matches.length % timeSlots.length] ?? "")); } return { id: `round-${ri + 1}`, number: ri + 1, title: `Fecha ${ri + 1}`, scheduleLabel: "", completedAtMillis: 0, suspendedAtMillis: 0, suspensionReason: "", suspensionMode: "", rescheduledDateMillis: 0, byeLabels, matches }; }) };
}
function fxValidate(league: any): { valid: boolean; message: string } {
  const players = Array.isArray(league?.players) ? league.players : [];
  if (!players.length) return { valid: false, message: "Primero debés cargar jugadores en la liga." };
  if (league?.teamType === "pair") {
    const grouped: Record<number, any[]> = {};
    players.map(fxNormalizePlayer).forEach((p: any) => { const n = Number(p.pairNumber) || 0; if (n > 0) grouped[n] = [...(grouped[n] ?? []), p]; });
    if (Object.values(grouped).some((g: any[]) => g.length !== 2)) return { valid: false, message: "Todas las parejas deben tener exactamente dos jugadores." };
    if (fxBuildPairTeams(league).length < 2) return { valid: false, message: "Necesitás al menos dos parejas para generar el fixture." };
    return { valid: true, message: "" };
  }
  const norm = players.map(fxNormalizePlayer);
  const drive = norm.filter((p: any) => p.ladoJuego === "drive");
  const reves = norm.filter((p: any) => p.ladoJuego === "reves");
  if (drive.length < 2 || reves.length < 2) return { valid: false, message: "Necesitás al menos 2 Drive y 2 Reves para el fixture individual." };
  return { valid: true, message: "" };
}
function fxGenerate(league: any): any {
  const v = fxValidate(league);
  if (!v.valid) throw new Error(v.message);
  return league?.teamType === "individual" ? fxGenerateIndividual(league) : fxGeneratePair(league);
}

// ── Fixture: status ────────────────────────────────────────────────────────
type RoundStatus = "played" | "suspended" | "reprogrammed" | "pending";
function fxRoundStatus(round: any): RoundStatus {
  const matches = round.matches ?? [];
  if (matches.length > 0 && matches.every((m: any) => m.result?.winner && m.result.winner !== "")) return "played";
  if (round.suspendedAtMillis > 0) return Date.now() - round.suspendedAtMillis < 86_400_000 ? "suspended" : "reprogrammed";
  return "pending";
}
const FX_STATUS: Record<RoundStatus, { dot: string; text: string; label: string; hBg: string }> = {
  played:       { dot: "bg-[#3A9A82]", text: "text-[#24725E]", label: "JUGADA",      hBg: "bg-[#CDE9E3]" },
  pending:      { dot: "bg-[#7D8987]", text: "text-[#596563]", label: "PENDIENTE",   hBg: "bg-[#CDE9E3]" },
  suspended:    { dot: "bg-[#C76464]", text: "text-[#994646]", label: "SUSPENDIDA",  hBg: "bg-[#FFE8E8]" },
  reprogrammed: { dot: "bg-[#D68A2D]", text: "text-[#9A601C]", label: "REPROGRAMADA",hBg: "bg-[#FFF3E3]" },
};
function fxRepKey(teamKey: string, player: any): string {
  return player?.id ? `${teamKey}:${player.id}` : `${teamKey}:guest-0-${player?.nombre ?? ""}-${player?.apellido ?? ""}`;
}
const SYSTEM_UID = "padelnexo-system";
const SYSTEM_NAME = "PadelNexo";
async function sendSystemMsg(db: any, recipientId: string, recipientName: string, text: string) {
  if (!recipientId) return;
  const convId = [SYSTEM_UID, recipientId].sort().join("__");
  const convRef = doc(db, "conversations", convId);
  const msgsRef = collection(db, "conversations", convId, "messages");
  await setDoc(convRef, {
    participants: [SYSTEM_UID, recipientId].sort(),
    participantNames: { [SYSTEM_UID]: SYSTEM_NAME, [recipientId]: recipientName || "Jugador" },
    unreadBy: [recipientId], lastMessageText: text, lastMessageSenderId: SYSTEM_UID,
    lastMessagePriority: "important", updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(msgsRef, { text, senderId: SYSTEM_UID, recipientId, priority: "important", createdAt: serverTimestamp() });
  await updateDoc(convRef, {
    updatedAt: serverTimestamp(), [`unreadCountBy.${recipientId}`]: increment(1),
    unreadBy: [recipientId], lastMessageText: text, lastMessageSenderId: SYSTEM_UID, lastMessagePriority: "important",
  });
}
function fxRepDotColor(match: any): string | null {
  const entries = Object.values(match.replacements ?? {});
  if (!entries.length) return null;
  return entries.some((e: any) => e?.replacement) ? "#2A9A6B" : "#E88319";
}

// ── FixtureResultModal ─────────────────────────────────────────────────────
function FixtureResultModal({ match, matchFormat, onClose, onSave }: { match: any; matchFormat: string; onClose: () => void; onSave: (r: any) => void }) {
  const [winner, setWinner] = useState(match.result?.winner ?? "");
  const [sets, setSets] = useState<{own:string;rival:string}[]>(
    match.result?.sets?.length ? match.result.sets : [{own:"",rival:""},{own:"",rival:""},{own:"",rival:""}]
  );
  const inputRefs = useRef<Array<[HTMLInputElement|null, HTMLInputElement|null]>>([[null,null],[null,null],[null,null]]);
  const aLabel = match.teamA?.label ?? "Pareja A";
  const bLabel = match.teamB?.label ?? "Pareja B";
  const maxSets = matchFormat === "single_set" ? 1 : 3;

  function advance(i: number, side: "own"|"rival") {
    if (side === "own") {
      inputRefs.current[i][1]?.focus();
      inputRefs.current[i][1]?.select();
    } else if (i + 1 < maxSets) {
      inputRefs.current[i+1][0]?.focus();
      inputRefs.current[i+1][0]?.select();
    }
  }

  function handleSave() {
    if (!winner) return;
    const useSets = sets.slice(0, maxSets).filter((s: any) => s.own !== "" || s.rival !== "");
    onSave({ winner, score: useSets.map((s: any) => `${s.own}/${s.rival}`).join(" "), reason: "normal", sets: useSets });
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-[18px] font-black text-[#086847]">Resultado</div>
          <div className="text-[11px] text-[#5F7D72] mt-0.5">Seleccioná ganador y cargá los sets.</div>
        </div>
        <div className="flex flex-col gap-2 mb-4">
          {[{v:"teamA",l:aLabel},{v:"teamB",l:bLabel}].map(opt=>(
            <button key={opt.v} onClick={()=>setWinner(opt.v)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-[14px] border text-sm font-black text-left transition-all ${winner===opt.v?"bg-[#DDF6EF] border-[#89D9C4] text-[#176B5B]":"bg-[#F7FAF8] border-[#CFE7DC] text-[#086847] hover:border-[#89D9C4]"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${winner===opt.v?"bg-[#0B8457] border-[#0B8457]":"border-[#CFE7DC]"}`}/>
              {opt.l}
              {winner===opt.v&&<span className="ml-auto text-[9px] font-black text-[#176B5B]">GANADOR</span>}
            </button>
          ))}
        </div>
        {winner && (
          <div className="mb-4">
            <div className="text-[10px] font-black text-[#5F7D72] uppercase tracking-wide mb-2 text-center">Sets</div>
            {Array.from({length:maxSets}).map((_,i)=>(
              <div key={i} className="flex items-center gap-2 mb-2 justify-center">
                <span className="text-[11px] font-black text-[#086847] w-24 text-right">{i===2?"3er set (opc.)": `Set ${i+1}`}</span>
                <input
                  ref={el => { inputRefs.current[i][0] = el }}
                  value={sets[i]?.own??""}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g,"").slice(0,2);
                    const prev = sets[i].own;
                    setSets(p => p.map((s,j) => j===i ? {...s,own:v} : s));
                    if (prev === "" && v.length >= 1) advance(i, "own");
                  }}
                  className="w-11 h-10 text-center border border-[#CFE7DC] rounded-xl text-[16px] font-black text-[#173A2E] focus:outline-none focus:border-[#0B8457] bg-[#F7FAF8]"
                  placeholder="0" inputMode="numeric"
                />
                <span className="text-[#5F7D72] font-black text-[13px]">/</span>
                <input
                  ref={el => { inputRefs.current[i][1] = el }}
                  value={sets[i]?.rival??""}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g,"").slice(0,2);
                    const prev = sets[i].rival;
                    setSets(p => p.map((s,j) => j===i ? {...s,rival:v} : s));
                    if (prev === "" && v.length >= 1) advance(i, "rival");
                  }}
                  className="w-11 h-10 text-center border border-[#CFE7DC] rounded-xl text-[16px] font-black text-[#173A2E] focus:outline-none focus:border-[#0B8457] bg-[#F7FAF8]"
                  placeholder="0" inputMode="numeric"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={handleSave} disabled={!winner} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2">
            <Save size={14}/>Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FixtureSuspensionModal ─────────────────────────────────────────────────
function FixtureSuspensionModal({ round, onClose, onApply }: { round: any; onClose: () => void; onApply: (d: any) => void }) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState("league_round");
  const [mode, setMode] = useState("suspended");
  const [reason, setReason] = useState("weather");
  const isSuspended = round.suspendedAtMillis > 0;
  const stepLabels = ["", "¿Qué suspender?", "¿Cuándo se reprograma?", "¿Por qué motivo?"];
  const allOpts: any[][] = [
    [],
    [{v:"league_round",l:"Esta fecha completa"},{v:"selected_matches",l:"Partidos puntuales"}],
    [{v:"next_week",l:"La próxima semana"},{v:"manual",l:"Elegir fecha manual"},{v:"suspended",l:"Sin fecha definida"}],
    [{v:"weather",l:"Inclemencia climática"},{v:"holiday",l:"Feriado"},{v:"technical",l:"Problema técnico"},{v:"other",l:"Otros motivos"}],
  ];
  const stepVal = [scope, scope, mode, reason][step];
  const stepSetter = [setScope, setScope, setMode, setReason][step];
  if (step === 0) return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-[#086847]">Fecha {round.number}</h3>
          <button onClick={onClose}><X size={16} className="text-[#5F7D72]"/></button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={()=>setStep(1)} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FFF3E3] border border-[#E8C58E] text-sm font-black text-[#8A5A2B] text-left">
            <AlertCircle size={15} className="text-[#D68A2D] flex-shrink-0"/>Suspender esta fecha
          </button>
          {isSuspended&&<button onClick={()=>onApply({remove:true})} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#086847] text-left">
            <Check size={15} className="flex-shrink-0"/>Quitar suspensión
          </button>}
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-[#F7FAF8] border border-[#CFE7DC] text-sm font-bold text-[#5F7D72] text-center">Cancelar</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-[#086847] text-base">{stepLabels[step]}</h3>
          <button onClick={onClose}><X size={16} className="text-[#5F7D72]"/></button>
        </div>
        <p className="text-xs text-[#5F7D72] mb-4">Paso {step} de 3</p>
        <div className="flex flex-col gap-2 mb-5">
          {allOpts[step].map((opt:any)=>(
            <button key={opt.v} onClick={()=>stepSetter(opt.v)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-black text-left ${stepVal===opt.v?"bg-[#DDF6EF] border-[#89D9C4] text-[#176B5B]":"bg-[#F7FAF8] border-[#CFE7DC] text-[#086847]"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stepVal===opt.v?"bg-[#0B8457] border-[#0B8457]":"border-[#CFE7DC]"}`}/>
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={()=>setStep(s=>s-1)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Atrás</button>
          {step===3
            ?<button onClick={()=>onApply({scope,mode,reason})} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black">Confirmar</button>
            :<button onClick={()=>setStep(s=>s+1)} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black">Siguiente →</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── FixtureReplacementModal ────────────────────────────────────────────────
function FixtureReplacementModal({ match, allPlayers, onClose, onSave }: { match: any; allPlayers: any[]; onClose: () => void; onSave: (r: Record<string,any>) => void }) {
  const [query, setQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string|null>(null);
  const [draft, setDraft] = useState<Record<string,any>>({...(match.replacements??{})});
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [filterGenero, setFilterGenero] = useState("");
  const searchRef = useRef<HTMLDivElement|null>(null);
  const matchPlayers = [
    ...((match.teamA?.players??[]).map((p:any)=>({...p,teamKey:"teamA"}))),
    ...((match.teamB?.players??[]).map((p:any)=>({...p,teamKey:"teamB"}))),
  ];
  const categories = useMemo(()=>[...new Set(allPlayers.map((p:any)=>p.categoria).filter(Boolean))].sort() as string[],[allPlayers]);
  const generos = useMemo(()=>[...new Set(allPlayers.map((p:any)=>p.genero).filter(Boolean))].sort() as string[],[allPlayers]);
  const filtered = useMemo(()=>{
    const q = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
    let res = allPlayers;
    if(q) res = res.filter((p:any)=>`${p.nombre??""} ${p.apellido??""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").includes(q));
    if(filterCat) res = res.filter((p:any)=>p.categoria===filterCat);
    if(filterGenero) res = res.filter((p:any)=>p.genero===filterGenero);
    return res.slice(0,(!q&&!filterCat&&!filterGenero)?10:20);
  },[query,allPlayers,filterCat,filterGenero]);
  useEffect(()=>{
    if(pendingKey&&searchRef.current) {
      setTimeout(()=>searchRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),60);
    }
  },[pendingKey]);
  const hasActiveFilter = !!filterCat||!!filterGenero;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-[28px] sm:rounded-[22px] pt-5 pb-6 px-5 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-[#086847] text-base">Reemplazos</h3>
          <button onClick={onClose}><X size={16} className="text-[#5F7D72]"/></button>
        </div>
        {matchPlayers.map((player:any,idx:number)=>{
          const key = fxRepKey(player.teamKey, player);
          const entry = draft[key];
          const isPending = entry?.requested && !entry?.replacement;
          const isAssigned = entry?.requested && entry?.replacement;
          return (
            <div key={idx} className="mb-2.5 bg-[#F7FAF8] border border-[#CFE7DC] rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div>
                  <div className="text-sm font-black text-[#173A2E]">{player.nombre} {player.apellido??""}</div>
                  <div className="text-[10px] text-[#5F7D72]">{player.teamKey==="teamA"?match.teamA?.label:match.teamB?.label}</div>
                </div>
                {isPending&&<span className="text-[9px] font-black text-[#D47713]">PENDIENTE</span>}
                {isAssigned&&<span className="text-[9px] font-black text-[#24725E]">ASIGNADO</span>}
              </div>
              {isAssigned&&<div className="text-[11px] text-[#5F7D72] mb-1">Reemplazante: <span className="font-black text-[#247653]">{entry.replacement.nombre} {entry.replacement.apellido??""}</span></div>}
              <div className="flex gap-1.5">
                {!entry&&<button onClick={()=>setDraft(d=>({...d,[key]:{requested:true,titular:{id:player.id,nombre:player.nombre,apellido:player.apellido},replacement:null,requestedAtMillis:Date.now()}}))} className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-[#FFF3E3] border border-[#E8C58E] text-[#8A5A2B]">Solicitar</button>}
                {isPending&&<button onClick={()=>{setPendingKey(key);setQuery("");setFilterOpen(false);setFilterCat("");setFilterGenero("");}} className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-[#DDF6EF] border border-[#89D9C4] text-[#176B5B]">Asignar</button>}
                {entry&&<button onClick={()=>setDraft(d=>{const n={...d};delete n[key];return n;})} className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-[#FFF1F1] border border-[#F2C4C4] text-[#D64545]">Cancelar</button>}
              </div>
            </div>
          );
        })}
        {pendingKey&&(
          <div ref={searchRef} className="mt-3">
            <div className="flex items-center gap-2 bg-[#EDF7F2] border border-[#89D9C4] rounded-xl px-3 py-2 mb-2">
              <span className="text-[11px] font-black text-[#086847]">↓ Seleccioná al reemplazante en la lista de abajo</span>
            </div>
            <div className="flex items-center gap-2 bg-[#F7FAF8] border border-[#CFE7DC] rounded-xl px-3 py-2 mb-1">
              <Search size={13} className="text-[#5F7D72] flex-shrink-0"/>
              <input value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 text-sm bg-transparent outline-none text-[#173A2E] placeholder-[#5F7D72]" placeholder="Buscar por nombre..." autoFocus/>
              <button onClick={()=>setFilterOpen(f=>!f)} className={`p-1 rounded-lg transition-colors ${hasActiveFilter||filterOpen?"bg-[#0B8457] text-white":"text-[#5F7D72] hover:text-[#0B8457]"}`}>
                <SlidersHorizontal size={13}/>
              </button>
            </div>
            {filterOpen&&(
              <div className="bg-[#F7FAF8] border border-[#CFE7DC] rounded-xl px-3 py-2.5 mb-2 flex flex-col gap-2.5">
                {categories.length>0&&(
                  <div>
                    <span className="text-[10px] font-black text-[#5F7D72] uppercase tracking-wide">Categoría</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button onClick={()=>setFilterCat("")} className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border transition-colors ${!filterCat?"bg-[#0B8457] text-white border-[#0B8457]":"bg-white text-[#5F7D72] border-[#CFE7DC] hover:border-[#89D9C4]"}`}>Todas</button>
                      {categories.map(cat=>(
                        <button key={cat} onClick={()=>setFilterCat(f=>f===cat?"":cat)} className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border transition-colors ${filterCat===cat?"bg-[#0B8457] text-white border-[#0B8457]":"bg-white text-[#5F7D72] border-[#CFE7DC] hover:border-[#89D9C4]"}`}>{cat}</button>
                      ))}
                    </div>
                  </div>
                )}
                {generos.length>0&&(
                  <div>
                    <span className="text-[10px] font-black text-[#5F7D72] uppercase tracking-wide">Género</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button onClick={()=>setFilterGenero("")} className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border transition-colors ${!filterGenero?"bg-[#0B8457] text-white border-[#0B8457]":"bg-white text-[#5F7D72] border-[#CFE7DC] hover:border-[#89D9C4]"}`}>Todos</button>
                      {generos.map(g=>(
                        <button key={g} onClick={()=>setFilterGenero(f=>f===g?"":g)} className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border transition-colors ${filterGenero===g?"bg-[#0B8457] text-white border-[#0B8457]":"bg-white text-[#5F7D72] border-[#CFE7DC] hover:border-[#89D9C4]"}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
              {filtered.map((rp:any,i:number)=>(
                <button key={i} onClick={()=>{
                  const titEntry = matchPlayers.find((p:any)=>fxRepKey(p.teamKey,p)===pendingKey);
                  setDraft(d=>({...d,[pendingKey]:{...(d[pendingKey]??{}),requested:true,titular:titEntry?{id:titEntry.id,nombre:titEntry.nombre,apellido:titEntry.apellido}:{},replacement:{id:rp.id,linkedUserId:rp.linkedUserId??rp.id,nombre:rp.nombre,apellido:rp.apellido}}}));
                  setPendingKey(null); setQuery("");
                }} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#CFE7DC] text-left hover:bg-[#DDF6EF] hover:border-[#89D9C4] transition-colors">
                  {(rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL)
                    ?<img src={rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt=""/>
                    :<div className="w-6 h-6 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0 text-[10px] font-black text-[#9CA3AF]">{(rp.nombre??"?")[0]}</div>
                  }
                  <div>
                    <div className="text-sm font-black text-[#173A2E]">{rp.nombre} {rp.apellido??""}</div>
                    {(rp.categoria||rp.genero)&&<div className="text-[10px] text-[#5F7D72]">{[rp.categoria,rp.genero].filter(Boolean).join(" · ")}</div>}
                  </div>
                </button>
              ))}
              {filtered.length===0&&<p className="text-[11px] text-[#5F7D72] text-center py-3">Sin resultados</p>}
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={()=>onSave(draft)} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black flex items-center justify-center gap-2"><Save size={14}/>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── FixtureGenerateModal ───────────────────────────────────────────────────
function FixtureGenerateModal({ league, onClose, onGenerate }: { league: any; onClose: () => void; onGenerate: (f: any) => void }) {
  const validation = fxValidate(league);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() { setBusy(true); setErr(""); try { onGenerate(fxGenerate(league)); } catch(e:any){ setErr(e?.message??"Error."); } setBusy(false); }
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-[#086847] text-lg">Generar fixture</h3>
          <button onClick={onClose}><X size={16} className="text-[#5F7D72]"/></button>
        </div>
        {!validation.valid&&<div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 mb-4 text-sm text-[#8C2D2D] font-semibold">{validation.message}</div>}
        {err&&<div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 mb-4 text-sm text-[#8C2D2D] font-semibold">{err}</div>}
        {validation.valid&&<div className="bg-[#EEF9F1] border border-[#CFE7DC] rounded-xl px-4 py-3 mb-4 text-sm text-[#086847] font-semibold">
          Se generarán <strong>{league?.fixtureConfig?.roundsCount??6}</strong> fechas · {league?.teamType==="individual"?"Individual (Drive/Reves)":"Round Robin (parejas)"}
        </div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={go} disabled={!validation.valid||busy} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2">
            {busy?<RefreshCw size={14} className="animate-spin"/>:<Trophy size={14}/>}{busy?"Generando...":"Generar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MatchRow (fixture) ─────────────────────────────────────────────────────
function FxMatchRow({ match, canEdit, dayLabel, onResultClick, onActionsClick }: { match: any; canEdit: boolean; dayLabel?: string; onResultClick: ()=>void; onActionsClick: ()=>void }) {
  const res = match.result; const hasRes = !!res?.winner && res.winner !== ""; const aWon = res?.winner==="teamA"; const bWon = res?.winner==="teamB"; const isWO = res?.reason==="walkover"; const dotColor = fxRepDotColor(match);
  function renderTeam(team: any, teamKey: string) {
    const players = team.players ?? [];
    if (!players.length) return <span className="text-[12px] font-black text-[#173A2E]">{team.label}</span>;
    const isWinner = (teamKey==="teamA"&&aWon)||(teamKey==="teamB"&&bWon);
    return (
      <div className="flex items-center gap-1">
        {isWinner?<span className="text-[13px] text-[#36D66B] flex-shrink-0">👍</span>:<span className="w-4 flex-shrink-0"/>}
        <div className="flex flex-col gap-0.5">
          {players.map((p:any,pi:number)=>{
            const key = fxRepKey(teamKey, p); const entry = (match.replacements??{})[key];
            const isPend = entry?.requested && !entry?.replacement; const isAsgn = entry?.requested && entry?.replacement;
            return (
              <div key={pi} className="flex flex-col">
                <span className={`text-[12px] font-black leading-snug ${isPend?"text-[#A85B0E]":isAsgn?"text-[#5F7D72] line-through":isWinner?"text-[#176B5B]":"text-[#173A2E]"}`}>
                  {isPend&&<span className="text-[#D47713] mr-0.5">⇄</span>}{isAsgn&&<span className="text-[#247653] mr-0.5">⇄</span>}
                  {p.nombre} {p.apellido??""}
                </span>
                {isAsgn&&<span className="text-[10px] font-black text-[#247653] leading-tight">▸ {entry.replacement.nombre} {entry.replacement.apellido??""}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="grid items-center px-3 py-2 min-h-[68px] border-b-2 border-[#BCD8D4] last:border-0" style={{gridTemplateColumns:"1fr 3fr 0.7fr 0.7fr 0.8fr"}}>
      <div className="flex items-center justify-center pr-1">
        {hasRes ? (
          <button onClick={canEdit ? onResultClick : undefined}
            className={`text-[12px] font-black text-center leading-tight ${canEdit ? "text-[#176B5B] underline hover:text-[#0B8457] transition-colors" : "text-[#173A2E]"}`}>
            {isWO ? "WO" : res.score || "✓"}
          </button>
        ) : canEdit ? (
          <button onClick={onResultClick}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-[#0B8457] hover:bg-[#086847] transition-colors">
            <span className="text-[10px] font-black text-white leading-none text-center">Ingresar</span>
            <span className="text-[10px] font-black text-white leading-none text-center">Resultados</span>
          </button>
        ) : (
          <span className="text-[11px] text-[#CFE7DC] font-black">—</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 px-2">
        <div className="flex-1">{renderTeam(match.teamA,"teamA")}</div>
        <div className="text-[9px] font-black text-[#9FCFC3] leading-none tracking-widest shrink-0">VS</div>
        <div className="flex-1">{renderTeam(match.teamB,"teamB")}</div>
      </div>
      <div className="text-center"><span className={`text-[11px] font-black ${canEdit?"text-[#176B5B]":"text-[#173A2E]"}`}>{dayLabel??""}</span></div>
      <div className="text-center"><span className={`text-[11px] font-black ${canEdit?"text-[#176B5B]":"text-[#173A2E]"}`}>{match.timeSlot??""}</span></div>
      <div className="flex items-center justify-center relative">
        {canEdit&&<button onClick={onActionsClick} className="w-7 h-7 bg-[#EDF7F2] border border-[#C9E5D8] rounded-[8px] flex items-center justify-center hover:bg-[#DDF6EF] transition-colors"><MoreVertical size={14} className="text-[#086847]"/></button>}
        {dotColor&&<div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white" style={{background:dotColor}}/>}
      </div>
    </div>
  );
}

// ── RoundBlock (fixture) ───────────────────────────────────────────────────
function FxRoundBlock({ round, canEdit, dayLabel, onResultClick, onActionsClick, onSuspensionClick }: { round: any; canEdit: boolean; dayLabel?: string; onResultClick: (id:string)=>void; onActionsClick: (id:string)=>void; onSuspensionClick: ()=>void }) {
  const status = fxRoundStatus(round); const st = FX_STATUS[status];
  return (
    <div className="rounded-xl overflow-hidden border border-[#BCD8D4]">
      <div className={`px-4 py-2 flex items-center justify-between border-b border-[#9FCFC3] ${st.hBg}`} style={{minHeight:38}}>
        <span className="text-[14px] font-black text-[#1E5F57] uppercase tracking-[.06em]">{round.title??`Fecha ${round.number}`}</span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${st.dot}`}/>
          <span className={`text-[11px] font-black ${st.text}`}>{st.label}</span>
          {canEdit&&<button onClick={onSuspensionClick} className="ml-1 w-6 h-6 rounded-lg bg-white/50 flex items-center justify-center hover:bg-white/80 transition-colors"><MoreVertical size={12} className="text-[#1E5F57]"/></button>}
        </div>
      </div>
      {round.matches?.length>0&&(
        <div className="grid items-center px-3 py-1.5 bg-[#DCEFEB] border-b border-[#BCD8D4]" style={{gridTemplateColumns:"1fr 3fr 0.7fr 0.7fr 0.8fr",minHeight:32}}>
          {["RESULTADOS","PAREJAS","DIA","HORA","REEMPLAZOS"].map((col,i)=><div key={i} className="text-[10px] font-black text-[#285E59] text-center">{col}</div>)}
        </div>
      )}
      <div className="bg-white">
        {(!round.matches||round.matches.length===0)
          ?<div className="px-4 py-4 text-sm text-[#5F7D72] italic text-center">Sin partidos</div>
          :round.matches.map((m:any)=><FxMatchRow key={m.id} match={m} canEdit={canEdit&&status!=="suspended"} dayLabel={dayLabel} onResultClick={()=>onResultClick(m.id)} onActionsClick={()=>onActionsClick(m.id)}/>)
        }
        {round.byeLabels?.length>0&&<div className="px-4 py-2 text-[11px] text-[#5F7D72] italic border-t border-[#E4ECEA]">Libre: {round.byeLabels.join(", ")}</div>}
      </div>
    </div>
  );
}

// ── Tabla de posiciones ────────────────────────────────────────────────────
function buildStandings(liga: any) {
  const sc = liga.scoringSettings ?? {};
  const pointsWin    = sc.pointsWin  ?? 3;
  const pointsLoss   = sc.pointsLoss ?? 1;
  const penaltyPts   = sc.replacementPenalty ?? 1;
  const penaltyQuota = sc.replacementQuota   ?? 0;
  const isInd = liga.teamType === "individual";

  const table: Record<string, any> = {};
  const init = (id: string, nombre: string) => {
    if (!table[id]) table[id] = { id, nombre, pj:0, pg:0, pp:0, sf:0, sc2:0, gf:0, gc:0, pts:0, pen:0, reps:0 };
  };
  const addResult = (id: string, won: boolean, sf: number, sc2: number, gf: number, gc: number, isWO: boolean) => {
    table[id].pj++;
    if (isWO) {
      if (won) { table[id].pg++; table[id].pts += sc.pointsWalkoverWin ?? pointsWin; }
      else { table[id].pp++; }
    } else {
      if (won) { table[id].pg++; table[id].pts += pointsWin; }
      else { table[id].pp++; table[id].pts += pointsLoss; }
      table[id].sf += sf; table[id].sc2 += sc2; table[id].gf += gf; table[id].gc += gc;
    }
  };

  (liga.fixture?.rounds ?? []).forEach((round: any) => {
    (round.matches ?? []).forEach((m: any) => {
      // Remplazos
      Object.keys(m.replacements ?? {}).forEach(k => {
        const teamKey = k.startsWith("teamA") ? "teamA" : "teamB";
        if (isInd) {
          const playerId = k.split(":")[1];
          if (playerId) {
            if (!table[playerId]) {
              const player = (m[teamKey]?.players ?? []).find((p:any) => p.id === playerId);
              init(playerId, player ? `${player.nombre ?? ""} ${player.apellido ?? ""}`.trim() : playerId);
            }
            table[playerId].reps++;
          }
        } else {
          const tid = m[teamKey]?.id;
          if (tid) {
            if (!table[tid]) init(tid, m[teamKey]?.label ?? tid);
            table[tid].reps++;
          }
        }
      });

      const res = m.result;
      if (!res?.winner || res.winner === "") return;

      // Sets / games
      let asets=0, bsets=0, ag=0, bg=0;
      (res.sets ?? []).forEach((s: any) => {
        const o = parseInt(s.own??"0"), r2 = parseInt(s.rival??"0");
        if (res.winner==="teamA") { ag+=o; bg+=r2; if(o>r2)asets++; else bsets++; }
        else { bg+=o; ag+=r2; if(o>r2)bsets++; else asets++; }
      });
      if (!res.sets?.length && res.score) {
        res.score.split(" ").forEach((set: string) => {
          const [p1,p2] = set.split("-").map(Number);
          if(!isNaN(p1)&&!isNaN(p2)){ ag+=p1; bg+=p2; if(p1>p2)asets++; else bsets++; }
        });
      }
      const isWO = res.reason==="walkover" || res.winner==="walkover";
      const aWon = res.winner === "teamA";

      if (isInd) {
        // Liga individual: acumular por jugador (ID de Firebase, estable entre fechas)
        const allSlots = [
          ...(m.teamA?.players ?? []).map((p:any) => ({ p, won: aWon  })),
          ...(m.teamB?.players ?? []).map((p:any) => ({ p, won: !aWon })),
        ];
        allSlots.forEach(({ p, won }) => {
          if (!p?.id) return;
          init(p.id, `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || "Jugador");
          addResult(p.id, won, won ? asets : bsets, won ? bsets : asets, won ? ag : bg, won ? bg : ag, isWO);
        });
      } else {
        // Liga por parejas: acumular por equipo (pair-team-N, estable)
        const aId = m.teamA?.id ?? "A";
        const bId = m.teamB?.id ?? "B";
        init(aId, m.teamA?.label ?? "A");
        init(bId, m.teamB?.label ?? "B");
        addResult(aId,  aWon, asets, bsets, ag, bg, isWO);
        addResult(bId, !aWon, bsets, asets, bg, ag, isWO);
      }
    });
  });

  Object.values(table).forEach((row: any) => {
    if (row.reps > penaltyQuota) {
      row.pen = (row.reps - penaltyQuota) * penaltyPts;
      row.pts = Math.max(0, row.pts - row.pen);
    }
  });

  return Object.values(table).sort((a: any, b: any) =>
    b.pts - a.pts ||
    (b.sf - b.sc2) - (a.sf - a.sc2) ||
    b.sf - a.sf ||
    (b.gf - b.gc) - (a.gf - a.gc) ||
    (a.nombre ?? "").localeCompare(b.nombre ?? "")
  );
}

function StandingsTable({rows}: {rows:any[]}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{minWidth: 540}}>
        <thead>
          <tr className="text-xs font-bold uppercase" style={{borderBottom:"2px solid #CFE7DC", color:"#5F7D72"}}>
            <th className="pl-5 pr-3 py-3 text-left w-8">#</th>
            <th className="px-2 py-3 text-left">Nombre</th>
            <th className="px-2 py-3 text-center w-12" style={{color:"#086847"}}>Pts</th>
            <th className="px-2 py-3 text-center w-10">R</th>
            <th className="px-2 py-3 text-center w-10">PJ</th>
            <th className="px-2 py-3 text-center w-10">PG</th>
            <th className="px-2 py-3 text-center w-10">PP</th>
            <th className="px-2 py-3 text-center w-10">SF</th>
            <th className="px-2 py-3 text-center w-10">SC</th>
            <th className="px-2 py-3 text-center w-12">DIF</th>
            <th className="pr-5 pl-2 py-3 text-center w-12">DG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>{
            const dif = (r.sf??0) - (r.sc2??0);
            const dg  = (r.gf??0) - (r.gc??0);
            const isFirst = i === 0;
            return (
              <tr
                key={r.id ?? i}
                style={{
                  borderBottom: "1px solid #F0F7F4",
                  background: isFirst ? "rgba(11,132,87,0.06)" : undefined,
                }}
              >
                <td className="pl-5 pr-3 py-3 text-xs font-black" style={{color:"#5F7D72"}}>{i+1}</td>
                <td className="px-2 py-3 font-semibold text-sm" style={{color: isFirst ? "#0B8457" : "#173A2E"}}>
                  {isFirst && <Shield size={11} className="inline mr-1.5" style={{color:"#0B8457"}}/>}
                  {r.nombre}
                </td>
                <td className="px-2 py-3 text-center font-black text-base" style={{color:"#086847"}}>{r.pts}</td>
                <td className="px-2 py-3 text-center text-xs font-semibold" style={{color: (r.reps??0)>0 ? "#D97706" : "#5F7D72"}}>
                  {r.reps ?? 0}
                </td>
                <td className="px-2 py-3 text-center text-xs" style={{color:"#5F7D72"}}>{r.pj}</td>
                <td className="px-2 py-3 text-center text-xs font-semibold" style={{color:"#0B8457"}}>{r.pg}</td>
                <td className="px-2 py-3 text-center text-xs" style={{color:"#E87070"}}>{r.pp}</td>
                <td className="px-2 py-3 text-center text-xs" style={{color:"#5F7D72"}}>{r.sf}</td>
                <td className="px-2 py-3 text-center text-xs" style={{color:"#5F7D72"}}>{r.sc2}</td>
                <td className="px-2 py-3 text-center text-xs font-semibold" style={{color: dif>0?"#0B8457":dif<0?"#E87070":"#5F7D72"}}>
                  {dif>0?`+${dif}`:dif}
                </td>
                <td className="pr-5 pl-2 py-3 text-center text-xs font-semibold" style={{color: dg>0?"#0B8457":dg<0?"#E87070":"#5F7D72"}}>
                  {dg>0?`+${dg}`:dg}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal resultado ────────────────────────────────────────────────────────
function ResultModal({ match, matchFormat, onClose, onSave }: any) {
  const [winner, setWinner] = useState(match.result?.winner ?? "");
  const [sets, setSets] = useState<{own:string;rival:string}[]>(
    match.result?.sets?.length
      ? match.result.sets
      : [{ own:"", rival:"" }, { own:"", rival:"" }, { own:"", rival:"" }]
  );
  const [saving, setSaving] = useState(false);
  const aLabel = match.teamA?.label ?? match.pair1Name ?? "Pareja A";
  const bLabel = match.teamB?.label ?? match.pair2Name ?? "Pareja B";
  const maxSets = matchFormat==="single_set" ? 1 : matchFormat==="two_sets_super_tiebreak" ? 2 : 3;

  async function handleSave() {
    if (!winner) return;
    setSaving(true);
    const setsToSave = winner==="walkover" ? [] : sets.slice(0,maxSets).filter(s=>s.own!==""||s.rival!=="");
    await onSave({ winner, score: setsToSave.map(s=>`${s.own}-${s.rival}`).join(" "), reason: winner==="walkover"?"walkover":"normal", sets: setsToSave });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-pn-navy text-lg">Cargar resultado</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ganador</label>
        <div className="flex flex-col gap-2 mb-5">
          {[{v:"teamA",l:aLabel},{v:"teamB",l:bLabel},{v:"walkover",l:"Walkover"}].map(opt=>(
            <button key={opt.v} onClick={()=>setWinner(opt.v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${winner===opt.v?"border-pn-green bg-pn-mint text-pn-navy":"border-gray-100 text-gray-600 hover:border-gray-200"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${winner===opt.v?"bg-pn-green border-pn-green":"border-gray-300"}`}/>
              {opt.l}
            </button>
          ))}
        </div>
        {winner && winner!=="walkover" && (
          <>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sets</label>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center mb-5">
              <div className="text-right text-xs font-bold text-pn-navy truncate">{aLabel.split(" / ")[0]}</div>
              <div />
              <div className="text-xs font-bold text-pn-navy truncate">{bLabel.split(" / ")[0]}</div>
              {Array.from({length:maxSets}).map((_,i)=>(
                <>
                  <input key={`a${i}`} value={sets[i]?.own??""} onChange={e=>setSets(p=>p.map((s,j)=>j===i?{...s,own:e.target.value}:s))}
                    className="w-full text-center border-2 border-gray-100 rounded-xl py-2 text-base font-black focus:outline-none focus:border-pn-green"
                    placeholder="0" type="number" min="0" max="99"/>
                  <span key={`d${i}`} className="text-center text-gray-300 font-black text-lg">—</span>
                  <input key={`b${i}`} value={sets[i]?.rival??""} onChange={e=>setSets(p=>p.map((s,j)=>j===i?{...s,rival:e.target.value}:s))}
                    className="w-full text-center border-2 border-gray-100 rounded-xl py-2 text-base font-black focus:outline-none focus:border-pn-green"
                    placeholder="0" type="number" min="0" max="99"/>
                </>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
          <button onClick={handleSave} disabled={!winner||saving}
            className="flex-1 py-3 rounded-xl bg-pn-green text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={15}/>{saving?"Guardando...":"Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers de pagos ──────────────────────────────────────────────────────
const REGISTRATION_ROUND_ID = "__league_registration_fee__";

function participantKey(player: any): string {
  return player.linkedUserId || player.id || player.nombre || "";
}

const EDAD_MINIMA_MENSAJES = 14;

function calcularEdad(fechaNacimiento: string): number | null {
  if (!fechaNacimiento) return null;
  const parts = String(fechaNacimiento).split("-").map(Number);
  if (parts.length !== 3 || !parts[0]) return null;
  const [year, month, day] = parts;
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function esMenorRestringido(fechaNacimiento: string): boolean {
  if (!fechaNacimiento) return false;
  const age = calcularEdad(fechaNacimiento);
  return age !== null && age < EDAD_MINIMA_MENSAJES;
}

function playerLabel(player: any): string {
  return `${player.nombre || ""} ${player.apellido || ""}`.trim() || "Jugador";
}

function resolveRoundEntries(round: any, storedRoundPayments: any[], liga: any): any[] {
  const matches = (round.matches ?? []).filter((m: any) => {
    if (m?.suspensionMode && !m?.result?.winner) return false;
    return (m?.teamA?.players?.length || m?.teamB?.players?.length);
  });
  const stored = storedRoundPayments.find((r: any) => r.roundId === round.id) ?? { entries: [] };

  if (liga.teamType === "pair") {
    const teams = matches.flatMap((m: any) => [m.teamA, m.teamB]).filter(Boolean);
    const seenTeams = new Set<string>();
    const result: any[] = [];
    for (const team of teams) {
      const tKey = team.id || "";
      if (!tKey || seenTeams.has(tKey)) continue;
      seenTeams.add(tKey);
      const pairLabel = team.label || (team.players ?? []).map(playerLabel).join(" / ");
      for (const player of (team.players ?? [])) {
        const pid = participantKey(player);
        const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
        result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel,
          paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
      }
    }
    return result;
  }

  const players = matches.flatMap((m: any) => [...(m?.teamA?.players ?? []), ...(m?.teamB?.players ?? [])]);
  const seen = new Set<string>();
  const result: any[] = [];
  for (const player of players) {
    const pid = participantKey(player);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
    result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel: "",
      paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
  }
  return result;
}

function resolveRegistrationEntries(storedRoundPayments: any[], liga: any): any[] {
  const stored = storedRoundPayments.find((r: any) => r.roundId === REGISTRATION_ROUND_ID) ?? { entries: [] };
  const players: any[] = liga.players ?? [];

  if (liga.teamType === "pair") {
    const pairs: Record<number, any[]> = {};
    players.forEach((p: any) => { const n = p.pairNumber ?? 0; if (!pairs[n]) pairs[n] = []; pairs[n].push(p); });
    return Object.values(pairs).flatMap((pp) => {
      const pairLabel = pp.map(playerLabel).join(" / ");
      return pp.map((player: any) => {
        const pid = participantKey(player);
        const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
        return { participantId: pid, participantLabel: playerLabel(player), pairLabel,
          paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" };
      });
    });
  }

  const seen = new Set<string>();
  const result: any[] = [];
  for (const player of players) {
    const pid = participantKey(player);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
    result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel: "",
      paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
  }
  return result;
}

// ── Página principal ───────────────────────────────────────────────────────
export default function LigaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ligaId = params.id as string;

  const [liga, setLiga]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<Tab>("jugadores");
  const [resultModal, setResultModal] = useState<{ri:number;mi:number}|null>(null);
  const [comprobanteUrl, setComprobanteUrl] = useState<string|null>(null);
  const [savingPayment, setSavingPayment] = useState<string|null>(null);
  const [openMenu, setOpenMenu] = useState<string|null>(null);
  const [playerProfile, setPlayerProfile] = useState<any|null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileView, setProfileView] = useState<"main"|"message"|"report">("main");
  const [profileMsgText, setProfileMsgText] = useState("");
  const [profileReportText, setProfileReportText] = useState("");
  const [profileActionLoading, setProfileActionLoading] = useState(false);
  const [openBlocks, setOpenBlocks] = useState<Record<string,boolean>>({});
  const [paymentModal, setPaymentModal] = useState<{blockId:string;blockTitle:string;entry:any}|null>(null);
  const [modalMethod, setModalMethod] = useState<"efectivo"|"transferencia">("efectivo");
  const [modalFile, setModalFile] = useState<File|null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [toast, setToast] = useState<{msg:string;ok:boolean}|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fixture state ────────────────────────────────────────────────────────
  const [fixtureDraft, setFixtureDraft] = useState<any>({ generatedAtMillis: 0, rounds: [] });
  const [fxResultTarget, setFxResultTarget] = useState<{roundId:string;matchId:string}|null>(null);
  const [fxActionsTarget, setFxActionsTarget] = useState<{roundId:string;matchId:string}|null>(null);
  const [fxSuspTarget, setFxSuspTarget] = useState<string|null>(null);
  const [fxGenOpen, setFxGenOpen] = useState(false);
  const [fxConfirmRegen, setFxConfirmRegen] = useState(false);
  const [fxConfirmDelete, setFxConfirmDelete] = useState(false);
  const [fxSaving, setFxSaving] = useState(false);

  // ── Player management state ──────────────────────────────────────────────
  const [registeredPlayers, setRegisteredPlayers] = useState<any[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [sidePickerOpen, setSidePickerOpen] = useState(false);
  const [pairPickerOpen, setPairPickerOpen] = useState(false);
  const [pendingPlayer, setPendingPlayer] = useState<any>(null);
  const [pendingIsGuest, setPendingIsGuest] = useState(false);
  const [replacementTargetId, setReplacementTargetId] = useState("");
  const [savingPlayers, setSavingPlayers] = useState(false);
  const [registrationRequests, setRegistrationRequests] = useState<any[]>([]);
  const [expandedPairs, setExpandedPairs] = useState<number[]>([]);

  const filteredRegisteredPlayers = useMemo(() => {
    if (!playerQuery) return registeredPlayers.slice(0, 12);
    const q = normalizeText(playerQuery);
    return registeredPlayers
      .filter(p =>
        normalizeText(`${p.nombre ?? ""} ${p.apellido ?? ""}`).includes(q) ||
        normalizeText(p.categoria ?? "").includes(q) ||
        normalizeText(p.ciudad ?? "").includes(q)
      )
      .slice(0, 12);
  }, [registeredPlayers, playerQuery]);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async(u)=>{
      if(!u){router.push("/login");return;}
      const snap = await getDoc(doc(db,"leagues",ligaId));
      if(snap.exists()) {
        const data:any = {id:snap.id,...snap.data()};
        setLiga(data);
        setFixtureDraft(data.fixture ?? {generatedAtMillis:0,rounds:[]});
      }
      setLoading(false);
    });
    return unsub;
  },[ligaId,router]);

  // Carga jugadores registrados + solicitudes al abrir el tab
  useEffect(()=>{
    if((tab !== "jugadores" && tab !== "fixture") || playersLoaded) return;
    async function load() {
      try {
        const snap = await getDocs(fsQuery(collection(db,"users"), where("accountDeleted","!=",true)));
        const all: any[] = snap.docs
          .map(d=>({id:d.id,...d.data()}))
          .filter((u:any)=>u.role!=="blocked"&&u.role!=="deleted");
        all.sort((a:any,b:any)=>normalizeText(`${a.nombre??""} ${a.apellido??""}`).localeCompare(normalizeText(`${b.nombre??""} ${b.apellido??""}`)));
        setRegisteredPlayers(all);
      } catch {}
      setPlayersLoaded(true);
    }
    async function loadRequests() {
      try {
        const snap = await getDocs(fsQuery(collection(db,"leagueRegistrationRequests"),where("leagueId","==",ligaId)));
        setRegistrationRequests(snap.docs.map(d=>({id:d.id,...d.data()})));
      } catch {}
    }
    load();
    loadRequests();
  },[tab,playersLoaded,ligaId]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function lookupPlayer(participantId: string): any {
    return (liga.players ?? []).find((p: any) => {
      const key = p.linkedUserId || p.id || p.nombre || "";
      return key === participantId;
    });
  }

  async function openPlayerProfile(p: any) {
    setPlayerProfile(p);
    setProfileView("main");
    setProfileMsgText("");
    setProfileReportText("");
    if (p.linkedUserId) {
      setProfileLoading(true);
      try {
        const snap = await getDoc(doc(db, "users", p.linkedUserId));
        if (snap.exists()) setPlayerProfile({ ...p, ...snap.data() });
      } catch {}
      setProfileLoading(false);
    }
  }

  function closePlayerProfile() {
    setPlayerProfile(null);
    setProfileLoading(false);
    setProfileView("main");
    setProfileMsgText("");
    setProfileReportText("");
  }

  async function sendProfileMessage() {
    const pp = playerProfile;
    if (!profileMsgText.trim() || !pp?.linkedUserId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setProfileActionLoading(true);
    const otherUserId = pp.linkedUserId;
    const text = profileMsgText.trim();
    const playerName = `${pp.nombre||""} ${pp.apellido||""}`.trim();
    const conversationId = [currentUser.uid, otherUserId].sort().join("__");
    const convRef = doc(db, "conversations", conversationId);
    const msgsRef = collection(db, "conversations", conversationId, "messages");
    try {
      await setDoc(convRef, {
        participants: [currentUser.uid, otherUserId].sort(),
        participantNames: { [currentUser.uid]: currentUser.displayName||"Organizador", [otherUserId]: playerName },
        unreadBy: [otherUserId], lastMessageText: text, lastMessageSenderId: currentUser.uid,
        updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      }, { merge: true });
      await addDoc(msgsRef, { text, senderId: currentUser.uid, recipientId: otherUserId, createdAt: serverTimestamp() });
      await updateDoc(convRef, {
        updatedAt: serverTimestamp(), [`unreadCountBy.${otherUserId}`]: increment(1),
        [`unreadCountBy.${currentUser.uid}`]: 0, unreadBy: [otherUserId],
        lastMessageText: text, lastMessageSenderId: currentUser.uid,
      });
      showToast("Mensaje enviado.");
      closePlayerProfile();
    } catch { showToast("No pudimos enviar el mensaje.", false); }
    setProfileActionLoading(false);
  }

  async function submitProfileReport() {
    const pp = playerProfile;
    if (!profileReportText.trim() || !pp) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setProfileActionLoading(true);
    const playerName = `${pp.nombre||""} ${pp.apellido||""}`.trim();
    const targetId = pp.linkedUserId || pp.id || "";
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.uid,
        reporterName: currentUser.displayName || "Organizador",
        reporterRole: "organizer",
        targetType: "profile",
        targetId,
        targetTitle: playerName,
        description: profileReportText.trim(),
        metadata: { category: pp.categoria||"", city: pp.ciudad||"", reportedUserId: targetId, reportedUserName: playerName },
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("Reporte enviado. Lo revisaremos a la brevedad.");
      closePlayerProfile();
    } catch { showToast("No pudimos enviar el reporte.", false); }
    setProfileActionLoading(false);
  }

  function buildWhatsAppUrl(participantId: string, roundTitle: string): string {
    const player = lookupPlayer(participantId);
    const raw = (player?.telefono || player?.celular || player?.phone || player?.whatsapp || "").replace(/\D/g, "");
    if (!raw) return "";
    const phone = raw.startsWith("54") ? raw : "54" + (raw.startsWith("0") ? raw.slice(1) : raw);
    const ligaName = liga.nombre || liga.name || "la liga";
    const msg = `Hola ${player?.nombre || ""}! Te recordamos que tenés el pago de ${roundTitle} pendiente en ${ligaName}. Si ya pagaste, marcalo en la app. Gracias!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  async function sendReminderChat(entry: any, roundTitle: string) {
    const player = lookupPlayer(entry.participantId);
    const otherUserId = player?.linkedUserId || "";
    if (!otherUserId) { showToast("Este jugador no tiene cuenta vinculada en la app.", false); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const ligaName = liga.nombre || liga.name || "la liga";
    const text = `Hola! Te recordamos que tenés el pago de "${roundTitle}" pendiente en ${ligaName}.`;
    const conversationId = [currentUser.uid, otherUserId].sort().join("__");
    const convRef = doc(db, "conversations", conversationId);
    const msgsRef = collection(db, "conversations", conversationId, "messages");
    await setDoc(convRef, {
      participants: [currentUser.uid, otherUserId].sort(),
      participantNames: { [currentUser.uid]: currentUser.displayName || "Organizador", [otherUserId]: entry.participantLabel || "Jugador" },
      unreadBy: [otherUserId], lastMessageText: text, lastMessageSenderId: currentUser.uid,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(msgsRef, { text, senderId: currentUser.uid, recipientId: otherUserId, createdAt: serverTimestamp() });
    await updateDoc(convRef, {
      updatedAt: serverTimestamp(), [`unreadCountBy.${otherUserId}`]: increment(1),
      [`unreadCountBy.${currentUser.uid}`]: 0, unreadBy: [otherUserId],
      lastMessageText: text, lastMessageSenderId: currentUser.uid,
    });
    showToast("Mensaje enviado por mensajería interna.");
  }

  async function savePaymentModal() {
    if (!paymentModal) return;
    setUploadingProof(true);
    try {
      let proofUrl = paymentModal.entry.proofUrl || "";
      if (modalFile) {
        const ext = modalFile.name.split(".").pop() ?? "jpg";
        const path = `leaguePaymentProofs/${ligaId}/${paymentModal.blockId.replace(/[^a-zA-Z0-9]/g,"_")}/${paymentModal.entry.participantId}/${Date.now()}.${ext}`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, modalFile);
        proofUrl = await getDownloadURL(sRef);
      }
      const rp: any[] = liga.roundPayments ?? [];
      const round = (liga.fixture?.rounds ?? []).find((r: any) => r.id === paymentModal.blockId);
      const entries = paymentModal.blockId === REGISTRATION_ROUND_ID
        ? resolveRegistrationEntries(rp, liga)
        : round ? resolveRoundEntries(round, rp, liga) : [];
      const updatedEntries = entries.map((e: any) =>
        e.participantId === paymentModal.entry.participantId
          ? { ...e, paymentStatus: "pagado", paymentMethod: modalMethod, ...(proofUrl ? { proofUrl } : {}) }
          : e
      );
      const updated = [...rp.filter((r: any) => r.roundId !== paymentModal.blockId), { roundId: paymentModal.blockId, entries: updatedEntries }];
      await updateDoc(doc(db, "leagues", ligaId), { roundPayments: updated });
      setLiga((prev: any) => ({ ...prev, roundPayments: updated }));
      setPaymentModal(null); setModalFile(null);
      showToast("Pago registrado correctamente.");
    } catch { showToast("Error al guardar el pago.", false); }
    finally { setUploadingProof(false); }
  }

  async function setPaymentStatus(roundId: string, participantId: string, status: string) {
    const key = `${roundId}:${participantId}`;
    setSavingPayment(key);
    try {
      const roundPayments: any[] = liga.roundPayments ?? [];
      const round = (liga.fixture?.rounds ?? []).find((r: any) => r.id === roundId);
      const entries = roundId === REGISTRATION_ROUND_ID
        ? resolveRegistrationEntries(roundPayments, liga)
        : round ? resolveRoundEntries(round, roundPayments, liga) : [];
      const updatedEntries = entries.map((e: any) =>
        e.participantId === participantId ? { ...e, paymentStatus: status } : e
      );
      const updatedRoundPayments = [
        ...roundPayments.filter((r: any) => r.roundId !== roundId),
        { roundId, entries: updatedEntries },
      ];
      await updateDoc(doc(db, "leagues", ligaId), { roundPayments: updatedRoundPayments });
      setLiga((prev: any) => ({ ...prev, roundPayments: updatedRoundPayments }));
    } finally {
      setSavingPayment(null);
    }
  }

  async function saveResult(ri:number,mi:number,result:any){
    const rounds=(liga.fixture?.rounds??[]).map((r:any,i:number)=>
      i!==ri?r:{...r,matches:r.matches.map((m:any,j:number)=>j!==mi?m:{...m,result})}
    );
    await updateDoc(doc(db,"leagues",ligaId),{"fixture.rounds":rounds});
    setLiga((p:any)=>({...p,fixture:{...p.fixture,rounds}}));
    setResultModal(null);
  }

  // ── Fixture CRUD ──────────────────────────────────────────────────────────
  async function fxSaveToFirestore(fixture: any) {
    setFxSaving(true);
    try {
      await updateDoc(doc(db,"leagues",ligaId),{fixture, updatedAt:serverTimestamp()});
      setLiga((p:any)=>({...p,fixture}));
      setFixtureDraft(fixture);
      showToast("Fixture guardado.");
    } catch { showToast("Error al guardar.", false); }
    setFxSaving(false);
  }

  function fxUpdateMatch(roundId:string, matchId:string, updater:(m:any)=>any) {
    setFixtureDraft((prev:any)=>{
      const rounds = prev.rounds.map((r:any)=>{
        if(r.id!==roundId) return r;
        const matches = r.matches.map((m:any)=>m.id!==matchId?m:updater(m));
        const allDone = matches.length>0 && matches.every((m:any)=>m.result?.winner&&m.result.winner!=="");
        return {...r, matches, completedAtMillis: allDone?(r.completedAtMillis||Date.now()):0};
      });
      return {...prev, rounds};
    });
  }

  function fxUpdateRound(roundId:string, updater:(r:any)=>any) {
    setFixtureDraft((prev:any)=>({...prev, rounds:prev.rounds.map((r:any)=>r.id!==roundId?r:updater(r))}));
  }

  async function fxSendReplacementNotifications(match: any, prevReplacements: any, newReplacements: any, roundTitle: string) {
    const ligaNombre = liga?.nombre ?? "la liga";
    const hora = match.timeSlot ? ` a las ${match.timeSlot}` : "";
    const dia = DAY_LABELS[liga?.scheduleConfig?.dayKey ?? ""] ?? "";
    const whenLine = dia ? `${roundTitle} — ${dia}${hora}` : `${roundTitle}${hora}`;
    const complejoNombre = liga?.complejo?.nombre && liga.complejo.nombre !== "Complejo sin definir"
      ? liga.complejo.nombre : "";
    await Promise.allSettled(
      Object.entries(newReplacements).map(async ([key, entry]: [string, any]) => {
        if (!entry?.replacement) return;
        const wasAlreadyAssigned = !!(prevReplacements?.[key]?.replacement);
        if (wasAlreadyAssigned) return;
        const teamKey = key.split(":")[0];
        const teamPlayers: any[] = match[teamKey]?.players ?? [];
        const titularPlayer = teamPlayers.find((p:any) => fxRepKey(teamKey, p) === key);
        // Fallback: buscar linkedUserId en liga.players si el fixture no lo tiene
        const titularLinkedIdFromFixture = titularPlayer?.linkedUserId ?? "";
        const titularLinkedIdFromLiga = !titularLinkedIdFromFixture
          ? (liga?.players ?? []).find((p:any) =>
              p.id === (titularPlayer?.id ?? entry.titular?.id) ||
              (p.nombre === (titularPlayer?.nombre ?? entry.titular?.nombre) && p.apellido === (titularPlayer?.apellido ?? entry.titular?.apellido))
            )?.linkedUserId ?? ""
          : "";
        const titularLinkedId = titularLinkedIdFromFixture || titularLinkedIdFromLiga;
        const titularNombre = `${entry.titular?.nombre ?? titularPlayer?.nombre ?? ""} ${entry.titular?.apellido ?? titularPlayer?.apellido ?? ""}`.trim();
        const replacementLinkedId = entry.replacement.linkedUserId ?? "";
        const replacementNombre = `${entry.replacement.nombre ?? ""} ${entry.replacement.apellido ?? ""}`.trim();
        if (titularLinkedId) {
          const lines = [
            `Hola! El organizador de ${ligaNombre} registró un reemplazo para tu lugar en un partido.`,
            ``,
            `📅 ${whenLine}`,
            complejoNombre ? `🏟️ ${complejoNombre}` : "",
            ``,
            `${replacementNombre} jugará en tu lugar. ¡Nos vemos en la próxima fecha! 🎾`,
          ].filter(l => l !== undefined && !(l === "" && !complejoNombre)).join("\n");
          await sendSystemMsg(db, titularLinkedId, titularNombre, lines);
        }
        if (replacementLinkedId) {
          const lines = [
            `¡Hola! Quedaste confirmado/a como reemplazante en ${ligaNombre}.`,
            ``,
            `📅 ${whenLine}`,
            complejoNombre ? `🏟️ ${complejoNombre}` : "",
            ``,
            `Reemplazás a ${titularNombre}. ¡Mucha suerte!`,
          ].filter(l => l !== undefined && !(l === "" && !complejoNombre)).join("\n");
          await sendSystemMsg(db, replacementLinkedId, replacementNombre, lines);
        }
      })
    );
  }

  async function fxHandleGenerate(fixture: any) {
    setFxGenOpen(false);
    await fxSaveToFirestore(fixture);
  }

  async function fxHandleDelete() {
    setFxConfirmDelete(false);
    await fxSaveToFirestore({generatedAtMillis:0, rounds:[]});
  }

  async function fxHandleRegenerate() {
    setFxConfirmRegen(false);
    try { await fxSaveToFirestore(fxGenerate(liga)); }
    catch(e:any){ showToast(e?.message??"Error al regenerar.", false); }
  }

  // ── Player management functions ──────────────────────────────────────────
  async function persistPlayers(nextPlayers: any[]) {
    setSavingPlayers(true);
    try {
      await updateDoc(doc(db,"leagues",ligaId),{
        players: nextPlayers.map(normalizePlayerEntry),
        updatedAt: serverTimestamp(),
      });
      setLiga((prev:any)=>({...prev,players:nextPlayers}));
    } catch { showToast("Error al guardar jugadores.",false); }
    setSavingPlayers(false);
  }

  function handleAddRegisteredPlayer(rp: any) {
    if(replacementTargetId) {
      const target=(liga?.players??[]).find((p:any)=>p.id===replacementTargetId);
      if(!target) return;
      const newP=normalizePlayerEntry({
        id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",
        telefono:rp.telefono??rp.celular??"",categoria:rp.categoria??"",
        sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",foto:rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL||"",
        ladoJuego:target.ladoJuego,ladoPreferido:target.ladoPreferido,pairNumber:target.pairNumber,
      });
      persistPlayers((liga?.players??[]).map((p:any)=>p.id===replacementTargetId?newP:p));
      setReplacementTargetId("");
      return;
    }
    setPendingPlayer(rp);
    setPendingIsGuest(false);
    if(liga?.teamType==="pair") setPairPickerOpen(true);
    else setSidePickerOpen(true);
  }

  function handleGuestCreate() {
    if(!guestName.trim()||!guestLastName.trim()) return;
    setPendingIsGuest(true);
    setPendingPlayer(null);
    setGuestModalOpen(false);
    if(liga?.teamType==="pair") setPairPickerOpen(true);
    else setSidePickerOpen(true);
  }

  function assignToSide(lado:"drive"|"reves") {
    let newP: any;
    if(pendingIsGuest) {
      newP=normalizePlayerEntry({id:`guest-${Date.now()}`,type:"guest",linkedUserId:"",
        nombre:guestName.trim(),apellido:guestLastName.trim(),ladoJuego:lado,
        ladoPreferido:lado==="drive"?"Drive":"Reves",pairNumber:0});
      setGuestName("");setGuestLastName("");
    } else {
      const rp=pendingPlayer;
      newP=normalizePlayerEntry({id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",telefono:rp.telefono??rp.celular??"",
        categoria:rp.categoria??"",sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",
        foto:rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL||"",ladoJuego:lado,ladoPreferido:lado==="drive"?"Drive":"Reves",pairNumber:0});
    }
    persistPlayers([...(liga?.players??[]),newP]);
    setPendingPlayer(null);setPendingIsGuest(false);setSidePickerOpen(false);
  }

  function assignToPair(pairNumber: number) {
    let newP: any;
    if(pendingIsGuest) {
      newP=normalizePlayerEntry({id:`guest-${Date.now()}`,type:"guest",linkedUserId:"",
        nombre:guestName.trim(),apellido:guestLastName.trim(),pairNumber,ladoJuego:"ambos",ladoPreferido:"Ambos lados"});
      setGuestName("");setGuestLastName("");
    } else {
      const rp=pendingPlayer;
      newP=normalizePlayerEntry({id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",telefono:rp.telefono??rp.celular??"",
        categoria:rp.categoria??"",sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",
        foto:rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL||"",pairNumber,ladoJuego:"ambos",ladoPreferido:"Ambos lados"});
    }
    persistPlayers([...(liga?.players??[]),newP]);
    setPendingPlayer(null);setPendingIsGuest(false);setPairPickerOpen(false);
  }

  function handleDeletePlayer(playerId: string) {
    if(!confirm("¿Eliminar este jugador de la liga?")) return;
    persistPlayers((liga?.players??[]).filter((p:any)=>p.id!==playerId));
  }

  async function handleConfirmRequest(req: any) {
    const currentMax=(liga?.players??[]).reduce((m:number,p:any)=>Math.max(m,p.pairNumber??0),0);
    const nextPairNum=currentMax+1;
    const newPlayers:any[]=[];
    const addP=(src:any)=>{
      const linked=src?.linkedUserId||"";
      newPlayers.push(normalizePlayerEntry({
        id:linked?`registered-${linked}`:`guest-${Date.now()+newPlayers.length}`,
        type:linked?"registered":"guest",linkedUserId:linked,
        nombre:src?.nombre??"",apellido:src?.apellido??"",
        foto:src?.foto??"",categoria:src?.categoria??"",sexo:src?.sexo??"",ciudad:src?.ciudad??"",
        pairNumber:liga?.teamType==="pair"?nextPairNum:0,ladoJuego:"ambos",ladoPreferido:"Ambos lados",
      }));
    };
    addP(req.requester);
    if(req.partner) addP(req.partner);
    await persistPlayers([...(liga?.players??[]),...newPlayers]);
    await updateDoc(doc(db,"leagueRegistrationRequests",req.id),{status:"confirmed"});
    setRegistrationRequests(prev=>prev.map((r:any)=>r.id===req.id?{...r,status:"confirmed"}:r));
    showToast("Inscripción confirmada.");
  }

  async function handleRejectRequest(reqId: string) {
    await updateDoc(doc(db,"leagueRegistrationRequests",reqId),{status:"rejected"});
    setRegistrationRequests(prev=>prev.map((r:any)=>r.id===reqId?{...r,status:"rejected"}:r));
    showToast("Solicitud rechazada.");
  }

  if(loading) return (
    <DashboardLayout title="">
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin"/>
      </div>
    </DashboardLayout>
  );
  if(!liga) return (
    <DashboardLayout title="">
      <p className="text-center py-20 text-gray-400">Liga no encontrada.</p>
    </DashboardLayout>
  );

  const players: any[]       = liga.players ?? [];
  const rounds: any[]        = fixtureDraft?.rounds ?? [];
  const fxHasFixture         = (fixtureDraft?.generatedAtMillis ?? 0) > 0 && rounds.length > 0;
  const fxHasUnsaved         = fxHasFixture && JSON.stringify(fixtureDraft) !== JSON.stringify(liga?.fixture ?? {generatedAtMillis:0,rounds:[]});
  const fxValidation         = fxValidate(liga);
  const fxActiveMatch        = fxResultTarget ? rounds.flatMap((r:any)=>r.matches??[]).find((m:any)=>m.id===fxResultTarget.matchId) : null;
  const fxActionsMatch       = fxActionsTarget ? rounds.flatMap((r:any)=>r.matches??[]).find((m:any)=>m.id===fxActionsTarget.matchId) : null;
  const fxSuspRound          = fxSuspTarget ? rounds.find((r:any)=>r.id===fxSuspTarget) : null;
  const fxCanEdit            = liga.organizerId === auth.currentUser?.uid;

  // ── Player computed values ───────────────────────────────────────────────
  const minimumPlayersCount = Math.max(2, liga.fixtureConfig?.minPlayersCount ?? 8);
  const pairPlayersTargetCount = minimumPlayersCount * 2;
  const sideTargetCount = Math.ceil(minimumPlayersCount / 2);
  const driveCount = players.filter((p:any)=>p.ladoJuego==="drive").length;
  const revesCount = players.filter((p:any)=>p.ladoJuego==="reves").length;

  const pairGroupsMap: Record<number,any[]> = {};
  players.forEach((p:any)=>{ const n=p.pairNumber??0; if(!pairGroupsMap[n])pairGroupsMap[n]=[]; pairGroupsMap[n].push(p); });
  const pairGroups = Object.entries(pairGroupsMap)
    .sort(([a],[b])=>Number(a)-Number(b))
    .map(([pn,pp])=>({pairNumber:Number(pn),players:pp}));
  const completePairsCount = pairGroups.filter(g=>g.players.length>=2).length;
  const missingPlayersCount = Math.max(0, pairPlayersTargetCount - players.length);
  const nextPairNumber = pairGroups.length>0 ? Math.max(...pairGroups.map(g=>g.pairNumber))+1 : 1;
  const pendingRequests = registrationRequests.filter((r:any)=>r.status==="pending"||r.status==="awaiting_partner");
  const roundPayments: any[] = liga.roundPayments ?? [];
  const standings            = buildStandings(liga);
  const matchFormat          = liga.matchFormat ?? "three_full_sets";
  const isIndividual         = liga.teamType === "individual";
  const logoUrl              = liga.organizerLogoUrl || liga.organizerLogoURL || liga.complejo?.organizerLogoUrl || liga.complejo?.organizerLogoURL;

  const regFeeEnabled = liga.paymentConfig?.registrationFeeEnabled === true && (liga.paymentConfig?.registrationFeeAmount ?? 0) > 0;
  const allResolvedEntries = [
    ...(regFeeEnabled ? resolveRegistrationEntries(roundPayments, liga) : []),
    ...rounds.flatMap((r: any) => resolveRoundEntries(r, roundPayments, liga)),
  ];
  const cntReview   = allResolvedEntries.filter((e:any)=>e.paymentStatus==="informo_transferencia"||e.paymentStatus==="in_review").length;
  const cntPagado   = allResolvedEntries.filter((e:any)=>e.paymentStatus==="pagado"||e.paymentStatus==="paid").length;
  const completedRounds = rounds.filter((r:any)=>!!r.completedAtMillis).length;

  const modules = [
    {
      id: "jugadores" as Tab,
      label: "Participantes",
      icon: Contact,
      color: "bg-blue-500",
      lightBg: "bg-blue-50",
      lightText: "text-blue-600",
      badge: players.length > 0 ? `${players.length} participantes` : "Sin participantes",
    },
    {
      id: "fixture" as Tab,
      label: "Fixture",
      icon: CalendarDays,
      color: "bg-amber-500",
      lightBg: "bg-amber-50",
      lightText: "text-amber-600",
      badge: rounds.length > 0 ? `${completedRounds}/${rounds.length} fechas` : "Sin fechas",
    },
    {
      id: "posiciones" as Tab,
      label: "Puntajes",
      icon: Trophy,
      color: "bg-violet-500",
      lightBg: "bg-violet-50",
      lightText: "text-violet-600",
      badge: standings.length > 0 ? `${standings.length} equipos` : "Sin resultados",
    },
    {
      id: "pagos" as Tab,
      label: "Pagos",
      icon: Wallet,
      color: "bg-emerald-500",
      lightBg: "bg-emerald-50",
      lightText: "text-emerald-600",
      badge: cntReview > 0 ? `${cntReview} a verificar` : cntPagado > 0 ? `${cntPagado} pagados` : "Sin cobros",
    },
  ];

  const activeModule = modules.find(m => m.id === tab)!;

  return (
    <DashboardLayout title="" wide>

      {/* Volver */}
      <a href="/dashboard/ligas" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-pn-navy transition-colors mb-5">
        <ChevronLeft size={16}/> Mis ligas
      </a>

      {/* ── Layout dos columnas ── */}
      <div className="flex gap-6 items-start">

        {/* ══ PANEL IZQUIERDO (sticky) ══════════════════════════════════ */}
        <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 sticky top-20">

          {/* Card info liga */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">

            {/* Logo */}
            <div className="flex justify-center mb-5">
              {logoUrl
                ? <img src={logoUrl} className="w-20 h-20 rounded-3xl object-cover shadow-md" alt="logo"/>
                : <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center shadow-md">
                    <Trophy size={36} className="text-blue-400"/>
                  </div>
              }
            </div>

            {/* Nombre */}
            <h1 className="font-black text-pn-navy text-xl text-center leading-tight mb-1">{liga.nombre}</h1>

            {/* Badges */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {liga.categoria && (
                <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-1 rounded-full">{liga.categoria}</span>
              )}
              <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2.5 py-1 rounded-full">
                {liga.sexo === "Masculino" ? "Caballeros" : liga.sexo === "Femenino" ? "Damas" : liga.sexo}
              </span>
              <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2.5 py-1 rounded-full">
                {liga.teamType === "pair" ? "Parejas" : "Individual"}
              </span>
            </div>

            {/* Info rows */}
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-gray-400"/>
                </div>
                <span><span className="font-bold text-pn-navy">{players.length}</span> participantes</span>
              </div>

              {liga.scheduleConfig?.dayKey && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={15} className="text-gray-400"/>
                  </div>
                  <span>
                    <span className="font-bold text-pn-navy">{DAY_LABELS[liga.scheduleConfig.dayKey]}</span>
                    {liga.scheduleConfig.timeSlots?.length > 0 && ` · ${liga.scheduleConfig.timeSlots.join(" / ")}`}
                  </span>
                </div>
              )}

              {liga.complejo?.nombre && liga.complejo.nombre !== "Complejo sin definir" && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <MapPin size={15} className="text-gray-400"/>
                  </div>
                  <span className="font-bold text-pn-navy truncate">{liga.complejo.nombre}</span>
                </div>
              )}

              {rounds.length > 0 && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={15} className="text-gray-400"/>
                  </div>
                  <span>
                    <span className="font-bold text-pn-navy">{completedRounds}/{rounds.length}</span> fechas completadas
                  </span>
                </div>
              )}
            </div>

            {/* Estado / archivar */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              {liga.status === "active" ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-pn-green">
                    <span className="w-2 h-2 rounded-full bg-pn-green animate-pulse"/> Activa
                  </span>
                  <button
                    onClick={async()=>{
                      if(confirm("¿Archivar esta liga?"))
                        await updateDoc(doc(db,"leagues",ligaId),{status:"archived"})
                          .then(()=>setLiga((p:any)=>({...p,status:"archived"})));
                    }}
                    className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Archive size={13}/> Archivar
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <Archive size={12}/> Archivada
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* ══ CONTENIDO PRINCIPAL ═══════════════════════════════════════ */}
        <div className="flex-1 min-w-0">

          {/* Header mobile (solo en pantallas pequeñas) */}
          <div className="lg:hidden bg-white rounded-2xl p-4 mb-5 flex items-center gap-4 shadow-sm border border-gray-100">
            {logoUrl
              ? <img src={logoUrl} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"/>
              : <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Trophy size={24} className="text-blue-400"/>
                </div>
            }
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-pn-navy text-base leading-tight truncate">{liga.nombre}</h1>
              <div className="flex flex-wrap gap-1 mt-1">
                {liga.categoria && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{liga.categoria}</span>}
                <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{liga.sexo}</span>
              </div>
            </div>
          </div>

          {/* ── Grid 2x2 de módulos ── */}
          <div className="grid grid-cols-2 gap-3 mb-6">
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
                  {/* Indicador activo */}
                  {isActive && (
                    <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${m.color}`}/>
                  )}

                  {/* Ícono */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-all ${
                    isActive ? m.color : "bg-slate-100 group-hover:bg-slate-200"
                  }`}>
                    <m.icon size={22} className={isActive ? "text-white" : "text-gray-500"} />
                  </div>

                  <div className={`font-black text-base mb-0.5 ${isActive ? "" : "text-pn-navy"}`}>
                    {m.label}
                  </div>
                  <div className={`text-xs font-medium ${isActive ? "opacity-70" : "text-gray-400"}`}>
                    {m.badge}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Contenido de la sección activa ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Header sección */}
            <div className={`px-6 py-4 flex items-center gap-3 border-b border-gray-100 ${activeModule.lightBg}`}>
              <div className={`w-9 h-9 rounded-xl ${activeModule.color} flex items-center justify-center`}>
                <activeModule.icon size={18} className="text-white"/>
              </div>
              <h2 className={`font-black text-lg ${activeModule.lightText}`}>{activeModule.label}</h2>
            </div>

            <div className="p-6">

              {/* ── JUGADORES ─────────────────────────────────────────── */}
              {tab==="jugadores" && (
                <div className="flex flex-col gap-4">

                  {/* Summary */}
                  <div className="flex flex-col gap-0.5">
                    {liga.teamType==="pair" ? (
                      <>
                        <div className="text-sm font-bold text-[#5F7D72]">
                          Participantes cargados {completePairsCount}/{minimumPlayersCount}
                        </div>
                        <div className={`text-xs font-bold ${missingPlayersCount===0?"text-[#086847]":"text-[#8A5700]"}`}>
                          {missingPlayersCount===0 ? "✓ Mínimo completo" : `Faltan ${missingPlayersCount} jugadores para llegar a ${pairPlayersTargetCount}.`}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-[#5F7D72]">
                          Participantes cargados {players.length}/{minimumPlayersCount}
                          <span className="ml-3 font-semibold text-xs">Drive {driveCount}/{sideTargetCount} · Reves {revesCount}/{sideTargetCount}</span>
                        </div>
                        <div className={`text-xs font-bold ${players.length>=minimumPlayersCount?"text-[#086847]":"text-[#8A5700]"}`}>
                          {players.length>=minimumPlayersCount ? "✓ Mínimo completo" : `Faltan ${minimumPlayersCount-players.length} participantes.`}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Solicitudes de inscripción */}
                  {pendingRequests.length>0 && (
                    <div className="bg-[#F2FBF4] border border-[#BFE6C8] rounded-2xl p-3">
                      <div className="text-[11px] font-black text-[#086847] uppercase tracking-wider text-center mb-2">Solicitudes de inscripción</div>
                      <div className="flex flex-col gap-2">
                        {pendingRequests.map((req:any)=>{
                          const rName=`${req.requester?.nombre??""} ${req.requester?.apellido??""}`.trim();
                          const pName=req.partner?`${req.partner?.nombre??""} ${req.partner?.apellido??""}`.trim():null;
                          return (
                            <div key={req.id} className="bg-white border border-[#CFE7DC] rounded-xl p-2.5 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-black text-[#173A2E] text-sm truncate">{rName}</div>
                                {pName&&<div className="text-[11px] text-[#5F7D72] font-semibold">+ {pName}</div>}
                                <div className="text-[11px] text-[#5F7D72]">{req.status==="awaiting_partner"?"Esperando compañero":"Pendiente"}</div>
                              </div>
                              <button onClick={()=>handleConfirmRequest(req)} className="px-2.5 py-1.5 bg-[#086847] text-white text-[11px] font-black rounded-full whitespace-nowrap">Aceptar</button>
                              <button onClick={()=>handleRejectRequest(req.id)} className="px-2.5 py-1.5 bg-[#F4F5F7] border border-[#CFE7DC] text-[#5F7D72] text-[11px] font-black rounded-full whitespace-nowrap">Rechazar</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── SECCIÓN 1: Participantes de la liga ── */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-black text-[#173A2E]">
                        {liga.teamType==="pair" ? "Parejas de la liga" : "Participantes de la liga"}
                      </span>
                      <span className="ml-2 text-[11px] font-black text-[#086847] bg-[#EDF7F2] px-2 py-0.5 rounded-full">
                        {players.length} {liga.teamType==="pair" ? "en parejas" : "cargados"}
                      </span>
                    </div>
                    <button
                      onClick={()=>setGuestModalOpen(true)}
                      disabled={savingPlayers}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#086847] hover:bg-[#0B8457] text-white text-xs font-black rounded-xl transition-colors disabled:opacity-55"
                    >
                      <UserPlus size={14} /> Crear Jugador
                    </button>
                  </div>

                  {/* Lista principal de participantes de la liga */}
                  {players.length===0 && (
                    <div className="bg-white border border-[#CFE7DC] rounded-[20px] p-6 text-center">
                      <div className="font-black text-[#173A2E] text-base mb-1">Sin participantes</div>
                      <div className="text-[#5F7D72] text-sm">Buscá jugadores registrados en la plataforma (abajo) o creá jugadores manuales para esta liga.</div>
                    </div>
                  )}

                  {liga.teamType==="pair" ? (
                    <div className="flex flex-col gap-1.5">
                      {pairGroups.map(({pairNumber:pn,players:pp})=>{
                        const isExpanded=expandedPairs.includes(pn);
                        const status=pp.length>=2?"Completa":pp.length===1?"1 libre":"2 libres";
                        const statusColor=pp.length>=2?"text-[#086847]":"text-[#8A5700]";
                        return (
                          <div key={pn} className="bg-white border border-[#CFE7DC] rounded-2xl px-4 py-2.5">
                            <button
                              className="w-full flex items-center justify-between"
                              onClick={()=>setExpandedPairs(prev=>prev.includes(pn)?prev.filter(n=>n!==pn):[...prev,pn])}
                            >
                              <span className="text-sm font-black text-[#173A2E]">Pareja {pn}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black ${statusColor}`}>{status}</span>
                                <ChevronDown size={15} className={`text-[#086847] transition-transform ${isExpanded?"rotate-180":""}`}/>
                              </div>
                            </button>
                            {!isExpanded&&pp.length>0&&(
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {pp.map((p:any,i:number)=>(
                                  <div key={i} className="flex items-center gap-1">
                                    {p.foto?<img src={p.foto} className="w-4 h-4 rounded-full object-cover" alt=""/>:<div className="w-4 h-4 rounded-full bg-[#E5E7EB]"/>}
                                    <span className="text-xs font-bold text-[#173A2E]">{p.nombre}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!isExpanded&&pp.length===0&&(
                              <div className="text-xs text-[#5F7D72] font-semibold mt-1.5">Sin jugadores asignados</div>
                            )}
                            {isExpanded&&(
                              <div className="mt-2 flex flex-col gap-1.5">
                                {pp.map((p:any)=>(
                                  <PlayerSlotRow key={p.id} player={p}
                                    onView={()=>openPlayerProfile(p)}
                                    onDelete={()=>handleDeletePlayer(p.id)}
                                    onSwap={p.type==="guest"?()=>setReplacementTargetId(replacementTargetId===p.id?"":p.id):undefined}
                                    isSwapActive={replacementTargetId===p.id}
                                  />
                                ))}
                                {Array.from({length:Math.max(0,2-pp.length)}).map((_,i)=>(
                                  <div key={`free-${i}`} className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl flex items-center gap-2 px-3 py-2">
                                    <div className="w-7 h-7 rounded-full bg-[#EEF6F2] border border-[#CFE7DC] flex items-center justify-center">
                                      <UserIcon size={12} className="text-[#5F7D72]"/>
                                    </div>
                                    <span className="text-sm font-black text-[#5F7D72]">Libre</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Botón nueva pareja vacía */}
                      <button
                        onClick={()=>assignToPair(nextPairNumber)}
                        disabled={savingPlayers}
                        className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-[#CFE7DC] rounded-2xl text-xs font-black text-[#5F7D72] hover:border-[#1FAB89] hover:text-[#086847] transition-colors disabled:opacity-55"
                      >
                        <Plus size={14}/> Nueva pareja vacía
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {players.map((p:any)=>(
                        <PlayerSlotRow key={p.id} player={p}
                          onView={()=>openPlayerProfile(p)}
                          onDelete={()=>handleDeletePlayer(p.id)}
                          onSwap={p.type==="guest"?()=>setReplacementTargetId(replacementTargetId===p.id?"":p.id):undefined}
                          isSwapActive={replacementTargetId===p.id}
                          showSide
                        />
                      ))}
                    </div>
                  )}

                  {/* ── SECCIÓN 2: Agregar desde la plataforma ── */}
                  <div className="rounded-2xl border border-[#CFE7DC] bg-[#F7FAF9] px-4 py-3 flex flex-col gap-2.5 mt-1">
                    <div>
                      <div className="text-sm font-black text-[#173A2E]">Agregar desde la plataforma</div>
                      <div className="text-[11px] text-[#5F7D72] mt-0.5">Jugadores ya registrados en la app de PadelNexo. Buscalos por nombre y agregalos a esta liga.</div>
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F7D72]" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={playerQuery}
                        onChange={e=>setPlayerQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-[18px] border border-[#CFE7DC] text-sm text-[#173A2E] bg-white focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
                      />
                    </div>
                    {!playersLoaded ? (
                      <div className="text-xs text-center text-[#5F7D72] py-1">Cargando...</div>
                    ) : (
                      <>
                        {filteredRegisteredPlayers.length===0 && !playerQuery && (
                          <div className="text-xs text-[#5F7D72] py-1">Escribí un nombre para buscar.</div>
                        )}
                        {filteredRegisteredPlayers.length===0 && playerQuery && (
                          <div className="bg-white border border-[#CFE7DC] rounded-[14px] p-3 text-center text-xs text-[#5F7D72] font-semibold">
                            Sin resultados para &ldquo;{playerQuery}&rdquo;
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          {filteredRegisteredPlayers.map((rp:any)=>{
                            const alreadyAdded=players.some((p:any)=>p.linkedUserId===rp.id);
                            const isReplaceMode=!!replacementTargetId;
                            return (
                              <div key={rp.id} className="bg-white border border-[#CFE7DC] rounded-[14px] flex items-center justify-between px-3 py-2 gap-2">
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  {(rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL)
                                    ? <img src={rp.foto||rp.avatarUrl||rp.fotoURL||rp.photoURL} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0"><UserIcon size={13} className="text-[#9CA3AF]"/></div>
                                  }
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-black text-[#173A2E] truncate">{rp.nombre} {rp.apellido??""}</div>
                                    <div className="text-[11px] text-[#5F7D72] font-semibold">{rp.categoria}{rp.ciudad?` · ${rp.ciudad}`:""}</div>
                                  </div>
                                </div>
                                <button
                                  disabled={alreadyAdded||savingPlayers}
                                  onClick={()=>handleAddRegisteredPlayer(rp)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-white flex-shrink-0 transition-colors ${alreadyAdded?"bg-[#A9C9BC] cursor-default":isReplaceMode?"bg-[#086847] hover:bg-[#0B8457]":"bg-[#0B8457] hover:bg-[#086847]"}`}
                                >
                                  {alreadyAdded ? "Ya en la liga" : isReplaceMode ? <><ArrowLeftRight size={11}/> Reemplazar</> : <><Plus size={11}/> Agregar</>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                </div>
              )}

              {/* ── FIXTURE ───────────────────────────────────────────── */}
              {tab==="fixture" && (
                <div className="flex flex-col gap-3">
                  {/* Unsaved changes banner */}
                  {fxHasUnsaved && (
                    <div className="bg-[#FFF3E3] border border-[#E8C58E] rounded-xl px-4 py-3 flex items-center gap-3">
                      <AlertCircle size={15} className="text-[#D68A2D] flex-shrink-0"/>
                      <span className="text-sm font-bold text-[#8A5A2B]">Hay cambios sin guardar en el fixture.</span>
                    </div>
                  )}

                  {/* Validation warning (sin fixture aún) */}
                  {!fxHasFixture && !fxValidation.valid && (
                    <div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 text-sm text-[#8C2D2D] font-semibold">{fxValidation.message}</div>
                  )}

                  {/* Botón generar */}
                  {!fxHasFixture && fxCanEdit && (
                    <div className="text-center py-10">
                      <div className="text-[#5F7D72] text-sm mb-4">Todavía no hay fechas armadas.</div>
                      <button onClick={()=>setFxGenOpen(true)} disabled={!fxValidation.valid||fxSaving}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors disabled:opacity-40">
                        {fxSaving?<RefreshCw size={15} className="animate-spin"/>:<Trophy size={15}/>}
                        {fxSaving?"Generando...":"Generar fixture"}
                      </button>
                    </div>
                  )}

                  {/* Rounds */}
                  {fxHasFixture && rounds.map((round:any)=>(
                    <FxRoundBlock key={round.id} round={round} canEdit={fxCanEdit}
                      dayLabel={DAY_LABELS[liga?.scheduleConfig?.dayKey ?? ""] ?? ""}
                      onResultClick={matchId=>setFxResultTarget({roundId:round.id,matchId})}
                      onActionsClick={matchId=>setFxActionsTarget({roundId:round.id,matchId})}
                      onSuspensionClick={()=>setFxSuspTarget(round.id)}
                    />
                  ))}

                  {/* Guardar cambios */}
                  {fxHasUnsaved && fxCanEdit && (
                    <button onClick={()=>fxSaveToFirestore(fixtureDraft)} disabled={fxSaving}
                      className="w-full py-3.5 rounded-xl bg-[#0B8457] text-white text-sm font-black flex items-center justify-center gap-2 hover:bg-[#086847] transition-colors disabled:opacity-60 mt-1">
                      {fxSaving?<RefreshCw size={15} className="animate-spin"/>:<Save size={15}/>}
                      {fxSaving?"Guardando...":"GUARDAR CAMBIOS"}
                    </button>
                  )}

                  {/* Zona peligrosa */}
                  {fxHasFixture && fxCanEdit && (
                    <div className="border border-[#F2C4C4] rounded-xl overflow-hidden mt-2">
                      <div className="px-4 py-2 bg-[#FFF1F1] border-b border-[#F2C4C4]">
                        <span className="text-[10px] font-black text-[#994646] uppercase tracking-wider">Zona peligrosa</span>
                      </div>
                      <div className="px-4 py-3 flex gap-3">
                        <button onClick={()=>setFxConfirmRegen(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#F2C4C4] text-sm font-black text-[#994646] hover:bg-[#FFF1F1] transition-colors">
                          <RefreshCw size={13}/>Regenerar
                        </button>
                        <button onClick={()=>setFxConfirmDelete(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#D64545] text-white text-sm font-black hover:bg-[#B83030] transition-colors">
                          <Trash2 size={13}/>Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PUNTAJES ──────────────────────────────────────────── */}
              {tab==="posiciones" && (
                <div>
                  {standings.length===0
                    ? <p className="text-center py-12" style={{color:"#5F7D72"}}>Todavía no hay resultados cargados.</p>
                    : <>
                        {isIndividual
                          ? ["drive","reves"].map(lado=>{
                              const rows=standings.filter(r=>players.find((p:any)=>p.id===r.id&&p.ladoJuego===lado));
                              if(rows.length===0) return null;
                              return (
                                <div key={lado} className="rounded-[22px] overflow-hidden mb-4" style={{border:"1px solid #CFE7DC", background:"#fff"}}>
                                  <div className="px-5 py-3 font-black" style={{color:"#173A2E", background:"#F6FBF8", borderBottom:"1px solid #CFE7DC", fontSize:15}}>
                                    {lado==="drive"?"Drive":"Revés"}
                                  </div>
                                  <StandingsTable rows={rows}/>
                                </div>
                              );
                            })
                          : <div className="rounded-[22px] overflow-hidden" style={{border:"1px solid #CFE7DC", background:"#fff"}}>
                              <StandingsTable rows={standings}/>
                            </div>
                        }
                        <div className="mt-4 rounded-2xl px-5 py-4" style={{background:"#F6FBF8", border:"1px solid #CFE7DC"}}>
                          <p className="text-xs font-bold mb-2" style={{color:"#173A2E"}}>Referencias</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5">
                            {[
                              ["Pts","Puntos"],["R","Reemplazos usados"],["PJ","Partidos jugados"],
                              ["PG","Partidos ganados"],["PP","Partidos perdidos"],
                              ["SF","Sets a favor"],["SC","Sets en contra"],
                              ["DIF","Diferencia de sets"],["DG","Diferencia de games"],
                            ].map(([k,v])=>(
                              <span key={k} className="text-xs" style={{color:"#5F7D72"}}>
                                <span className="font-bold" style={{color:"#173A2E"}}>{k}</span>: {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      </>
                  }
                </div>
              )}

              {/* ── PAGOS ─────────────────────────────────────────────── */}
              {tab==="pagos" && (
                <div>
                  {/* Config badges */}
                  {liga.paymentConfig && (
                    <div className="flex gap-5 flex-wrap mb-4 text-sm">
                      {regFeeEnabled && (
                        <span className="text-pn-navy font-bold">Inscripción: <span className="text-pn-green">$ {liga.paymentConfig.registrationFeeAmount}</span></span>
                      )}
                      {liga.paymentConfig.roundPricePerPlayer > 0 && (
                        <span className="text-pn-navy font-bold">Por fecha: <span className="text-pn-green">$ {liga.paymentConfig.roundPricePerPlayer}</span></span>
                      )}
                    </div>
                  )}

                  {/* Resumen */}
                  {allResolvedEntries.length > 0 && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                      <span className="border-2 border-pn-green text-pn-green text-xs font-bold px-4 py-1.5 rounded-full">Pagados {cntPagado}</span>
                      <span className="border-2 border-amber-400 text-amber-500 text-xs font-bold px-4 py-1.5 rounded-full">Verificar {cntReview}</span>
                      <span className="border-2 border-gray-200 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full">
                        Impagos {allResolvedEntries.length - cntPagado - cntReview}
                      </span>
                    </div>
                  )}

                  {!liga.paymentConfig && rounds.length === 0 && (
                    <p className="text-center text-gray-400 py-12">No hay pagos configurados.</p>
                  )}

                  {(() => {
                    // Armar lista de bloques: inscripción (si aplica) + fechas del fixture
                    const blocks: { id: string; title: string; amount: number; entries: any[] }[] = [];

                    if (regFeeEnabled) {
                      blocks.push({
                        id: REGISTRATION_ROUND_ID,
                        title: "Inscripción",
                        amount: liga.paymentConfig?.registrationFeeAmount ?? 0,
                        entries: resolveRegistrationEntries(roundPayments, liga),
                      });
                    }
                    rounds.forEach((round: any, ri: number) => {
                      blocks.push({
                        id: round.id,
                        title: round.title ?? `Fecha ${round.number ?? ri + 1}`,
                        amount: liga.paymentConfig?.roundPricePerPlayer ?? 0,
                        entries: resolveRoundEntries(round, roundPayments, liga),
                      });
                    });

                    if (blocks.length === 0) return null;

                    const toggleBlock = (id: string) => setOpenBlocks(p => ({...p, [id]: !p[id]}));

                    return (
                      <div className="flex flex-col gap-3">
                        {blocks.map((block) => {
                          const isOpen = openBlocks[block.id] !== false; // abierto por defecto
                          return (
                          <div key={block.id} className="rounded-2xl overflow-hidden border border-gray-100">
                            {/* Header del bloque — clickeable para colapsar */}
                            <button
                              onClick={()=>toggleBlock(block.id)}
                              className="w-full bg-pn-navy px-5 py-3 flex items-center justify-between hover:bg-pn-navy/90 transition-colors">
                              <ChevronLeft size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen?"rotate-90":"-rotate-90"}`}/>
                              <span className="font-black text-white uppercase tracking-wide text-sm flex-1 text-center">{block.title}</span>
                              {block.amount > 0
                                ? <span className="text-xs text-gray-400 flex-shrink-0">$ {block.amount} / jugador</span>
                                : <span className="w-4"/>}
                            </button>

                            {isOpen && (
                              <>
                            {/* Columnas header */}
                            {block.entries.length > 0 && (
                              <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                                style={{gridTemplateColumns:"1fr 80px 60px 95px 55px 80px"}}>
                                <div>Jugador</div>
                                <div className="text-center">Estado</div>
                                <div className="text-center">Modo</div>
                                <div className="text-center">Comprobante</div>
                                <div className="text-center">$</div>
                                <div/>
                              </div>
                            )}

                            <div className="divide-y divide-gray-50">
                              {block.entries.length === 0 && (
                                <div className="px-4 py-6 text-sm text-gray-400 text-center italic">Sin jugadores en este bloque</div>
                              )}
                              {block.entries.map((entry: any, ei: number) => {
                                const status = entry.paymentStatus ?? "pendiente";
                                const isPagado = status === "pagado" || status === "paid";
                                const isReview = status === "informo_transferencia" || status === "in_review";
                                const saveKey = `${block.id}:${entry.participantId}`;
                                const isSaving = savingPayment === saveKey;
                                const menuKey = `${block.id}:${entry.participantId}`;
                                const isMenuOpen = openMenu === menuKey;
                                const isPending = !isPagado && !isReview;
                                const waUrl = buildWhatsAppUrl(entry.participantId, block.title);
                                const player = lookupPlayer(entry.participantId);
                                const hasLinked = !!(player?.linkedUserId);

                                return (
                                  <div key={ei} className="grid items-center px-4 py-3 hover:bg-gray-50/50 transition-colors relative"
                                    style={{gridTemplateColumns:"1fr 80px 60px 95px 55px 80px"}}>

                                    {/* Jugador */}
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-pn-navy text-sm truncate">{entry.participantLabel || "Jugador"}</div>
                                      {entry.pairLabel && <div className="text-xs text-gray-400 truncate">{entry.pairLabel}</div>}
                                    </div>

                                    {/* Estado */}
                                    <div className="text-center">
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPagado?"bg-green-50 text-pn-green":isReview?"bg-amber-50 text-amber-600":"bg-red-50 text-red-400"}`}>
                                        {isPagado ? "Pagado" : isReview ? "A verificar" : "Impago"}
                                      </span>
                                    </div>

                                    {/* Modo */}
                                    <div className="text-center text-xs text-gray-400">
                                      {entry.paymentMethod==="mercado_pago"?"MP":entry.paymentMethod==="efectivo"?"Efec.":entry.paymentMethod==="transferencia"?"Trans.":entry.paymentMethod||"-"}
                                    </div>

                                    {/* Comprobante */}
                                    <div className="text-center">
                                      {entry.proofUrl
                                        ? <button onClick={()=>setComprobanteUrl(entry.proofUrl)} className="text-xs text-pn-green font-bold hover:underline flex items-center gap-0.5 mx-auto"><Eye size={11}/>Ver</button>
                                        : <span className="text-xs text-gray-300">-</span>}
                                    </div>

                                    {/* Monto */}
                                    <div className="text-center text-xs font-bold text-pn-navy">{block.amount>0?`$ ${block.amount}`:""}</div>

                                    {/* Acciones: confirm/reject + ⋮ menú */}
                                    <div className="flex items-center justify-center gap-1">
                                      {/* Botón directo: Registrar pago (abre modal) */}
                                      {isSaving ? (
                                        <div className="w-7 h-7 flex items-center justify-center">
                                          <div className="w-4 h-4 border-2 border-pn-green border-t-transparent rounded-full animate-spin"/>
                                        </div>
                                      ) : isPagado ? (
                                        <div className="w-5 h-5 rounded-md bg-pn-green flex items-center justify-center mx-auto" title="Pagado">
                                          <Check size={10} className="text-white"/>
                                        </div>
                                      ) : isReview ? (
                                        /* En revisión: confirmar o rechazar rápido */
                                        <>
                                          <button onClick={()=>setPaymentStatus(block.id,entry.participantId,"pagado")} title="Confirmar pago" className="w-7 h-7 rounded-lg bg-pn-green hover:bg-green-600 flex items-center justify-center transition-colors"><Check size={13} className="text-white"/></button>
                                          <button onClick={()=>setPaymentStatus(block.id,entry.participantId,"pendiente")} title="Rechazar" className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"><X size={13} className="text-red-400"/></button>
                                        </>
                                      ) : (
                                        /* Pendiente: ícono billete naranja para registrar pago */
                                        <button
                                          onClick={()=>{ setPaymentModal({blockId:block.id,blockTitle:block.title,entry}); setModalMethod("efectivo"); setModalFile(null); }}
                                          title="Registrar pago"
                                          className="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-100 flex items-center justify-center transition-colors">
                                          <Banknote size={15} className="text-orange-400"/>
                                        </button>
                                      )}

                                      {/* ⋮ menú contextual */}
                                      <div className="relative">
                                        <button onClick={()=>setOpenMenu(isMenuOpen?null:menuKey)} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                                          <MoreVertical size={14} className="text-gray-400"/>
                                        </button>
                                        {isMenuOpen && (
                                          <>
                                            <div className="fixed inset-0 z-20" onClick={()=>setOpenMenu(null)}/>
                                            <div className="absolute right-0 top-8 z-30 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 w-56 overflow-hidden">
                                              {/* WhatsApp — siempre visible */}
                                              {waUrl ? (
                                                <a href={waUrl} target="_blank" rel="noreferrer"
                                                  onClick={()=>setOpenMenu(null)}
                                                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                                  <Smartphone size={15} className="text-green-500 flex-shrink-0"/>
                                                  Enviar WhatsApp
                                                </a>
                                              ) : (
                                                <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 cursor-default" title="El jugador no tiene teléfono registrado">
                                                  <Smartphone size={15} className="flex-shrink-0"/>
                                                  Enviar WhatsApp
                                                </div>
                                              )}

                                              {/* Mensaje interno */}
                                              <button
                                                onClick={()=>{ setOpenMenu(null); sendReminderChat(entry, block.title); }}
                                                disabled={!hasLinked}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:text-gray-300 disabled:hover:bg-transparent text-left"
                                                title={!hasLinked?"El jugador no tiene cuenta vinculada":""}>
                                                <MessageSquare size={15} className="text-blue-500 flex-shrink-0"/>
                                                Mensaje interno
                                              </button>

                                              {/* Marcar impago — solo cuando no es pendiente */}
                                              {!isPending && (
                                                <>
                                                  <div className="my-1 border-t border-gray-100"/>
                                                  <button onClick={()=>{ setOpenMenu(null); setPaymentStatus(block.id,entry.participantId,"pendiente"); }}
                                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
                                                    <X size={15} className="flex-shrink-0"/>
                                                    Marcar como impago
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                );
                              })}
                            </div>
                            </>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Modal resultado */}
      {resultModal && (
        <ResultModal
          match={rounds[resultModal.ri]?.matches?.[resultModal.mi]}
          matchFormat={matchFormat}
          onClose={()=>setResultModal(null)}
          onSave={(res:any)=>saveResult(resultModal.ri,resultModal.mi,res)}
        />
      )}

      {/* Modal comprobante */}
      {comprobanteUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={()=>setComprobanteUrl(null)}>
          <div className="relative max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <img src={comprobanteUrl} className="w-full rounded-2xl shadow-2xl" alt="Comprobante"/>
            <button onClick={()=>setComprobanteUrl(null)} className="absolute top-3 right-3 bg-white/90 rounded-full w-8 h-8 flex items-center justify-center font-black text-lg">×</button>
          </div>
        </div>
      )}

      {/* Modal registrar pago */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>!uploadingProof&&setPaymentModal(null)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-pn-navy text-lg">Registrar pago</h3>
                <p className="text-sm text-gray-400 mt-0.5">{paymentModal.entry.participantLabel} · {paymentModal.blockTitle}</p>
              </div>
              <button onClick={()=>setPaymentModal(null)} disabled={uploadingProof}><X size={20} className="text-gray-400"/></button>
            </div>

            {/* Método de pago */}
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Método de pago</label>
            <div className="flex gap-3 mb-5">
              {(["efectivo","transferencia"] as const).map(m=>(
                <button key={m} onClick={()=>setModalMethod(m)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${modalMethod===m?"border-pn-green bg-pn-mint text-pn-navy":"border-gray-100 text-gray-500 hover:border-gray-200"}`}>
                  {m==="efectivo"?"💵 Efectivo":"🏦 Transferencia"}
                </button>
              ))}
            </div>

            {/* Comprobante */}
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Comprobante <span className="normal-case font-normal">(opcional)</span>
            </label>
            <div
              onClick={()=>fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-5 text-center cursor-pointer hover:border-pn-green transition-colors mb-5">
              {modalFile ? (
                <div className="text-sm font-semibold text-pn-navy">{modalFile.name}</div>
              ) : paymentModal.entry.proofUrl ? (
                <div className="text-xs text-gray-400">Ya tiene comprobante — subí uno nuevo para reemplazarlo</div>
              ) : (
                <div className="text-xs text-gray-400">Tocá para adjuntar imagen o PDF</div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e=>setModalFile(e.target.files?.[0]??null)}/>
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setPaymentModal(null)} disabled={uploadingProof}
                className="flex-1 py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500 disabled:opacity-50">Cancelar</button>
              <button onClick={savePaymentModal} disabled={uploadingProof}
                className="flex-1 py-3 rounded-xl bg-pn-green text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
                {uploadingProof ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Subiendo...</> : <><Check size={15}/>Confirmar pago</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal perfil jugador — replica PlayerDetailScreen de la app */}
      {playerProfile && (()=>{
        const pp = playerProfile;
        const foto = pp.foto || pp.avatarUrl || pp.fotoURL || "";
        const rawPhone = pp.telefono || pp.celular || pp.phone || pp.whatsapp || "";
        const countryCode = pp.countryCode || "+54";
        const displayPhone = rawPhone ? `${countryCode} ${rawPhone}`.trim() : "";
        let waHref = "";
        if (rawPhone) {
          let digits = rawPhone.replace(/\D/g,"");
          if (!digits.startsWith("54")) {
            if (digits.startsWith("0")) digits = digits.slice(1);
            digits = "54" + digits;
          }
          waHref = `https://wa.me/${digits}`;
        }
        const ciudad = [pp.ciudad, pp.provincia].filter(Boolean).join(", ");
        const isGuest = pp.type === "guest";
        const lado = pp.ladoJuego || pp.ladoPreferido || "";
        const fechaNac = pp.fechaNacimiento || "";
        const sinFecha = pp.linkedUserId && !fechaNac;
        const esMenor = pp.linkedUserId && fechaNac && esMenorRestringido(fechaNac);
        const mensajeBlockReason = sinFecha
          ? "No configuró su fecha de nacimiento"
          : esMenor ? `Mensajería no disponible para menores de ${EDAD_MINIMA_MENSAJES} años` : "";
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closePlayerProfile}>
            <div className="bg-[#F6FBF8] rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden" style={{maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>

              {/* Orbs decorativos — capa fija, no scrolleable */}
              <div className="absolute top-0 right-0 w-44 h-44 rounded-full bg-[rgba(31,171,137,0.12)] -translate-y-10 translate-x-10 pointer-events-none"/>
              <div className="absolute bottom-20 left-0 w-52 h-52 rounded-full bg-[rgba(11,132,87,0.08)] -translate-x-12 pointer-events-none"/>

              <button onClick={profileView==="main" ? closePlayerProfile : ()=>setProfileView("main")}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/80 hover:bg-white border border-[#CFE7DC] flex items-center justify-center transition-colors">
                <X size={15} className="text-[#5F7D72]"/>
              </button>

              {/* Contenido scrolleable */}
              <div className="overflow-y-auto" style={{maxHeight:"90vh"}}>
              <div className="p-5 pb-8 flex flex-col gap-3 relative">

                {/* Hero card */}
                <div className="bg-white rounded-[26px] border border-[#CFE7DC] p-5 flex flex-col items-center text-center" style={{boxShadow:"0 12px 18px rgba(23,58,46,0.08)"}}>
                  {profileLoading ? (
                    <div className="w-28 h-28 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[#0B8457] border-t-transparent rounded-full animate-spin"/>
                    </div>
                  ) : foto ? (
                    <img src={foto} className="w-28 h-28 rounded-full object-cover"/>
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-14 h-14 text-[#9CA3AF]" fill="currentColor">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                      </svg>
                    </div>
                  )}
                  <div className="font-extrabold text-[#173A2E] text-2xl mt-3 leading-tight text-center">
                    {`${pp.nombre||""} ${pp.apellido||""}`.trim()||"Jugador"}
                  </div>
                  {pp.categoria && <div className="font-bold text-[#0B8457] text-sm mt-1">{pp.categoria}</div>}
                  {ciudad && <div className="text-[#5F7D72] text-sm mt-1">{ciudad}</div>}
                  {isGuest && <span className="mt-2 text-xs bg-amber-50 text-amber-500 font-semibold px-2.5 py-0.5 rounded-full">Invitado</span>}
                </div>

                {/* Fila de tres info cards: Sexo / Mano hábil / Lado */}
                {(pp.sexo || pp.manoHabil || lado) && (
                  <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${[pp.sexo,pp.manoHabil,lado].filter(Boolean).length},1fr)`}}>
                    {pp.sexo && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Sexo</div>
                        <div className="font-bold text-[#173A2E] text-sm">{pp.sexo}</div>
                      </div>
                    )}
                    {pp.manoHabil && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Mano hábil</div>
                        <div className="font-bold text-[#173A2E] text-sm">{pp.manoHabil}</div>
                      </div>
                    )}
                    {lado && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Lado preferido</div>
                        <div className="font-bold text-[#173A2E] text-sm capitalize">{lado}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Descripción */}
                {pp.descripcion && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider mb-2">Descripción</div>
                    <div className="text-[#173A2E] text-sm leading-relaxed">{pp.descripcion}</div>
                  </div>
                )}

                {/* Celular (siempre visible para el organizador) */}
                {displayPhone && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider mb-2">Celular</div>
                    <div className="text-[#173A2E] text-sm font-bold">{displayPhone}</div>
                  </div>
                )}

                {/* Vista: componer mensaje */}
                {profileView === "message" && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4 flex flex-col gap-3">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider">Mensaje a {`${pp.nombre||""}`.trim()}</div>
                    <textarea
                      value={profileMsgText} onChange={e=>setProfileMsgText(e.target.value)}
                      placeholder="Escribí tu mensaje..."
                      rows={3}
                      className="w-full text-sm text-[#173A2E] border border-[#CFE7DC] rounded-xl p-3 resize-none focus:outline-none focus:border-[#0B8457]"
                    />
                    <div className="flex gap-2">
                      <button onClick={()=>setProfileView("main")} className="flex-1 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
                      <button onClick={sendProfileMessage} disabled={!profileMsgText.trim()||profileActionLoading}
                        className="flex-1 py-2.5 rounded-xl bg-pn-navy text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {profileActionLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <><MessageSquare size={13}/>Enviar</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vista: reportar perfil */}
                {profileView === "report" && (
                  <div className="bg-white rounded-[20px] border border-[#FFB866] p-4 flex flex-col gap-3">
                    <div className="text-[11px] font-extrabold text-[#C45B00] uppercase tracking-wider">Reportar perfil</div>
                    <textarea
                      value={profileReportText} onChange={e=>setProfileReportText(e.target.value)}
                      placeholder="Describí el motivo del reporte..."
                      rows={3}
                      className="w-full text-sm text-[#173A2E] border border-[#FFB866]/50 rounded-xl p-3 resize-none focus:outline-none focus:border-[#C45B00]"
                    />
                    <div className="flex gap-2">
                      <button onClick={()=>setProfileView("main")} className="flex-1 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
                      <button onClick={submitProfileReport} disabled={!profileReportText.trim()||profileActionLoading}
                        className="flex-1 py-2.5 rounded-xl bg-[#FFF3E0] border border-[#FFB866] text-[#C45B00] text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {profileActionLoading ? <div className="w-4 h-4 border-2 border-[#C45B00] border-t-transparent rounded-full animate-spin"/> : "Enviar reporte"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vista principal: botones de acción */}
                {profileView === "main" && (
                  <>
                    <div className="flex gap-3 mt-1">
                      {waHref && (
                        <a href={waHref} target="_blank"
                          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#25D366] text-white text-sm font-black hover:bg-[#20bc5a] transition-colors">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          WhatsApp
                        </a>
                      )}
                      {pp.linkedUserId && (
                        <div className="flex-1 flex flex-col gap-1">
                          <button
                            onClick={mensajeBlockReason ? undefined : ()=>setProfileView("message")}
                            disabled={!!mensajeBlockReason}
                            title={mensajeBlockReason}
                            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-colors ${mensajeBlockReason ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-pn-navy text-white hover:bg-pn-navy/90"}`}>
                            <MessageSquare size={15}/>
                            Mensaje
                          </button>
                          {mensajeBlockReason && (
                            <div className="text-[10px] text-gray-400 text-center leading-tight px-1">{mensajeBlockReason}</div>
                          )}
                        </div>
                      )}
                    </div>
                    {pp.linkedUserId && (
                      <button onClick={()=>setProfileView("report")}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl bg-[#FFF3E0] border border-[#FFB866] text-[#C45B00] text-xs font-black hover:bg-[#FFE0B2] transition-colors">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                        Reportar perfil
                      </button>
                    )}
                  </>
                )}

              </div>
              </div>{/* fin scroll */}
            </div>
          </div>
        );
      })()}

      {/* ── Modal: crear jugador manual ──────────────────────────────── */}
      {guestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>setGuestModalOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-[28px] px-6 pt-5 pb-8" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5"/>
            <h3 className="text-xl font-black text-[#173A2E] mb-1">Crear jugador</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Este jugador solo existirá en esta liga (sin cuenta en la app).</p>
            <div className="flex flex-col gap-3 mb-5">
              <input
                type="text"
                placeholder="Nombre"
                value={guestName}
                onChange={e=>setGuestName(e.target.value)}
                className="w-full border border-[#CFE7DC] rounded-[18px] px-4 py-3 text-sm text-[#173A2E] focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
              />
              <input
                type="text"
                placeholder="Apellido"
                value={guestLastName}
                onChange={e=>setGuestLastName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleGuestCreate()}
                className="w-full border border-[#CFE7DC] rounded-[18px] px-4 py-3 text-sm text-[#173A2E] focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setGuestModalOpen(false)} className="flex-1 py-3 rounded-2xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={handleGuestCreate} disabled={!guestName.trim()||!guestLastName.trim()} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-55">
                Siguiente →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: elegir lado Drive/Reves (liga individual) ─────────── */}
      {sidePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>{setSidePickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}}>
          <div className="bg-white border border-[#CFE7DC] rounded-[24px] p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-black text-[#173A2E] mb-2">¿Qué lado juega?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">
              {pendingIsGuest ? `${guestName} ${guestLastName}` : `${pendingPlayer?.nombre ?? ""} ${pendingPlayer?.apellido ?? ""}`}
            </p>
            <div className="flex gap-3">
              <button onClick={()=>assignToSide("drive")} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors">Drive</button>
              <button onClick={()=>assignToSide("reves")} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors">Reves</button>
            </div>
            <button onClick={()=>{setSidePickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}} className="w-full mt-3 py-2.5 text-sm font-bold text-[#5F7D72]">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Modal: elegir pareja (liga pair) ─────────────────────────── */}
      {pairPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>{setPairPickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}}>
          <div className="bg-white w-full max-w-lg rounded-t-[28px] px-5 pt-5 pb-8 max-h-[75vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
            <h3 className="text-lg font-black text-[#173A2E] mb-1">Asignar a una pareja</h3>
            <p className="text-sm text-[#5F7D72] mb-4">
              {pendingIsGuest ? `${guestName} ${guestLastName}` : `${pendingPlayer?.nombre ?? ""} ${pendingPlayer?.apellido ?? ""}`}
            </p>
            <div className="overflow-y-auto flex flex-col gap-2 flex-1 pb-2">
              {pairGroups.map(({pairNumber:pn,players:pp})=>{
                const isFull=pp.length>=2;
                return (
                  <div key={pn} className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-[#173A2E]">Pareja {pn}</div>
                      <div className="text-[11px] text-[#5F7D72] font-semibold">
                        {pp.length===0?"Sin jugadores":pp.map((p:any)=>`${p.nombre} ${p.apellido??""}`).join(" / ")}
                      </div>
                    </div>
                    <button
                      onClick={()=>assignToPair(pn)}
                      disabled={isFull||savingPlayers}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black text-white whitespace-nowrap transition-colors ${isFull?"bg-[#A9C9BC] cursor-not-allowed":"bg-[#0B8457] hover:bg-[#086847]"}`}
                    >
                      {isFull ? "Completa" : "Asignar aquí"}
                    </button>
                  </div>
                );
              })}
              <button
                onClick={()=>assignToPair(nextPairNumber)}
                disabled={savingPlayers}
                className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-[#CFE7DC] rounded-xl text-xs font-black text-[#5F7D72] hover:border-[#1FAB89] hover:text-[#086847] transition-colors"
              >
                <Plus size={13}/> Nueva pareja
              </button>
            </div>
            <button onClick={()=>{setPairPickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}} className="mt-3 py-2.5 text-sm font-bold text-[#5F7D72] text-center">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Fixture modals ─────────────────────────────────────────────── */}
      {fxGenOpen && liga && (
        <FixtureGenerateModal league={liga} onClose={()=>setFxGenOpen(false)} onGenerate={fxHandleGenerate}/>
      )}
      {fxActiveMatch && fxResultTarget && (
        <FixtureResultModal match={fxActiveMatch} matchFormat={matchFormat} onClose={()=>setFxResultTarget(null)}
          onSave={result=>{ fxUpdateMatch(fxResultTarget.roundId, fxResultTarget.matchId, m=>({...m,result,completedAtMillis:result.winner?Date.now():0})); setFxResultTarget(null); }}
        />
      )}
      {fxActionsMatch && fxActionsTarget && (
        <FixtureReplacementModal match={fxActionsMatch} allPlayers={registeredPlayers} onClose={()=>setFxActionsTarget(null)}
          onSave={async (replacements)=>{
            const prevReplacements = fxActionsMatch.replacements ?? {};
            const round = fixtureDraft?.rounds?.find((r:any)=>r.id===fxActionsTarget.roundId);
            const roundTitle = round?.title ?? `Fecha ${round?.number ?? ""}`;
            fxUpdateMatch(fxActionsTarget.roundId, fxActionsTarget.matchId, m=>({...m,replacements}));
            setFxActionsTarget(null);
            showToast("Reemplazos guardados. Presioná GUARDAR CAMBIOS.");
            await fxSendReplacementNotifications(fxActionsMatch, prevReplacements, replacements, roundTitle);
          }}
        />
      )}
      {fxSuspRound && fxSuspTarget && (
        <FixtureSuspensionModal round={fxSuspRound} onClose={()=>setFxSuspTarget(null)}
          onApply={data=>{ if(data.remove){ fxUpdateRound(fxSuspTarget,r=>({...r,suspendedAtMillis:0,suspensionReason:"",suspensionMode:""})); } else { fxUpdateRound(fxSuspTarget,r=>({...r,suspendedAtMillis:Date.now(),suspensionReason:data.reason,suspensionMode:data.mode})); } setFxSuspTarget(null); showToast("Suspensión aplicada. Presioná GUARDAR CAMBIOS."); }}
        />
      )}
      {fxConfirmRegen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-[#173A2E] text-lg mb-2">¿Regenerar fixture?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Se perderán todos los resultados actuales.</p>
            <div className="flex gap-3">
              <button onClick={()=>setFxConfirmRegen(false)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={fxHandleRegenerate} className="flex-1 py-3 rounded-xl bg-[#D64545] text-white text-sm font-black">Regenerar</button>
            </div>
          </div>
        </div>
      )}
      {fxConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-[#173A2E] text-lg mb-2">¿Eliminar fixture?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Esta acción es irreversible.</p>
            <div className="flex gap-3">
              <button onClick={()=>setFxConfirmDelete(false)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={fxHandleDelete} className="flex-1 py-3 rounded-xl bg-[#D64545] text-white text-sm font-black">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold transition-all ${toast.ok?"bg-pn-green":"bg-red-500"}`}>
          {toast.ok ? <Check size={16}/> : <X size={16}/>}
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  );
}
