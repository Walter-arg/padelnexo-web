"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, getDocs, collection, query as fsQuery, where, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ChevronLeft, RefreshCw, Trash2, X, Save, Check, AlertCircle,
  Users, Trophy, MoreVertical, ArrowLeftRight, Search, Plus,
  Calendar, Clock, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface SetData { own: string; rival: string; }
interface MatchResult { winner: string; score: string; reason: string; sets: SetData[]; }
interface TeamData { id: string; label: string; players?: any[]; }
interface MatchData {
  id: string; order: number; timeSlot: string;
  scheduledAtMillis?: number; completedAtMillis?: number;
  suspendedAtMillis?: number; suspensionReason?: string;
  suspensionMode?: string; rescheduledDateMillis?: number;
  teamA: TeamData; teamB: TeamData;
  result: MatchResult;
  replacements?: Record<string, any>;
}
interface RoundData {
  id: string; number: number; title: string; scheduleLabel?: string;
  scheduledDateMillis?: number; completedAtMillis?: number;
  suspendedAtMillis?: number; suspensionReason?: string;
  suspensionMode?: string; rescheduledDateMillis?: number;
  byeLabels?: string[];
  matches: MatchData[];
}
interface FixtureData { generatedAtMillis: number; rounds: RoundData[]; }

// ── Algoritmo Round Robin ──────────────────────────────────────────────────
function normalizePlayerEntry(p: any): any {
  return {
    id: p?.id ?? `guest-${Date.now()}`,
    type: p?.type ?? "guest",
    linkedUserId: p?.linkedUserId ?? "",
    nombre: p?.nombre ?? "Jugador",
    apellido: p?.apellido ?? "",
    categoria: p?.categoria ?? "",
    sexo: p?.sexo ?? "",
    ciudad: p?.ciudad ?? "",
    foto: p?.foto ?? p?.avatarUrl ?? p?.fotoURL ?? p?.photoURL ?? "",
    ladoJuego: p?.ladoJuego ?? "ambos",
    pairNumber: p?.pairNumber ?? 0,
  };
}

function buildTeamLabelFromPlayers(players: any[]): string {
  return players.map(p => p?.nombre ?? "").filter(Boolean).join(" / ");
}

function normalizeTeam(t: any, idx: number): TeamData {
  return {
    id: t?.id ?? `team-${idx}`,
    label: t?.label ?? buildTeamLabelFromPlayers(t?.players ?? []),
    players: t?.players ?? [],
  };
}

function buildPairTeams(league: any): TeamData[] {
  const manualTeams: TeamData[] = Array.isArray(league?.fixtureConfig?.manualTeams)
    ? league.fixtureConfig.manualTeams.map((t: any, i: number) => normalizeTeam(t, i))
    : [];
  const players = (Array.isArray(league?.players) ? league.players : []).map(normalizePlayerEntry);
  const grouped: Record<number, any[]> = {};
  players.forEach((p: any) => {
    const pn = Number(p.pairNumber) || 0;
    if (pn > 0) { grouped[pn] = [...(grouped[pn] ?? []), p]; }
  });
  const groupedTeams: TeamData[] = Object.entries(grouped)
    .sort(([a], [b]) => Number(a) - Number(b))
    .filter(([, tp]) => tp.length >= 2)
    .map(([pn, tp]) => ({ id: `pair-team-${pn}`, label: buildTeamLabelFromPlayers(tp.slice(0, 2)), players: tp.slice(0, 2) }));

  if (Object.keys(grouped).length > 0) return groupedTeams;
  if (manualTeams.length) return manualTeams;

  const teams: TeamData[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    const tp = [players[i], players[i + 1]];
    teams.push({ id: `pair-team-${teams.length + 1}`, label: buildTeamLabelFromPlayers(tp), players: tp });
  }
  return teams;
}

function buildRoundRobinRounds(teams: TeamData[]): { matches: { teamA: TeamData; teamB: TeamData }[]; byeLabels: string[] }[] {
  if (!teams.length) return [];
  const byeTeam: TeamData = { id: "__bye__", label: "Libre" };
  const rot = teams.length % 2 === 0 ? [...teams] : [...teams, byeTeam];
  const rounds: any[] = [];
  for (let ri = 0; ri < rot.length - 1; ri++) {
    const matches: { teamA: TeamData; teamB: TeamData }[] = [];
    const byeLabels: string[] = [];
    for (let i = 0; i < rot.length / 2; i++) {
      const a = rot[i], b = rot[rot.length - 1 - i];
      if (a.id === "__bye__" || b.id === "__bye__") { byeLabels.push((a.id === "__bye__" ? b : a).label); continue; }
      matches.push({ teamA: a, teamB: b });
    }
    rounds.push({ matches, byeLabels });
    const fixed = rot[0], rotating = rot.slice(1);
    rotating.unshift(rotating.pop()!);
    rot.splice(0, rot.length, fixed, ...rotating);
  }
  return rounds;
}

function createRoundMatch(match: { teamA: TeamData; teamB: TeamData }, ri: number, mi: number, timeSlot = ""): MatchData {
  return {
    id: `round-${ri + 1}-match-${mi + 1}`,
    order: mi + 1,
    timeSlot,
    teamA: normalizeTeam(match.teamA, mi * 2),
    teamB: normalizeTeam(match.teamB, mi * 2 + 1),
    result: { winner: "", score: "", reason: "", sets: [] },
    replacements: {},
  };
}

function rotateList<T>(arr: T[], by: number): T[] {
  if (!arr.length) return arr;
  const n = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(n), ...arr.slice(0, n)];
}

function generatePairFixture(league: any): FixtureData {
  const teams = buildPairTeams(league);
  const roundsCount = Number(league?.fixtureConfig?.roundsCount) || 6;
  const timeSlots: string[] = league?.scheduleConfig?.timeSlots ?? [];
  const baseRounds = buildRoundRobinRounds(teams);
  return {
    generatedAtMillis: Date.now(),
    rounds: Array.from({ length: roundsCount }, (_, ri) => {
      const base = baseRounds[ri % Math.max(baseRounds.length, 1)] ?? { matches: [], byeLabels: [] };
      return {
        id: `round-${ri + 1}`,
        number: ri + 1,
        title: `Fecha ${ri + 1}`,
        scheduleLabel: "",
        completedAtMillis: 0,
        suspendedAtMillis: 0,
        suspensionReason: "",
        suspensionMode: "",
        rescheduledDateMillis: 0,
        byeLabels: base.byeLabels,
        matches: base.matches.map((m, mi) => createRoundMatch(m, ri, mi, timeSlots[mi % timeSlots.length] ?? "")),
      };
    }),
  };
}

function generateIndividualFixture(league: any): FixtureData {
  const players = (Array.isArray(league?.players) ? league.players : []).map(normalizePlayerEntry);
  const drive = players.filter((p: any) => p.ladoJuego === "drive");
  const reves = players.filter((p: any) => p.ladoJuego === "reves");
  const pairsCount = Math.min(drive.length, reves.length);
  const roundsCount = Number(league?.fixtureConfig?.roundsCount) || 6;
  const timeSlots: string[] = league?.scheduleConfig?.timeSlots ?? [];
  return {
    generatedAtMillis: Date.now(),
    rounds: Array.from({ length: roundsCount }, (_, ri) => {
      const rotatedReves = rotateList(reves, ri);
      const teams: TeamData[] = Array.from({ length: pairsCount }, (__, pi) => {
        const tp = [drive[pi], rotatedReves[pi]];
        return { id: `round-${ri + 1}-team-${pi + 1}`, label: buildTeamLabelFromPlayers(tp), players: tp };
      });
      const rotatedTeams = rotateList(teams, ri);
      const matches: MatchData[] = [];
      const byeLabels: string[] = [];
      for (let i = 0; i < rotatedTeams.length; i += 2) {
        const a = rotatedTeams[i], b = rotatedTeams[i + 1];
        if (!b) { byeLabels.push(a.label); continue; }
        matches.push(createRoundMatch({ teamA: a, teamB: b }, ri, matches.length, timeSlots[matches.length % timeSlots.length] ?? ""));
      }
      return { id: `round-${ri + 1}`, number: ri + 1, title: `Fecha ${ri + 1}`, scheduleLabel: "", completedAtMillis: 0, suspendedAtMillis: 0, suspensionReason: "", suspensionMode: "", rescheduledDateMillis: 0, byeLabels, matches };
    }),
  };
}

function validateFixture(league: any): { valid: boolean; message: string } {
  const players = Array.isArray(league?.players) ? league.players : [];
  if (!players.length) return { valid: false, message: "Primero debés cargar jugadores en la liga." };
  if (league?.teamType === "pair") {
    const grouped: Record<number, any[]> = {};
    players.map(normalizePlayerEntry).forEach((p: any) => {
      const pn = Number(p.pairNumber) || 0;
      if (pn > 0) grouped[pn] = [...(grouped[pn] ?? []), p];
    });
    if (Object.values(grouped).some((g: any[]) => g.length !== 2))
      return { valid: false, message: "Todas las parejas deben tener exactamente dos jugadores." };
    if (buildPairTeams(league).length < 2)
      return { valid: false, message: "Necesitás al menos dos parejas para generar el fixture." };
    return { valid: true, message: "" };
  }
  const drive = players.filter((p: any) => normalizePlayerEntry(p).ladoJuego === "drive");
  const reves = players.filter((p: any) => normalizePlayerEntry(p).ladoJuego === "reves");
  if (drive.length < 2 || reves.length < 2)
    return { valid: false, message: "Necesitás al menos dos Drive y dos Reves para el fixture individual." };
  return { valid: true, message: "" };
}

function generateFixture(league: any): FixtureData {
  const v = validateFixture(league);
  if (!v.valid) throw new Error(v.message);
  return league?.teamType === "individual" ? generateIndividualFixture(league) : generatePairFixture(league);
}

// ── Round status ───────────────────────────────────────────────────────────
type RoundStatus = "played" | "suspended" | "reprogrammed" | "pending";

function getRoundStatus(round: RoundData): RoundStatus {
  const matches = round.matches ?? [];
  if (matches.length > 0 && matches.every(m => m.result?.winner && m.result.winner !== "")) return "played";
  if (round.suspendedAtMillis && round.suspendedAtMillis > 0) {
    return Date.now() - round.suspendedAtMillis < 86_400_000 ? "suspended" : "reprogrammed";
  }
  return "pending";
}

const STATUS_STYLES: Record<RoundStatus, { dot: string; text: string; label: string; headerBg: string }> = {
  played:       { dot: "bg-[#3A9A82]", text: "text-[#24725E]", label: "JUGADA",       headerBg: "bg-[#CDE9E3]" },
  pending:      { dot: "bg-[#7D8987]", text: "text-[#596563]", label: "PENDIENTE",     headerBg: "bg-[#CDE9E3]" },
  suspended:    { dot: "bg-[#C76464]", text: "text-[#994646]", label: "SUSPENDIDA",    headerBg: "bg-[#FFE8E8]" },
  reprogrammed: { dot: "bg-[#D68A2D]", text: "text-[#9A601C]", label: "REPROGRAMADA",  headerBg: "bg-[#FFF3E3]" },
};

// ── Replacement helpers ────────────────────────────────────────────────────
function hasReplacement(match: MatchData): boolean {
  return Object.keys(match.replacements ?? {}).length > 0;
}

function getReplacementDotColor(match: MatchData): string | null {
  const entries = Object.values(match.replacements ?? {});
  if (!entries.length) return null;
  const hasAssigned = entries.some((e: any) => e?.replacement);
  return hasAssigned ? "#2A9A6B" : "#E88319";
}

function playerReplacementKey(teamKey: string, player: any): string {
  if (player?.id) return `${teamKey}:${player.id}`;
  return `${teamKey}:guest-0-${player?.nombre ?? ""}-${player?.apellido ?? ""}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold flex items-center gap-2 ${ok ? "bg-[#0B8457]" : "bg-[#D64545]"}`}>
      {ok ? <Check size={16} /> : <AlertCircle size={16} />}{msg}
    </div>
  );
}

// ── ResultModal ────────────────────────────────────────────────────────────
function ResultModal({ match, matchFormat, onClose, onSave }: { match: MatchData; matchFormat: string; onClose: () => void; onSave: (r: MatchResult) => void }) {
  const [winner, setWinner] = useState(match.result?.winner ?? "");
  const [sets, setSets] = useState<SetData[]>(
    match.result?.sets?.length ? match.result.sets : [{ own: "", rival: "" }, { own: "", rival: "" }, { own: "", rival: "" }]
  );
  const aLabel = match.teamA?.label ?? "Pareja A";
  const bLabel = match.teamB?.label ?? "Pareja B";
  const maxSets = matchFormat === "single_set" ? 1 : 3;

  function handleSave() {
    if (!winner) return;
    const useSets = winner === "walkover" ? [] : sets.slice(0, maxSets).filter(s => s.own !== "" || s.rival !== "");
    onSave({ winner, score: useSets.map(s => `${s.own}/${s.rival}`).join(" "), reason: winner === "walkover" ? "walkover" : "normal", sets: useSets });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-1">
          <div className="text-[20px] font-black text-[#086847]">Resultado</div>
          <div className="text-[11px] text-[#5F7D72] mt-0.5">Seleccioná ganador y cargá los sets.</div>
        </div>
        <div className="flex flex-col gap-2 mt-4 mb-5">
          {[{ v: "teamA", l: aLabel }, { v: "teamB", l: bLabel }, { v: "walkover", l: "Walkover" }].map(opt => (
            <button key={opt.v} onClick={() => setWinner(opt.v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-[14px] border text-sm font-black text-left transition-all ${winner === opt.v ? "bg-[#DDF6EF] border-[#89D9C4] text-[#176B5B]" : "bg-[#F7FAF8] border-[#CFE7DC] text-[#086847] hover:border-[#89D9C4]"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${winner === opt.v ? "bg-[#0B8457] border-[#0B8457]" : "border-[#CFE7DC]"}`} />
              {opt.l}
              {winner === opt.v && <span className="ml-auto text-[9px] font-black text-[#176B5B]">GANADOR</span>}
            </button>
          ))}
        </div>
        {winner && winner !== "walkover" && (
          <div className="mb-5">
            {Array.from({ length: maxSets }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-black text-[#086847] w-28 text-right">{i === 2 ? "3er set (opc.)" : `Set ${i + 1}`}</span>
                <div className="flex items-center gap-1 flex-1">
                  <input value={sets[i]?.own ?? ""} onChange={e => setSets(p => p.map((s, j) => j === i ? { ...s, own: e.target.value } : s))}
                    className="w-full text-center border border-[#CFE7DC] rounded-xl h-[42px] text-[16px] font-black text-[#173A2E] focus:outline-none focus:border-[#0B8457] bg-[#F7FAF8]"
                    placeholder="0" type="number" min="0" max="99" />
                  <span className="text-[#5F7D72] font-black">/</span>
                  <input value={sets[i]?.rival ?? ""} onChange={e => setSets(p => p.map((s, j) => j === i ? { ...s, rival: e.target.value } : s))}
                    className="w-full text-center border border-[#CFE7DC] rounded-xl h-[42px] text-[16px] font-black text-[#173A2E] focus:outline-none focus:border-[#0B8457] bg-[#F7FAF8]"
                    placeholder="0" type="number" min="0" max="99" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={handleSave} disabled={!winner}
            className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2">
            <Save size={15} />Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SuspensionModal ────────────────────────────────────────────────────────
function SuspensionModal({ round, onClose, onApply }: { round: RoundData; onClose: () => void; onApply: (data: any) => void }) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState("league_round");
  const [mode, setMode] = useState("suspended");
  const [reason, setReason] = useState("weather");
  const isSuspended = round.suspendedAtMillis && round.suspendedAtMillis > 0;

  if (step === 0) return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-[#086847] text-lg">Fecha {round.number}</h3>
          <button onClick={onClose}><X size={18} className="text-[#5F7D72]" /></button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => setStep(1)} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FFF3E3] border border-[#E8C58E] text-sm font-black text-[#8A5A2B] text-left">
            <AlertCircle size={16} className="flex-shrink-0 text-[#D68A2D]" />Suspender esta fecha
          </button>
          {isSuspended && (
            <button onClick={() => onApply({ remove: true })} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#086847] text-left">
              <Check size={16} className="flex-shrink-0" />Quitar suspensión
            </button>
          )}
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-[#F7FAF8] border border-[#CFE7DC] text-sm font-bold text-[#5F7D72] text-center">Cancelar</button>
        </div>
      </div>
    </div>
  );

  const scopes = [
    { v: "league_round", l: "Esta fecha completa" },
    { v: "selected_matches", l: "Partidos puntuales" },
  ];
  const modes = [
    { v: "next_week", l: "La próxima semana" },
    { v: "manual", l: "Elegir fecha manual" },
    { v: "suspended", l: "Sin fecha definida" },
  ];
  const reasons = [
    { v: "weather", l: "Inclemencia climática" },
    { v: "holiday", l: "Feriado" },
    { v: "technical", l: "Problema técnico" },
    { v: "other", l: "Otros motivos" },
  ];

  const stepLabels = ["", "¿Qué suspender?", "¿Cuándo se reprograma?", "¿Por qué motivo?"];
  const stepState = step === 1 ? scope : step === 2 ? mode : reason;
  const stepOpts = step === 1 ? scopes : step === 2 ? modes : reasons;
  const setter = step === 1 ? setScope : step === 2 ? setMode : setReason;
  const isLast = step === 3;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-[#086847] text-base">{stepLabels[step]}</h3>
          <button onClick={onClose}><X size={18} className="text-[#5F7D72]" /></button>
        </div>
        <p className="text-xs text-[#5F7D72] mb-4">Paso {step} de 3</p>
        <div className="flex flex-col gap-2 mb-5">
          {stepOpts.map(opt => (
            <button key={opt.v} onClick={() => setter(opt.v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-black text-left transition-all ${stepState === opt.v ? "bg-[#DDF6EF] border-[#89D9C4] text-[#176B5B]" : "bg-[#F7FAF8] border-[#CFE7DC] text-[#086847]"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${stepState === opt.v ? "bg-[#0B8457] border-[#0B8457]" : "border-[#CFE7DC]"}`} />
              {opt.l}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Atrás</button>
          {isLast
            ? <button onClick={() => onApply({ scope, mode, reason })} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black">Confirmar</button>
            : <button onClick={() => setStep(s => s + 1)} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black">Siguiente →</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── ReplacementModal ───────────────────────────────────────────────────────
function ReplacementModal({ match, registeredPlayers, onClose, onSave }: {
  match: MatchData; registeredPlayers: any[];
  onClose: () => void;
  onSave: (replacements: Record<string, any>) => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>(() => ({ ...(match.replacements ?? {}) }));

  const filtered = useMemo(() => {
    const q = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (!q) return registeredPlayers.slice(0, 10);
    return registeredPlayers.filter(p => {
      const full = `${p.nombre ?? ""} ${p.apellido ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return full.includes(q);
    }).slice(0, 10);
  }, [query, registeredPlayers]);

  const allPlayers = [
    ...((match.teamA?.players ?? []).map((p: any) => ({ ...p, teamKey: "teamA" }))),
    ...((match.teamB?.players ?? []).map((p: any) => ({ ...p, teamKey: "teamB" }))),
  ];

  function requestReplacement(player: any) {
    const key = playerReplacementKey(player.teamKey, player);
    setDraft(d => ({
      ...d, [key]: {
        requested: true,
        titular: { id: player.id, nombre: player.nombre, apellido: player.apellido },
        replacement: draft[key]?.replacement ?? null,
        requestedAtMillis: Date.now(),
      }
    }));
  }

  function assignReplacement(repPlayer: any) {
    if (!pendingKey) return;
    const titular = allPlayers.find(p => playerReplacementKey(p.teamKey, p) === pendingKey);
    setDraft(d => ({
      ...d, [pendingKey]: {
        ...(d[pendingKey] ?? {}),
        requested: true,
        titular: titular ? { id: titular.id, nombre: titular.nombre, apellido: titular.apellido } : {},
        replacement: { id: repPlayer.id, linkedUserId: repPlayer.linkedUserId ?? repPlayer.id, nombre: repPlayer.nombre, apellido: repPlayer.apellido },
      }
    }));
    setPendingKey(null);
    setQuery("");
  }

  function removeReplacement(key: string) {
    setDraft(d => { const next = { ...d }; delete next[key]; return next; });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-[28px] sm:rounded-[22px] pt-5 pb-6 px-5 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-[#086847] text-base">Reemplazos · {match.teamA.label} vs {match.teamB.label}</h3>
          <button onClick={onClose}><X size={18} className="text-[#5F7D72]" /></button>
        </div>

        {allPlayers.map((player, idx) => {
          const key = playerReplacementKey(player.teamKey, player);
          const entry = draft[key];
          const isPending = entry?.requested && !entry?.replacement;
          const isAssigned = entry?.requested && entry?.replacement;

          return (
            <div key={idx} className="mb-3 bg-[#F7FAF8] border border-[#CFE7DC] rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-[#173A2E]">{player.nombre} {player.apellido ?? ""}</div>
                  <div className="text-[11px] text-[#5F7D72]">{player.teamKey === "teamA" ? match.teamA.label : match.teamB.label}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-black">
                  {isPending && <span className="text-[#D47713]">PENDIENTE</span>}
                  {isAssigned && <span className="text-[#24725E]">ASIGNADO</span>}
                </div>
              </div>
              {isAssigned && (
                <div className="mt-1.5 text-[11px] text-[#5F7D72]">
                  Reemplazante: <span className="font-black text-[#247653]">{entry.replacement.nombre} {entry.replacement.apellido ?? ""}</span>
                </div>
              )}
              <div className="flex gap-1.5 mt-2">
                {!entry && (
                  <button onClick={() => requestReplacement(player)}
                    className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-[#FFF3E3] border border-[#E8C58E] text-[#8A5A2B]">
                    Solicitar reemplazo
                  </button>
                )}
                {isPending && (
                  <button onClick={() => { setPendingKey(key); setQuery(""); }}
                    className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-[#DDF6EF] border border-[#89D9C4] text-[#176B5B]">
                    Asignar reemplazante
                  </button>
                )}
                {entry && (
                  <button onClick={() => removeReplacement(key)}
                    className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-[#FFF1F1] border border-[#F2C4C4] text-[#D64545]">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {pendingKey && (
          <div className="mt-3">
            <p className="text-xs font-bold text-[#086847] mb-2">Buscar reemplazante</p>
            <div className="flex items-center gap-2 bg-[#F7FAF8] border border-[#CFE7DC] rounded-xl px-3 py-2 mb-2">
              <Search size={14} className="text-[#5F7D72] flex-shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none text-[#173A2E] placeholder-[#5F7D72]"
                placeholder="Nombre del reemplazante..." autoFocus />
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {filtered.map((rp, i) => (
                <button key={i} onClick={() => assignReplacement(rp)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#CFE7DC] text-left hover:bg-[#DDF6EF] hover:border-[#89D9C4] transition-colors">
                  {(rp.foto || rp.avatarUrl || rp.fotoURL || rp.photoURL)
                    ? <img src={rp.foto || rp.avatarUrl || rp.fotoURL || rp.photoURL} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                    : <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0 text-[10px] font-black text-[#9CA3AF]">{(rp.nombre ?? "?")[0]}</div>
                  }
                  <div>
                    <div className="text-sm font-black text-[#173A2E]">{rp.nombre} {rp.apellido ?? ""}</div>
                    {rp.categoria && <div className="text-[10px] text-[#5F7D72]">{rp.categoria}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={() => onSave(draft)} className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black flex items-center justify-center gap-2">
            <Save size={15} />Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GenerateModal ──────────────────────────────────────────────────────────
function GenerateModal({ league, onClose, onGenerate }: { league: any; onClose: () => void; onGenerate: (f: FixtureData) => void }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const validation = useMemo(() => validateFixture(league), [league]);

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const fixture = generateFixture(league);
      onGenerate(fixture);
    } catch (e: any) {
      setError(e?.message ?? "Error al generar.");
    }
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-[#086847] text-lg">Generar fixture</h3>
          <button onClick={onClose}><X size={18} className="text-[#5F7D72]" /></button>
        </div>
        {!validation.valid && (
          <div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 mb-4 text-sm text-[#8C2D2D] font-semibold">
            {validation.message}
          </div>
        )}
        {error && (
          <div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 mb-4 text-sm text-[#8C2D2D] font-semibold">
            {error}
          </div>
        )}
        {validation.valid && (
          <div className="bg-[#EEF9F1] border border-[#CFE7DC] rounded-xl px-4 py-3 mb-4 text-sm text-[#086847] font-semibold">
            Se generarán <strong>{league?.fixtureConfig?.roundsCount ?? 6}</strong> fechas con el algoritmo{" "}
            {league?.teamType === "individual" ? "Individual (Drive/Reves)" : "Round Robin (parejas"}.
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
          <button onClick={handleGenerate} disabled={!validation.valid || generating}
            className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2">
            {generating ? <RefreshCw size={15} className="animate-spin" /> : <Trophy size={15} />}
            {generating ? "Generando..." : "Generar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MatchRow ───────────────────────────────────────────────────────────────
function MatchRow({ match, roundStatus, canEdit, onResultClick, onActionsClick }: {
  match: MatchData;
  roundStatus: RoundStatus;
  canEdit: boolean;
  onResultClick: () => void;
  onActionsClick: () => void;
}) {
  const res = match.result;
  const hasRes = !!res?.winner && res.winner !== "";
  const aWon = res?.winner === "teamA";
  const bWon = res?.winner === "teamB";
  const isWO = res?.reason === "walkover";
  const dotColor = getReplacementDotColor(match);

  function renderTeamPlayers(team: TeamData, teamKey: "teamA" | "teamB") {
    const players = team.players ?? [];
    if (!players.length) return <span className="text-[9px] font-black text-[#173A2E]">{team.label}</span>;
    const isWinner = (teamKey === "teamA" && aWon) || (teamKey === "teamB" && bWon);
    return (
      <div className="flex flex-col gap-0.5">
        {players.map((p: any, pi: number) => {
          const repKey = playerReplacementKey(teamKey, p);
          const repEntry = (match.replacements ?? {})[repKey];
          const isPending = repEntry?.requested && !repEntry?.replacement;
          const isAssigned = repEntry?.requested && repEntry?.replacement;
          return (
            <div key={pi} className="flex items-center gap-0.5">
              {isWinner && pi === 0 && <span className="text-[10px] text-[#36D66B] mr-0.5">👍</span>}
              {!isWinner && <span className="w-3.5 flex-shrink-0" />}
              <div className="flex flex-col">
                <span className={`text-[9px] font-black leading-tight ${isPending ? "text-[#A85B0E]" : isAssigned ? "text-[#5F7D72] line-through" : isWinner ? "text-[#176B5B]" : "text-[#173A2E]"}`}>
                  {isPending && <span className="text-[#D47713] text-[10px] mr-0.5">⇄</span>}
                  {isAssigned && <span className="text-[#247653] text-[10px] mr-0.5">⇄</span>}
                  {p.nombre} {p.apellido ?? ""}
                </span>
                {isAssigned && (
                  <span className="text-[8px] font-black text-[#247653] leading-tight">▸ {repEntry.replacement.nombre} {repEntry.replacement.apellido ?? ""}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const scoreLabel = hasRes ? (isWO ? "WO" : res.score || "✓") : "Pendiente";
  const scoreStyle = hasRes && canEdit ? "text-[#176B5B] underline cursor-pointer" : hasRes ? "text-[#173A2E]" : "text-[#173A2E]";

  return (
    <div className="grid items-center px-1.5 py-1.5 min-h-[58px] border-b border-[#E4ECEA] last:border-0"
      style={{ gridTemplateColumns: "0.8fr 2.65fr 0.58fr 0.48fr 0.34fr" }}>
      {/* RESULTADOS */}
      <div className="flex items-center justify-center">
        <button onClick={canEdit ? onResultClick : undefined}
          className={`text-[9px] font-black text-center leading-tight ${scoreStyle} ${canEdit && !hasRes ? "hover:text-[#0B8457]" : ""}`}>
          {scoreLabel}
        </button>
      </div>

      {/* PAREJAS */}
      <div className="flex flex-col gap-1 px-1">
        {renderTeamPlayers(match.teamA, "teamA")}
        <div className="text-[8px] font-black text-[#5F7D72] text-center">—</div>
        {renderTeamPlayers(match.teamB, "teamB")}
      </div>

      {/* DIA */}
      <div className="text-center">
        <span className={`text-[9px] font-black ${canEdit ? "text-[#176B5B] underline cursor-pointer" : "text-[#173A2E]"}`}>
          {match.timeSlot ? match.timeSlot.split(" ")[0] : ""}
        </span>
      </div>

      {/* HORA */}
      <div className="text-center">
        <span className={`text-[9px] font-black ${canEdit ? "text-[#176B5B] underline cursor-pointer" : "text-[#173A2E]"}`}>
          {match.timeSlot ?? ""}
        </span>
      </div>

      {/* ACCIONES */}
      <div className="flex items-center justify-center relative">
        {canEdit && (
          <button onClick={onActionsClick}
            className="w-[22px] h-[22px] bg-[#EDF7F2] border border-[#C9E5D8] rounded-[8px] flex items-center justify-center hover:bg-[#DDF6EF] transition-colors">
            <MoreVertical size={13} className="text-[#086847]" />
          </button>
        )}
        {dotColor && (
          <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full border border-white" style={{ background: dotColor }} />
        )}
      </div>
    </div>
  );
}

// ── RoundBlock ─────────────────────────────────────────────────────────────
function RoundBlock({ round, canEdit, onResultClick, onActionsClick, onSuspensionClick }: {
  round: RoundData;
  canEdit: boolean;
  onResultClick: (matchId: string) => void;
  onActionsClick: (matchId: string) => void;
  onSuspensionClick: () => void;
}) {
  const status = getRoundStatus(round);
  const style = STATUS_STYLES[status];
  const matchFormat = "three_full_sets";

  return (
    <div className="rounded-xl overflow-hidden border border-[#BCD8D4]">
      {/* Date header */}
      <div className={`px-3 py-2 flex items-center justify-between ${style.headerBg} border-b border-[#9FCFC3]`} style={{ minHeight: 34 }}>
        <span className="text-[13px] font-black text-[#1E5F57] uppercase tracking-[.06em]">
          {round.title ?? `Fecha ${round.number}`}
        </span>
        <div className="flex items-center gap-1.5">
          <div className={`w-[7px] h-[7px] rounded-[4px] ${style.dot}`} />
          <span className={`text-[8px] font-black ${style.text}`}>{style.label}</span>
          {canEdit && (
            <button onClick={onSuspensionClick} className="ml-1 w-5 h-5 rounded-lg bg-white/50 flex items-center justify-center hover:bg-white/80 transition-colors" title="Opciones de fecha">
              <MoreVertical size={11} className="text-[#1E5F57]" />
            </button>
          )}
        </div>
      </div>

      {/* Column header */}
      {round.matches.length > 0 && (
        <div className="grid items-center px-1.5 py-1.5 bg-[#DCEFEB] border-b border-[#BCD8D4]"
          style={{ gridTemplateColumns: "0.8fr 2.65fr 0.58fr 0.48fr 0.34fr", minHeight: 32 }}>
          {["RESULTADOS", "PAREJAS", "DIA", "HORA", ""].map((col, i) => (
            <div key={i} className="text-[8px] font-black text-[#285E59] text-center">{col}</div>
          ))}
        </div>
      )}

      {/* Matches */}
      <div className="bg-white">
        {round.matches.length === 0
          ? <div className="px-4 py-4 text-sm text-[#5F7D72] italic text-center">Sin partidos</div>
          : round.matches.map(m => (
              <MatchRow
                key={m.id}
                match={m}
                roundStatus={status}
                canEdit={canEdit && status !== "suspended"}
                onResultClick={() => onResultClick(m.id)}
                onActionsClick={() => onActionsClick(m.id)}
              />
            ))
        }
        {round.byeLabels && round.byeLabels.length > 0 && (
          <div className="px-4 py-2 text-[10px] text-[#5F7D72] italic border-t border-[#E4ECEA]">
            Libre: {round.byeLabels.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function FixturePage() {
  const params = useParams();
  const router = useRouter();
  const ligaId = Array.isArray(params?.id) ? params.id[0] : params?.id as string;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [liga, setLiga] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Draft = copia local editable antes de guardar a Firestore
  const [fixtureDraft, setFixtureDraft] = useState<FixtureData>({ generatedAtMillis: 0, rounds: [] });

  // Modals
  const [resultTarget, setResultTarget] = useState<{ roundId: string; matchId: string } | null>(null);
  const [actionsTarget, setActionsTarget] = useState<{ roundId: string; matchId: string } | null>(null);
  const [suspensionTarget, setSuspensionTarget] = useState<string | null>(null); // roundId
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [goToPaymentsPrompt, setGoToPaymentsPrompt] = useState(false);

  // Registered players for replacement search
  const [registeredPlayers, setRegisteredPlayers] = useState<any[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setCurrentUser(u));
    return unsub;
  }, []);

  // Load league
  useEffect(() => {
    if (!ligaId) return;
    (async () => {
      const snap = await getDoc(doc(db, "leagues", ligaId));
      if (!snap.exists()) { router.push("/dashboard/ligas"); return; }
      const data = { id: snap.id, ...snap.data() };
      setLiga(data);
      setFixtureDraft((data as any).fixture ?? { generatedAtMillis: 0, rounds: [] });
      setLoading(false);
    })();
  }, [ligaId]);

  // Load registered players (for replacement picker)
  useEffect(() => {
    if (playersLoaded) return;
    (async () => {
      const snap = await getDocs(fsQuery(collection(db, "users"), where("accountDeleted", "!=", true)));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((u: any) => u.role !== "blocked" && u.role !== "deleted");
      setRegisteredPlayers(all);
      setPlayersLoaded(true);
    })();
  }, []);

  const canEdit = liga?.organizerId === currentUser?.uid;
  const hasFixture = (fixtureDraft?.generatedAtMillis ?? 0) > 0 && (fixtureDraft?.rounds?.length ?? 0) > 0;
  const hasUnsavedChanges = hasFixture && JSON.stringify(fixtureDraft) !== JSON.stringify(liga?.fixture ?? { generatedAtMillis: 0, rounds: [] });
  const validation = liga ? validateFixture(liga) : { valid: false, message: "" };

  // ── Helpers to find round/match ──────────────────────────────────────────
  function getMatch(roundId: string, matchId: string): MatchData | null {
    const round = fixtureDraft.rounds.find(r => r.id === roundId);
    return round?.matches.find(m => m.id === matchId) ?? null;
  }

  function getRound(roundId: string): RoundData | null {
    return fixtureDraft.rounds.find(r => r.id === roundId) ?? null;
  }

  // ── Update draft helpers ─────────────────────────────────────────────────
  function updateMatchInDraft(roundId: string, matchId: string, updater: (m: MatchData) => MatchData) {
    setFixtureDraft(prev => {
      const rounds = prev.rounds.map(round => {
        if (round.id !== roundId) return round;
        const matches = round.matches.map(m => m.id !== matchId ? m : updater(m));
        const allDone = matches.length > 0 && matches.every(m => m.result?.winner && m.result.winner !== "");
        return { ...round, matches, completedAtMillis: allDone ? (round.completedAtMillis || Date.now()) : 0 };
      });
      return { ...prev, rounds };
    });
  }

  function updateRoundInDraft(roundId: string, updater: (r: RoundData) => RoundData) {
    setFixtureDraft(prev => ({ ...prev, rounds: prev.rounds.map(r => r.id !== roundId ? r : updater(r)) }));
  }

  // ── Save to Firestore ────────────────────────────────────────────────────
  async function saveFixture(fixture: FixtureData) {
    setSaving(true);
    try {
      await updateDoc(doc(db, "leagues", ligaId), { fixture, updatedAt: serverTimestamp() });
      setLiga((p: any) => ({ ...p, fixture }));
      setFixtureDraft(fixture);
      showToast("Fixture guardado.");
    } catch {
      showToast("Error al guardar.", false);
    }
    setSaving(false);
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleSaveResult(roundId: string, matchId: string, result: MatchResult) {
    updateMatchInDraft(roundId, matchId, m => ({ ...m, result, completedAtMillis: result.winner ? Date.now() : 0 }));
    setResultTarget(null);
  }

  function handleSaveReplacements(roundId: string, matchId: string, replacements: Record<string, any>) {
    updateMatchInDraft(roundId, matchId, m => ({ ...m, replacements }));
    setActionsTarget(null);
    showToast("Reemplazos guardados. Presioná GUARDAR CAMBIOS.");
  }

  function handleSuspension(roundId: string, data: any) {
    if (data.remove) {
      updateRoundInDraft(roundId, r => ({ ...r, suspendedAtMillis: 0, suspensionReason: "", suspensionMode: "" }));
    } else {
      updateRoundInDraft(roundId, r => ({
        ...r,
        suspendedAtMillis: Date.now(),
        suspensionReason: data.reason,
        suspensionMode: data.mode,
      }));
    }
    setSuspensionTarget(null);
    showToast("Suspensión aplicada. Presioná GUARDAR CAMBIOS.");
  }

  async function handleGenerate(fixture: FixtureData) {
    setGenModalOpen(false);
    setGenerating(true);
    try {
      await saveFixture(fixture);
      showToast("Fixture generado.");
    } catch {
      showToast("Error al generar.", false);
    }
    setGenerating(false);
  }

  async function handleDeleteFixture() {
    setConfirmDeleteOpen(false);
    const empty: FixtureData = { generatedAtMillis: 0, rounds: [] };
    await saveFixture(empty);
    showToast("Fixture eliminado.");
  }

  async function handleRegenerateFixture() {
    setConfirmRegenOpen(false);
    try {
      const fixture = generateFixture(liga);
      await saveFixture(fixture);
      showToast("Fixture regenerado.");
    } catch (e: any) {
      showToast(e?.message ?? "Error al regenerar.", false);
    }
  }

  // ── Derived state for modals ─────────────────────────────────────────────
  const activeMatch = resultTarget ? getMatch(resultTarget.roundId, resultTarget.matchId) : null;
  const actionsMatch = actionsTarget ? getMatch(actionsTarget.roundId, actionsTarget.matchId) : null;
  const suspensionRound = suspensionTarget ? getRound(suspensionTarget) : null;
  const matchFormat = liga?.fixtureConfig?.matchFormat ?? "three_full_sets";

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout title="">
        <div className="flex items-center justify-center py-32">
          <RefreshCw size={22} className="animate-spin text-[#0B8457]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!liga) {
    return (
      <DashboardLayout title="">
        <div className="text-center py-32 text-[#5F7D72]">Liga no encontrada.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="">
      <div className="max-w-3xl mx-auto px-4 pb-32 pt-6">

        {/* Breadcrumb */}
        <button onClick={() => router.push(`/dashboard/ligas/${ligaId}`)}
          className="flex items-center gap-1.5 text-sm font-bold text-[#5F7D72] hover:text-[#0B8457] transition-colors mb-6">
          <ChevronLeft size={16} />{liga.nombre ?? "Volver a la liga"}
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="text-[11px] font-black text-[#1E5F57] uppercase tracking-[.08em] mb-1">Fixture</div>
          <h1 className="text-2xl font-black text-[#173A2E]">{liga.nombre}</h1>
          {liga.categoria && <div className="text-[#5F7D72] text-sm font-semibold mt-0.5">{liga.categoria}</div>}
        </div>

        {/* Unsaved changes banner */}
        {hasUnsavedChanges && (
          <div className="bg-[#FFF3E3] border border-[#E8C58E] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
            <AlertCircle size={16} className="text-[#D68A2D] flex-shrink-0" />
            <span className="text-sm font-bold text-[#8A5A2B]">Hay cambios sin guardar en el fixture.</span>
          </div>
        )}

        {/* Validation warning (when no fixture and invalid) */}
        {!hasFixture && !validation.valid && (
          <div className="bg-[#FFF1F1] border border-[#F2CACA] rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-[#8C2D2D]">{validation.message}</p>
          </div>
        )}

        {/* Generate button */}
        {!hasFixture && canEdit && (
          <div className="text-center py-12">
            <div className="text-[#5F7D72] text-sm mb-4">Todavía no hay fechas armadas.</div>
            <button onClick={() => setGenModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors disabled:opacity-40"
              disabled={generating || !validation.valid}>
              {generating ? <RefreshCw size={16} className="animate-spin" /> : <Trophy size={16} />}
              {generating ? "Generando..." : "Generar fixture"}
            </button>
          </div>
        )}

        {/* Rounds */}
        {hasFixture && (
          <div className="flex flex-col gap-3">
            {fixtureDraft.rounds.map(round => (
              <RoundBlock
                key={round.id}
                round={round}
                canEdit={canEdit}
                onResultClick={matchId => setResultTarget({ roundId: round.id, matchId })}
                onActionsClick={matchId => setActionsTarget({ roundId: round.id, matchId })}
                onSuspensionClick={() => setSuspensionTarget(round.id)}
              />
            ))}
          </div>
        )}

        {/* Fixture options (danger zone) */}
        {hasFixture && canEdit && (
          <div className="mt-8 border border-[#F2C4C4] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[#FFF1F1] border-b border-[#F2C4C4]">
              <div className="text-xs font-black text-[#994646] uppercase tracking-wider">Zona peligrosa</div>
            </div>
            <div className="px-5 py-4 flex flex-col sm:flex-row gap-3">
              <button onClick={() => setConfirmRegenOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#F2C4C4] text-sm font-black text-[#994646] hover:bg-[#FFF1F1] transition-colors">
                <RefreshCw size={14} />Regenerar fixture
              </button>
              <button onClick={() => setConfirmDeleteOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#D64545] text-white text-sm font-black hover:bg-[#B83030] transition-colors">
                <Trash2 size={14} />Eliminar fixture
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Sticky save button ── */}
      {hasUnsavedChanges && canEdit && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 px-4">
          <button onClick={() => saveFixture(fixtureDraft)} disabled={saving}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#0B8457] text-white text-sm font-black shadow-xl hover:bg-[#086847] transition-colors disabled:opacity-60">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Guardando..." : "GUARDAR CAMBIOS"}
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {genModalOpen && liga && (
        <GenerateModal league={liga} onClose={() => setGenModalOpen(false)} onGenerate={handleGenerate} />
      )}

      {activeMatch && resultTarget && (
        <ResultModal
          match={activeMatch}
          matchFormat={matchFormat}
          onClose={() => setResultTarget(null)}
          onSave={result => handleSaveResult(resultTarget.roundId, resultTarget.matchId, result)}
        />
      )}

      {actionsMatch && actionsTarget && (
        <ReplacementModal
          match={actionsMatch}
          registeredPlayers={registeredPlayers}
          onClose={() => setActionsTarget(null)}
          onSave={replacements => handleSaveReplacements(actionsTarget.roundId, actionsTarget.matchId, replacements)}
        />
      )}

      {suspensionRound && suspensionTarget && (
        <SuspensionModal
          round={suspensionRound}
          onClose={() => setSuspensionTarget(null)}
          onApply={data => handleSuspension(suspensionTarget, data)}
        />
      )}

      {/* Confirm regenerate */}
      {confirmRegenOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-[#173A2E] text-lg mb-2">¿Regenerar fixture?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Se perderán todos los resultados y cambios actuales.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRegenOpen(false)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={handleRegenerateFixture} className="flex-1 py-3 rounded-xl bg-[#D64545] text-white text-sm font-black">Regenerar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-[#173A2E] text-lg mb-2">¿Eliminar fixture?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Esta acción es irreversible. Se eliminarán todas las fechas y resultados.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteOpen(false)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={handleDeleteFixture} className="flex-1 py-3 rounded-xl bg-[#D64545] text-white text-sm font-black">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Go to payments prompt */}
      {goToPaymentsPrompt && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] p-7 w-full max-w-sm shadow-2xl text-center">
            <div className="text-3xl mb-3">🎾</div>
            <h3 className="font-black text-[#086847] text-lg mb-2">¡Fecha completada!</h3>
            <p className="text-sm text-[#5F7D72] mb-5">¿Querés revisar los pagos de esta liga?</p>
            <div className="flex gap-3">
              <button onClick={() => setGoToPaymentsPrompt(false)} className="flex-1 py-3 rounded-xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Ahora no</button>
              <button onClick={() => router.push(`/dashboard/ligas/${ligaId}?tab=pagos`)}
                className="flex-1 py-3 rounded-xl bg-[#0B8457] text-white text-sm font-black">Ver pagos</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </DashboardLayout>
  );
}
