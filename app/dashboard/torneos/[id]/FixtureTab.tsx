"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { doc, updateDoc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { upsertTournamentRankingEntry } from "@/lib/tournamentRanking";
import { X, Plus, Minus, ChevronDown, ChevronUp, Clock, Check, MapPin, Trash2, Info } from "lucide-react";
import {
  normalizeZoneVenueSchedules,
  buildTournamentDayOptions,
  resolveFixtureRecommendation,
  buildAutomaticZonePlanning,
  isRegistrationConfirmed,
  getPlanningMatchPairNumbers,
  getZoneMatchParticipantIds,
  buildZoneMatchSchedulingSlots,
  buildAutoMatchSchedules,
  buildAutoMatchSchedulesAcrossZones,
  formatMinutesToTime,
  normalizeTypedTimeInput,
  parseMatchDurationToMinutes,
  formatMatchDurationValue,
  parseTimeToMinutes,
  buildAvailabilityWarningForParticipants,
  type ZoneVenueSchedule,
  type ZonePlanningZone,
} from "@/lib/tournamentZones";
import { buildBracketPreview, applyBracketProgressions, assignSchedulesToBracketMatches, syncBracketWithZones, type BracketPair } from "@/lib/tournamentBracket";
import {
  DEFAULT_REST_MINUTES,
  buildScheduleOccupancy,
  validateMatchSlot,
  type ScheduledMatch,
  type ScheduleOccupancy,
} from "@/lib/scheduleValidation";
import {
  getHourColumnsForDay,
  getTotalLoadedHours,
  buildZoneLetterMapForZones,
  sortRegistrationsUnassignedFirst,
  isSlotAvailable,
  buildAvailabilityAfterCellToggle,
} from "@/lib/availabilityGrid";
import AvailabilityGrid, { type CategoryBlock, type GridFilter, type GridRow } from "./AvailabilityGrid";

// ── Types ─────────────────────────────────────────────────────────────────────
type FixSub = "configurar" | "automatico" | "manual";
type MatchFmt = "third_set" | "super_tiebreak";
type BracketFinalOverride = "none" | "final_only" | "semifinal_and_final";

// Mismo criterio que usa la app: si el formato de llaves es Super Tie Break,
// la excepcion de "instancias finales" puede bajar semifinal/final (o solo la
// final) a tercer set completo. Si el formato de llaves no es super tie break,
// todas las rondas quedan en tercer set sin importar la excepcion.
function resolveBracketRoundMatchFormat(
  bracketFmt: MatchFmt, finalOverride: BracketFinalOverride, roundTitle = ""
): MatchFmt {
  if (bracketFmt !== "super_tiebreak") return "third_set";
  const normalizedRoundTitle = String(roundTitle || "").trim().toLowerCase();
  if (finalOverride === "semifinal_and_final" && (normalizedRoundTitle.includes("semifinal") || normalizedRoundTitle.includes("final"))) {
    return "third_set";
  }
  if (finalOverride === "final_only" && normalizedRoundTitle === "final") {
    return "third_set";
  }
  return "super_tiebreak";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_W = 258;
const CARD_H = 172;
const COL_STEP = 282;
const B_PAD = 16;
const B_HDR = 34;
const ROUND_COLORS = ["#AEEBFF", "#6FCBFF", "#2E8FE8", "#0B4FB3"];

export const PAIR_COLORS = [
  { bg: "#E8F5EE", fill: "#BFE8D0", text: "#0F5F37" },
  { bg: "#EAF3FF", fill: "#C7DFFF", text: "#1F5B99" },
  { bg: "#FFF4E3", fill: "#F7D89A", text: "#895A00" },
  { bg: "#F3EEFF", fill: "#D9CCFF", text: "#5B3EA0" },
  { bg: "#E8FAFA", fill: "#BCE9E7", text: "#146C68" },
  { bg: "#FFF0F4", fill: "#F7C7D2", text: "#9B314B" },
];

const FORMAT_OPTIONS: { id: MatchFmt; label: string; desc: string }[] = [
  { id: "third_set", label: "Tercer set", desc: "SET 1 — SET 2 — SET 3" },
  { id: "super_tiebreak", label: "Super Tie Break", desc: "SET 1 — SET 2 — SUPER TIE BREAK" },
];

const TOURNAMENT_RULESET_OPTIONS: { value: "fap" | "apa"; label: string; subtitle: string; description: string }[] = [
  { value: "fap", label: "TORNEO FAP", subtitle: "Federacion Argentina de Padel", description: "Modalidad mas extensa." },
  { value: "apa", label: "TORNEO APA", subtitle: "Asociacion Padel Argentina", description: "Modalidad mas corta." },
];

const BRACKET_FINAL_OVERRIDE_OPTIONS: { value: BracketFinalOverride; label: string; description: string }[] = [
  { value: "none", label: "SIN EXCEPCIONES", description: "Todas las llaves mantienen el mismo formato." },
  { value: "final_only", label: "SOLO FINAL A 3ER SET", description: "La final pasa a jugarse a tercer set completo." },
  { value: "semifinal_and_final", label: "SEMIFINAL Y FINAL A 3ER SET", description: "Semifinales y final pasan a jugarse a tercer set completo." },
];

// ── Data normalization ────────────────────────────────────────────────────────
function toArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return Object.values(val);
  return [];
}

function normalizeBracketRounds(bracketPreview: any): any[][] {
  if (!bracketPreview) return [];
  const raw = bracketPreview.rounds ?? bracketPreview;
  const roundArr = toArray(raw);
  return roundArr.map((round: any) => {
    if (Array.isArray(round)) return round;
    if (round && typeof round === "object") {
      if (Array.isArray(round.matches)) return round.matches;
      return Object.values(round);
    }
    return [];
  });
}

// ── Domain helpers ────────────────────────────────────────────────────────────
function getMatchRows(n: number): string[] {
  if (n === 2) return ["1 vs 2"];
  if (n === 3) return ["1 vs 2", "1 vs 3", "2 vs 3"];
  if (n >= 4) return ["1 vs 2", "3 vs 4", "G vs G", "P vs P"];
  return [];
}

function zoneAutoLabel(existingCount: number): string {
  return `Zona ${String.fromCharCode(65 + existingCount)}`;
}

function getPairLabel(reg: any, fallbackIdx: number): string {
  const p1 = reg?.player1Name ?? "";
  const p2 = reg?.player2Name ?? "";
  if (p1 && p2) return `${p1} / ${p2}`;
  if (p1) return p1;
  return reg?.pairLabel ?? `Pareja ${fallbackIdx + 1}`;
}

// "Juan Perez" -> "Perez J." (igual que getShortPersonName en la app), para
// que entren los dos nombres de la pareja en el encabezado angosto de la
// tabla de Armado Manual.
function getShortPersonName(rawName: string = ""): string {
  const parts = String(rawName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return `${lastName} ${firstName.charAt(0).toUpperCase()}.`;
}

export function getShortPairLabel(reg: any, fallbackIdx: number): string {
  const explicitNames = [reg?.player1Name, reg?.player2Name].filter(Boolean).map(getShortPersonName).filter(Boolean);
  if (explicitNames.length) return explicitNames.join(" / ");
  const label = getPairLabel(reg, fallbackIdx);
  const splitLabel = String(label || "").split(/\s+\/\s+/).map(getShortPersonName).filter(Boolean);
  return splitLabel.length ? splitLabel.join(" / ") : label;
}

function extractCategoryOrderNumber(label: string = ""): number {
  const match = String(label || "").match(/(\d+)/);
  return match ? Number(match[1]) : 999;
}

function formatDayKey(dayKey: string): string {
  try {
    const d = new Date(dayKey + "T12:00:00");
    return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return dayKey;
  }
}

// ── Bracket/zona data helpers (ResultModal es compartido por los dos) ───────
// Partido de llave real (tal cual la escribe la app): teamAId/teamAName/
// teamALines/teamAIsBye (no pairAId/sideAId) y ganador como token relativo
// "teamA"/"teamB" (no un id real, porque un lado puede depender todavia del
// resultado de otro partido). Partido de zona (makeMatchObj): pairAId/
// pairALabel, y ganador como id real en result.winnerRegistrationId.
const getSideA = (m: any) => ({
  id: m.teamAId ?? m.pairAId ?? "",
  label: m.teamAIsBye ? "BYE" : m.teamAName || toArray(m.teamALines).join(" / ") || m.pairALabel || "TBD",
  isBye: Boolean(m.teamAIsBye),
});
const getSideB = (m: any) => ({
  id: m.teamBId ?? m.pairBId ?? "",
  label: m.teamBIsBye ? "BYE" : m.teamBName || toArray(m.teamBLines).join(" / ") || m.pairBLabel || "TBD",
  isBye: Boolean(m.teamBIsBye),
});
const getWinnerId = (m: any): string => {
  if (m.result?.winnerRegistrationId) return m.result.winnerRegistrationId;
  const w = m.result?.winner;
  if (w === "teamA") return m.teamAId ?? m.pairAId ?? "";
  if (w === "teamB") return m.teamBId ?? m.pairBId ?? "";
  return "";
};
const isCompleted = (m: any): boolean => !!getWinnerId(m) || m.result?.walkover === true;
const getSets = (m: any): { a: number; b: number }[] =>
  toArray(m.result?.sets).map((s: any) => ({ a: Number(s.teamA) || 0, b: Number(s.teamB) || 0 }));
const getScoreText = (m: any): string => {
  const r = m.result;
  if (!r) return "";
  if (r.walkover) return "Walkover";
  const sets = getSets(m);
  return sets.length ? sets.map((s) => `${s.a}-${s.b}`).join(" ") : "";
};

function roundLabel(n: number) {
  if (n === 1) return "Final";
  if (n === 2) return "Semifinales";
  if (n === 4) return "Cuartos de final";
  if (n === 8) return "Octavos de final";
  return `Ronda de ${n}`;
}
function roundColor(ri: number, total: number) {
  const idx = total <= 1 ? ROUND_COLORS.length - 1 : Math.round((ri / (total - 1)) * (ROUND_COLORS.length - 1));
  return ROUND_COLORS[Math.min(idx, ROUND_COLORS.length - 1)];
}
function isDarkRoundColor(hex: string) { return hex === "#2E8FE8" || hex === "#0B4FB3"; }

// ── Build match object for zone result modal ──────────────────────────────────
function makeMatchObj(zone: any, matchKey: string, regMap: Record<string, any>) {
  const regIds = toArray(zone.registrationIds);
  // "G vs G" / "P vs P" (semis cruzadas de una zona de 4) no son posiciones
  // fijas: hay que resolver quien gano/perdio "1 vs 2" y "3 vs 4" primero.
  const pairNumbers = getPlanningMatchPairNumbers(zone, regIds, matchKey);
  const parts = pairNumbers.length === 2 ? pairNumbers : matchKey.split(" vs ");
  const side = (part: string) => {
    const n = parseInt(part);
    if (!isNaN(n)) {
      const idx = n - 1;
      const id = regIds[idx] ?? "";
      return { id, label: id && regMap[id] ? getPairLabel(regMap[id], idx) : `Pareja ${n}` };
    }
    return { id: "", label: part };
  };
  const a = side(parts[0] ?? "");
  const b = side(parts[1] ?? "");
  const md = zone.matchSchedules?.[matchKey] ?? {};
  return { pairAId: a.id, pairALabel: a.label, pairBId: b.id, pairBLabel: b.label, result: md.result ?? null };
}

// ── Bracket layout ────────────────────────────────────────────────────────────
function buildBracketLayout(rounds: any[][]) {
  const pos: { x: number; y: number }[][] = [];
  for (let ri = 0; ri < rounds.length; ri++) {
    pos[ri] = [];
    const x = B_PAD + ri * COL_STEP;
    if (ri === 0) {
      rounds[ri].forEach((_, mi) => { pos[ri][mi] = { x, y: B_PAD + B_HDR + 8 + mi * (CARD_H + 8) }; });
    } else {
      rounds[ri].forEach((_, mi) => {
        const pA = pos[ri - 1]?.[mi * 2];
        const pB = pos[ri - 1]?.[mi * 2 + 1];
        const y = pA && pB ? (pA.y + pB.y + CARD_H) / 2 - CARD_H / 2 : pA ? pA.y : B_PAD + B_HDR + 8;
        pos[ri][mi] = { x, y };
      });
    }
  }
  const bw = B_PAD * 2 + rounds.length * COL_STEP - (COL_STEP - CARD_W);
  const maxY = pos.flat().reduce((m, p) => Math.max(m, p.y), 0);
  const bh = maxY + CARD_H + B_PAD;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let ri = 1; ri < rounds.length; ri++) {
    rounds[ri].forEach((_, mi) => {
      const cur = pos[ri][mi];
      const pA = pos[ri - 1]?.[mi * 2];
      const pB = pos[ri - 1]?.[mi * 2 + 1];
      const midX = cur.x - (COL_STEP - CARD_W) / 2;
      const curCY = cur.y + CARD_H / 2;
      if (pA && pB) {
        const aCY = pA.y + CARD_H / 2, bCY = pB.y + CARD_H / 2;
        lines.push({ x1: pA.x + CARD_W, y1: aCY, x2: midX, y2: aCY });
        lines.push({ x1: pB.x + CARD_W, y1: bCY, x2: midX, y2: bCY });
        lines.push({ x1: midX, y1: aCY, x2: midX, y2: bCY });
        lines.push({ x1: midX, y1: curCY, x2: cur.x, y2: curCY });
      } else if (pA) {
        const aCY = pA.y + CARD_H / 2;
        lines.push({ x1: pA.x + CARD_W, y1: aCY, x2: cur.x, y2: aCY });
        if (Math.abs(aCY - curCY) > 1) lines.push({ x1: cur.x, y1: aCY, x2: cur.x, y2: curCY });
      }
    });
  }
  return { pos, bw, bh, lines };
}

// ── Small UI atoms ────────────────────────────────────────────────────────────
function RadioDot({ active }: { active: boolean }) {
  return (
    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
      style={{ borderColor: active ? "#0B8457" : "#CFE7DC" }}>
      {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#0B8457" }} />}
    </div>
  );
}

function Stepper({ value, onChange, min, max, step = 1, unit }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - step))}
        className="w-9 h-9 rounded-full border flex items-center justify-center"
        style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
        <Minus size={15} />
      </button>
      <span className="text-xl font-black w-10 text-center" style={{ color: "#173A2E" }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))}
        className="w-9 h-9 rounded-full border flex items-center justify-center"
        style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
        <Plus size={15} />
      </button>
      {unit && <span className="text-xs" style={{ color: "#9BB8AE" }}>{unit}</span>}
    </div>
  );
}

// ── Result Modal ──────────────────────────────────────────────────────────────
function ResultModal({ match, format, onClose, onSave }: {
  match: any; format: MatchFmt; onClose: () => void;
  onSave: (result: any) => Promise<void>;
}) {
  const a = getSideA(match);
  const b = getSideB(match);
  const existingSets = getSets(match);
  const numRegSets = format === "third_set" ? 3 : 2;
  const initSets = Array.from({ length: numRegSets }, (_, i) => ({
    a: String(existingSets[i]?.a ?? ""), b: String(existingSets[i]?.b ?? ""),
  }));
  const [winner, setWinner] = useState<string>(getWinnerId(match) || (match.result?.walkover ? "walkover" : ""));
  const [sets, setSets] = useState(initSets);
  const [superTB, setSuperTB] = useState(
    format === "super_tiebreak" && existingSets[numRegSets]
      ? { a: String(existingSets[numRegSets].a), b: String(existingSets[numRegSets].b) }
      : { a: "", b: "" }
  );
  const [saving, setSaving] = useState(false);
  const isWO = winner === "walkover";

  async function handleSave() {
    if (!winner) return;
    setSaving(true);
    const filteredSets = isWO
      ? []
      : sets.filter(s => s.a !== "" || s.b !== "").map(s => ({ a: parseInt(s.a) || 0, b: parseInt(s.b) || 0 }));
    if (!isWO && format === "super_tiebreak" && (superTB.a !== "" || superTB.b !== ""))
      filteredSets.push({ a: parseInt(superTB.a) || 0, b: parseInt(superTB.b) || 0 });
    const result = {
      winnerId: isWO ? "" : winner,
      walkover: isWO,
      sets: filteredSets,
      scoreText: isWO ? "Walkover" : filteredSets.slice(0, numRegSets).map(s => `${s.a}-${s.b}`).join(" "),
    };
    await onSave(result);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-[22px] p-6 shadow-xl overflow-y-auto" style={{ background: "#FFFFFF", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Resultado del partido</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>
        <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>¿Quién ganó?</p>
        <div className="flex gap-2 mb-2">
          {[{ id: a.id, label: a.label }, { id: b.id, label: b.label }].map(side => (
            <button key={side.id} onClick={() => setWinner(side.id)}
              className="flex-1 rounded-xl py-3 px-2 text-xs font-bold border transition-all text-center"
              style={winner === side.id
                ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" }
                : { background: "#F6FBF8", color: "#173A2E", borderColor: "#CFE7DC" }}>
              {side.label}
            </button>
          ))}
        </div>
        <button onClick={() => setWinner("walkover")}
          className="w-full rounded-xl py-2 text-xs font-bold border mb-5 transition-all"
          style={isWO
            ? { background: "#667482", color: "#FFF", borderColor: "#667482" }
            : { background: "#F3F5F7", color: "#667482", borderColor: "#D4DBE2" }}>
          Walkover
        </button>
        {!isWO && (
          <div className="mb-5">
            <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>Sets</p>
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-16 font-semibold" style={{ color: "#5F7D72" }}>SET {i + 1}</span>
                <input type="number" min={0} max={7} value={s.a}
                  onChange={e => setSets(prev => prev.map((p, j) => j === i ? { ...p, a: e.target.value } : p))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }} placeholder="0" />
                <span className="text-xs font-black" style={{ color: "#9BB8AE" }}>–</span>
                <input type="number" min={0} max={7} value={s.b}
                  onChange={e => setSets(prev => prev.map((p, j) => j === i ? { ...p, b: e.target.value } : p))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }} placeholder="0" />
              </div>
            ))}
            {format === "super_tiebreak" && (
              <div className="flex items-center gap-2">
                <span className="text-xs w-16 font-semibold" style={{ color: "#5F7D72" }}>SUPER TB</span>
                <input type="number" min={0} max={99} value={superTB.a}
                  onChange={e => setSuperTB(p => ({ ...p, a: e.target.value }))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }} placeholder="0" />
                <span className="text-xs font-black" style={{ color: "#9BB8AE" }}>–</span>
                <input type="number" min={0} max={99} value={superTB.b}
                  onChange={e => setSuperTB(p => ({ ...p, b: e.target.value }))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }} placeholder="0" />
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border text-sm font-bold"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || !winner}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "#0B8457" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Standings Modal ───────────────────────────────────────────────────────────
function StandingsModal({ zone, regMap, onClose }: {
  zone: any; regMap: Record<string, any>; onClose: () => void;
}) {
  const regIds = toArray(zone.registrationIds);
  const matchSchedules: Record<string, any> = zone.matchSchedules ?? {};
  type Row = { id: string; label: string; pj: number; pg: number; pp: number; sf: number; sc: number };
  const map: Record<string, Row> = {};
  regIds.forEach((id: string, idx: number) => {
    const reg = regMap[id];
    map[id] = { id, label: reg ? getPairLabel(reg, idx) : `Pareja ${idx + 1}`, pj: 0, pg: 0, pp: 0, sf: 0, sc: 0 };
  });
  for (const [key, md] of Object.entries(matchSchedules)) {
    const parts = key.split(" vs ");
    const idxA = parseInt(parts[0]) - 1, idxB = parseInt(parts[1]) - 1;
    if (isNaN(idxA) || isNaN(idxB)) continue;
    const idA = regIds[idxA], idB = regIds[idxB];
    if (!idA || !idB || !map[idA] || !map[idB]) continue;
    const result = (md as any)?.result;
    if (!result?.winnerRegistrationId) continue;
    const w = result.winnerRegistrationId;
    if (w === idA) { map[idA].pg++; map[idA].pj++; map[idB].pp++; map[idB].pj++; }
    else if (w === idB) { map[idB].pg++; map[idB].pj++; map[idA].pp++; map[idA].pj++; }
    else continue;
    const sets: any[] = Array.isArray(result.sets) ? result.sets : [];
    for (const s of sets) {
      const a = Number(s.teamA) || 0, b = Number(s.teamB) || 0;
      if (w === idA) { map[idA].sf += a; map[idA].sc += b; map[idB].sf += b; map[idB].sc += a; }
      else { map[idB].sf += b; map[idB].sc += a; map[idA].sf += a; map[idA].sc += b; }
    }
  }
  const rows = Object.values(map).map(s => ({ ...s, dif: s.sf - s.sc }))
    .sort((a, b) => b.pg - a.pg || b.pj - a.pj || b.dif - a.dif || b.sf - a.sf);
  const qualifiers = zone.qualifiers ?? 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-[22px] p-6 shadow-xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Posiciones — {zone.label ?? "Zona"}</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "#5F7D72" }}>Sin partidos completados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 380 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #CFE7DC" }}>
                  {["#", "PAREJA", "PJ", "PG", "PP", "SF", "SC", "DIF"].map(h => (
                    <th key={h} className="py-2 text-center font-black text-[10px] uppercase"
                      style={{ color: h === "PG" ? "#0B8457" : "#5F7D72", letterSpacing: "0.4px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F0F7F4", background: i < qualifiers ? "rgba(11,132,87,0.04)" : undefined }}>
                    <td className="py-2 text-center font-black" style={{ color: "#9BB8AE" }}>{i + 1}</td>
                    <td className="py-2 text-left">
                      <span className="flex items-center gap-1.5">
                        {i < qualifiers && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#0B8457" }} />}
                        <span className="font-semibold truncate" style={{ color: i === 0 ? "#0B8457" : "#173A2E" }}>{s.label}</span>
                      </span>
                    </td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.pj}</td>
                    <td className="py-2 text-center font-black" style={{ color: "#0B8457" }}>{s.pg}</td>
                    <td className="py-2 text-center" style={{ color: "#E87070" }}>{s.pp}</td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.sf}</td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.sc}</td>
                    <td className="py-2 text-center font-semibold" style={{ color: s.dif >= 0 ? "#0B8457" : "#E87070" }}>
                      {s.dif > 0 ? `+${s.dif}` : s.dif}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {qualifiers > 0 && rows.length > 0 && (
          <p className="text-[10px] mt-3 flex items-center gap-1.5" style={{ color: "#5F7D72" }}>
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#0B8457" }} />
            Los primeros {qualifiers} clasifican a llaves
          </p>
        )}
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-2xl border text-sm font-bold"
          style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Cerrar</button>
      </div>
    </div>
  );
}

// ── Zone card ─────────────────────────────────────────────────────────────────
function ZoneCard({ zone, regMap, zonesFormat, venueNameById, categoryLabel, getMatchConflict, onResultClick, onStandingsClick, onScheduleClick, onRemovePair }: {
  zone: any; regMap: Record<string, any>; zonesFormat: MatchFmt; venueNameById: Record<string, string>;
  categoryLabel?: string;
  getMatchConflict?: (zone: any, matchKey: string) => { hasConflict: boolean; conflictReason: string };
  onResultClick: (matchKey: string, match: any) => void;
  onStandingsClick: () => void;
  onScheduleClick: (matchKey: string) => void;
  onRemovePair?: (regId: string) => void;
}) {
  const regIds = toArray(zone.registrationIds);
  const matchKeys = getMatchRows(regIds.length);
  const matchSchedules: Record<string, any> = zone.matchSchedules ?? {};
  const completedCount = matchKeys.filter(k => matchSchedules[k]?.result?.winnerRegistrationId || matchSchedules[k]?.result?.walkover).length;

  return (
    <div className="rounded-[22px] border-2 overflow-hidden" style={{ background: "#FFFFFF", borderColor: "#A8CFBC" }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between border-b flex-wrap gap-2"
        style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
        <div className="flex flex-col items-start gap-1">
          {categoryLabel && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase"
              style={{ background: "#DFF4EC", color: "#086847", letterSpacing: "0.3px" }}>
              {categoryLabel}
            </span>
          )}
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-black border"
            style={{ background: "#E1F4F0", borderColor: "#9FD6CF", color: "#1F6D69" }}>
            {zone.label ?? "Zona"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#9BB8AE" }}>{completedCount}/{matchKeys.length} partidos</span>
          <button onClick={onStandingsClick}
            className="text-xs font-black px-3 py-1.5 rounded-full border"
            style={{ background: "#EEF8F1", borderColor: "#C5E5CF", color: "#0B8457" }}>
            PUNTAJES
          </button>
        </div>
      </div>

      {/* Pair tags */}
      {regIds.length > 0 && (
        <div className="px-5 pt-3 pb-1 flex flex-wrap gap-2">
          {regIds.map((id: string, i: number) => {
            const color = PAIR_COLORS[i % 6];
            const label = regMap[id] ? getPairLabel(regMap[id], i) : `Pareja ${i + 1}`;
            return (
              <div key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
                style={{ background: color.bg, borderColor: color.fill, color: color.text }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                  style={{ background: color.fill, color: color.text }}>
                  {i + 1}
                </span>
                <span className="font-semibold truncate max-w-[120px]">{label}</span>
                {onRemovePair && (
                  <button onClick={() => onRemovePair(id)} className="flex-shrink-0">
                    <X size={11} style={{ color: color.text }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Match table */}
      {matchKeys.length > 0 ? (
        <div className="px-5 pb-4 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 500 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #CFE7DC" }}>
                  {["RESULTADO", "PAREJAS", "DÍA", "HORARIO", "LUGAR"].map(h => (
                    <th key={h} className="py-2 text-left pr-3 font-black text-[10px] uppercase"
                      style={{ color: "#9BB8AE", letterSpacing: "0.4px" }}>{h}</th>
                  ))}
                  <th className="py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {matchKeys.map(matchKey => {
                  const md = matchSchedules[matchKey] ?? {};
                  const result = md.result;
                  const isDone = result?.winnerRegistrationId || result?.walkover;
                  const score = result?.scoreText ?? (result?.walkover ? "Walkover" : "");
                  const dayStr = md.dayKey ? formatDayKey(md.dayKey) : "—";
                  const matchObj = makeMatchObj(zone, matchKey, regMap);
                  const pairDisplay = (() => {
                    const resolvedNumbers = getPlanningMatchPairNumbers(zone, regIds, matchKey);
                    const parts = resolvedNumbers.length === 2 ? resolvedNumbers : matchKey.split(" vs ");
                    return parts.map(p => {
                      const n = parseInt(p);
                      if (!isNaN(n)) {
                        const id = regIds[n - 1];
                        return id && regMap[id] ? getPairLabel(regMap[id], n - 1).split(" / ")[0] ?? `P${n}` : `P${n}`;
                      }
                      return p;
                    }).join(" vs ");
                  })();
                  const venueName = md.venueId ? venueNameById[md.venueId] : "";
                  const placeLabel = venueName
                    ? `${venueName}${md.courtIndex ? " · Cancha " + md.courtIndex : ""}`
                    : "—";
                  const matchConflict = getMatchConflict?.(zone, matchKey);

                  return (
                    <Fragment key={matchKey}>
                      <tr style={{ borderBottom: matchConflict?.hasConflict ? "none" : "1px solid #F0F7F4", background: matchConflict?.hasConflict ? "rgba(176,64,64,0.06)" : undefined }}>
                        <td className="py-2.5 pr-3">
                          {isDone ? (
                            <span className="text-[10px] font-black px-2 py-1 rounded-lg text-white whitespace-nowrap"
                              style={{ background: "#173A2E" }}>{score || "•"}</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
                              style={{ background: "#F0F7F4", color: "#9BB8AE" }}>vs</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 max-w-[140px]">
                          <span className="text-xs font-semibold truncate block" style={{ color: "#173A2E" }}>{pairDisplay}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <button onClick={() => onScheduleClick(matchKey)}
                            className="text-xs underline-offset-2 hover:underline" style={{ color: "#5F7D72" }}>
                            {dayStr}
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <button onClick={() => onScheduleClick(matchKey)}
                            className="text-xs underline-offset-2 hover:underline" style={{ color: "#5F7D72" }}>
                            {md.startTime || "—"}
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 truncate max-w-[90px]">
                          <button onClick={() => onScheduleClick(matchKey)}
                            className="text-xs underline-offset-2 hover:underline" style={{ color: "#5F7D72" }}>
                            {placeLabel}
                          </button>
                        </td>
                        <td className="py-2.5">
                          <button onClick={() => onResultClick(matchKey, matchObj)}
                            className="text-[10px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap"
                            style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}>
                            {isDone ? "Editar" : "Resultado"}
                          </button>
                        </td>
                      </tr>
                      {matchConflict?.hasConflict && (
                        <tr style={{ borderBottom: "1px solid #F0F7F4", background: "rgba(176,64,64,0.06)" }}>
                          <td colSpan={6} className="pb-2 px-0">
                            <div className="flex items-center gap-1.5 px-0">
                              <Info size={11} style={{ color: "#B24343", flexShrink: 0 }} />
                              <span className="text-[10px] font-bold" style={{ color: "#B24343" }}>{matchConflict.conflictReason}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="px-5 py-4 text-xs" style={{ color: "#9BB8AE" }}>Sin partidos programados.</p>
      )}
    </div>
  );
}

// ── Main FixtureTab ───────────────────────────────────────────────────────────
export default function FixtureTab({
  torneoId, fixtureSetup, registrations = [], showToast, tournament = {},
}: {
  torneoId: string; fixtureSetup: any; registrations?: any[];
  showToast: (msg: string, ok?: boolean) => void; tournament?: any;
}) {
  const zoneCategoryLabel: string =
    tournament?.compositionConfig?.label ?? tournament?.compositionLabel ?? "";
  const [sub, setSub] = useState<FixSub>("configurar");
  const [view, setView] = useState<"zonas" | "llaves">("zonas");
  const [zoom, setZoom] = useState(1);

  // ── Config state ────────────────────────────────────────────────────────────
  const mf = fixtureSetup?.matchFormat ?? {};
  const [zonesFormat, setZonesFormat] = useState<MatchFmt>(mf.zones ?? "super_tiebreak");
  const [bracketFormat, setBracketFormat] = useState<MatchFmt>(mf.bracket ?? "super_tiebreak");
  const [zonesSuperTB, setZonesSuperTB] = useState<number>(mf.zonesSuperTieBreakPoints ?? 10);
  const [bracketSuperTB, setBracketSuperTB] = useState<number>(mf.bracketSuperTieBreakPoints ?? 10);
  const [bracketFinalOverride, setBracketFinalOverride] = useState<BracketFinalOverride>(
    ["none", "final_only", "semifinal_and_final"].includes(mf.bracketFinalStagesOverride) ? mf.bracketFinalStagesOverride : "none"
  );
  const [rapidMode, setRapidMode] = useState<boolean>(!!mf.rapidModePoints);
  const [rapidPoints, setRapidPoints] = useState<number>(mf.rapidModePoints ?? 16);
  const [durationInput, setDurationInput] = useState<string>(
    formatMatchDurationValue(fixtureSetup?.matchDurationMinutes)
  );
  const duration = useMemo(() => parseMatchDurationToMinutes(durationInput), [durationInput]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState<"zonas" | "llaves" | null>("zonas");

  // ── Tipo de torneo (FAP/APA) ─────────────────────────────────────────────────
  const [ruleSet, setRuleSet] = useState<"fap" | "apa">(
    tournament?.tournamentRuleSet === "apa" || tournament?.ruleSet === "apa" ? "apa" : "fap"
  );
  const [ruleSetInfoVisible, setRuleSetInfoVisible] = useState(false);

  useEffect(() => {
    setRuleSet(tournament?.tournamentRuleSet === "apa" || tournament?.ruleSet === "apa" ? "apa" : "fap");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  useEffect(() => {
    const savedRuleSet = tournament?.tournamentRuleSet === "apa" || tournament?.ruleSet === "apa" ? "apa" : "fap";
    if (ruleSet === savedRuleSet || !torneoId) return;
    updateDoc(doc(db, "tournaments", torneoId), { tournamentRuleSet: ruleSet }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleSet]);

  // ── Zonas state ─────────────────────────────────────────────────────────────
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [savingZones, setSavingZones] = useState(false);
  // La app nunca expone un selector de "llave corta/larga" al organizador:
  // setSelectedPathType existe en TournamentFixtureScreen.js pero no se llama
  // desde ninguna UI, siempre queda en "strict". Se replica igual acá.
  const pathType: "strict" | "flex" = "strict";

  // ── Grilla de disponibilidad (filas = pareja, columnas = hora) ──────────────
  // Las categorias hermanas del evento se muestran SIEMPRE (solo lectura,
  // plegables), no como un "Ver tambien" opt-in: los datos salen de
  // siblingCategoriesData, poblado junto con siblingZonesForOccupancy mas
  // abajo (misma consulta, sin pedirle a Firestore los mismos documentos dos
  // veces). Igual que TournamentZonePlanningScreen.js de la app.
  const [siblingCategoriesData, setSiblingCategoriesData] = useState<Record<string, {
    categoryLabel: string; confirmedRegistrations: any[]; zones: any[];
  }>>({});
  const [collapsedSiblingIds, setCollapsedSiblingIds] = useState<Set<string>>(new Set());
  const [gridFilter, setGridFilter] = useState<GridFilter>({ type: "all" });

  // ── Horarios de cancha para zonas (zoneVenueSchedules) ──────────────────────
  // Cuando el torneo pertenece a un evento multi-categoria (creationBatchId),
  // esta disponibilidad es compartida por todas las categorias del evento y
  // vive en tournamentEvents/{batchId} en vez de en el fixtureSetup de este
  // torneo individual, para que el armado automatico unificado la vea igual
  // desde cualquiera de las categorias (misma logica que ya usa la app).
  const eventBatchId: string = tournament?.creationBatchId || "";
  const [organizerComplejos, setOrganizerComplejos] = useState<any[]>([]);
  const [eventVenueSchedulesRaw, setEventVenueSchedulesRaw] = useState<any[]>([]);
  const [expandedVenueScheduleIds, setExpandedVenueScheduleIds] = useState<string[]>([]);
  const [scheduleVenueDrafts, setScheduleVenueDrafts] = useState<Record<string, {
    selectedDayKey: string; from: string; to: string; selectedCourtIndices: number[] | null;
    useForZones: boolean; useForBracket: boolean;
  }>>({});
  const [savingSchedules, setSavingSchedules] = useState(false);

  useEffect(() => {
    if (!eventBatchId) {
      setEventVenueSchedulesRaw([]);
      return;
    }
    let active = true;
    getDoc(doc(db, "tournamentEvents", eventBatchId)).then((snap) => {
      if (!active) return;
      const data = snap.exists() ? snap.data() : null;
      setEventVenueSchedulesRaw(Array.isArray(data?.zoneVenueSchedules) ? data.zoneVenueSchedules : []);
    });
    return () => { active = false; };
  }, [eventBatchId]);

  useEffect(() => {
    if (!tournament?.organizerId) return;
    getDoc(doc(db, "users", tournament.organizerId)).then((snap) => {
      if (snap.exists()) setOrganizerComplejos(snap.data()?.complejos ?? []);
    });
  }, [tournament?.organizerId]);

  const tournamentVenueOptions = useMemo(() => {
    const rawVenues = [...toArray(tournament?.venues), ...toArray(tournament?.temporaryVenues)];
    return rawVenues
      .map((venue: any, index: number) => {
        const venueName = String(venue?.name ?? venue?.nombre ?? `Sede ${index + 1}`);
        const linkedComplex = organizerComplejos.find(
          (c: any) => String(c?.nombre ?? "").trim().toLowerCase() === venueName.trim().toLowerCase()
        );
        const totalCanchas = Number(venue?.totalCanchas || 0) || Number(linkedComplex?.totalCanchas || 0) || 1;
        return { id: String(venue?.id ?? venueName), name: venueName, totalCanchas };
      })
      .filter((v) => v.id && v.name);
  }, [tournament?.venues, tournament?.temporaryVenues, organizerComplejos]);

  const tournamentDayOptions = useMemo(
    () => buildTournamentDayOptions(tournament?.startDateMillis, tournament?.endDateMillis),
    [tournament?.startDateMillis, tournament?.endDateMillis]
  );

  const zoneVenueSchedules: ZoneVenueSchedule[] = useMemo(
    () => normalizeZoneVenueSchedules(
      eventBatchId ? eventVenueSchedulesRaw : fixtureSetup?.zoneVenueSchedules,
      tournamentDayOptions.map((d) => d.key),
      tournamentVenueOptions
    ),
    [eventBatchId, eventVenueSchedulesRaw, fixtureSetup?.zoneVenueSchedules, tournamentDayOptions, tournamentVenueOptions]
  );

  async function persistZoneVenueSchedules(nextSchedules: any[], successMessage?: string) {
    setSavingSchedules(true);
    try {
      if (eventBatchId) {
        await setDoc(
          doc(db, "tournamentEvents", eventBatchId),
          { organizerId: tournament?.organizerId ?? "", zoneVenueSchedules: nextSchedules, updatedAt: serverTimestamp() },
          { merge: true }
        );
        setEventVenueSchedulesRaw(nextSchedules);
      } else {
        const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
        fs.zoneVenueSchedules = nextSchedules;
        await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      }
      if (successMessage) showToast(successMessage);
    } catch {
      showToast("Error al guardar la disponibilidad de sedes", false);
    }
    setSavingSchedules(false);
  }

  const zoneSchedulesForMatches = useMemo(
    () => zoneVenueSchedules.filter((s) => s.useForZones),
    [zoneVenueSchedules]
  );

  const venueNameById = useMemo(() => {
    const map: Record<string, string> = {};
    tournamentVenueOptions.forEach((v) => { map[v.id] = v.name; });
    return map;
  }, [tournamentVenueOptions]);

  const matchDurationMinutes = Number(fixtureSetup?.matchDurationMinutes || 75);

  const registrationsById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of registrations) m.set(r.id, r);
    return m;
  }, [registrations]);

  const pairLabelsById = useMemo(() => {
    const map: Record<string, string> = {};
    registrations.forEach((r: any, i: number) => { map[r.id] = getShortPairLabel(r, i); });
    return map;
  }, [registrations]);

  // Zonas (con sus matchSchedules) de TODAS las categorias hermanas del
  // evento, solo para saber que canchas ya estan ocupadas por otras
  // categorias (una pareja nunca puede estar en 2 categorias del mismo
  // evento, asi que las hermanas nunca aportan ocupacion por pareja, solo por
  // cancha). Se refresca al entrar a la pestaña y despues de cada guardado de
  // horario, para no validar contra datos viejos.
  const [siblingZonesForOccupancy, setSiblingZonesForOccupancy] = useState<{
    tournamentId: string; categoryLabel: string; zones: any[];
  }[]>([]);

  async function fetchSiblingZonesForOccupancy() {
    const batchId = tournament?.creationBatchId || "";
    if (!batchId) {
      setSiblingZonesForOccupancy([]);
      setSiblingCategoriesData({});
      return;
    }
    try {
      const snap = await getDocs(query(collection(db, "tournaments"), where("creationBatchId", "==", batchId)));
      const siblings = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((t) => t.id !== torneoId);
      setSiblingZonesForOccupancy(
        siblings.map((t) => ({
          tournamentId: t.id,
          categoryLabel: t.compositionConfig?.label ?? t.compositionLabel ?? t.name ?? "",
          zones: toArray(t.fixtureSetup?.zonePlanning?.zones),
        }))
      );

      // Ademas de las zonas (para ocupacion de cancha), se traen las parejas
      // de cada hermana para mostrarlas en solo lectura en la grilla.
      const entries = await Promise.all(siblings.map(async (t) => {
        const regsSnap = await getDocs(collection(db, "tournaments", t.id, "registrations"));
        const regs = regsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const confirmed = regs
          .filter((r: any) => r.status !== "rejected" && r.withdrawalStatus !== "confirmed")
          .map((r: any, i: number) => ({ ...r, __colorIndex: i }));
        return [t.id, {
          categoryLabel: t.compositionConfig?.label ?? t.compositionLabel ?? t.name ?? "",
          confirmedRegistrations: confirmed,
          zones: toArray(t.fixtureSetup?.zonePlanning?.zones),
        }] as const;
      }));
      setSiblingCategoriesData(Object.fromEntries(entries));
    } catch {
      setSiblingZonesForOccupancy([]);
      setSiblingCategoriesData({});
    }
  }

  useEffect(() => {
    fetchSiblingZonesForOccupancy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.creationBatchId, torneoId]);

  // Para zonas de 4: en que horario terminan (si ya lo tienen) los partidos
  // de ida de esa zona, para que G vs G / P vs P no puedan empezar antes.
  function getZoneOpeningMatchesEndTimes(zone: any): { dayKey: string; endMinutes: number }[] {
    if (toArray(zone?.registrationIds).length !== 4) return [];
    return ["1 vs 2", "3 vs 4"]
      .map((openingMatchKey) => {
        const schedule = zone.matchSchedules?.[openingMatchKey];
        if (!schedule?.startTime || !schedule?.dayKey) return null;
        return { dayKey: schedule.dayKey, endMinutes: parseTimeToMinutes(schedule.startTime) + matchDurationMinutes };
      })
      .filter((entry): entry is { dayKey: string; endMinutes: number } => Boolean(entry));
  }

  function getVenueDraft(venueId: string) {
    return scheduleVenueDrafts[venueId] ?? {
      selectedDayKey: "", from: "09:00", to: "18:00", selectedCourtIndices: null, useForZones: false, useForBracket: false,
    };
  }

  function updateVenueDraft(venueId: string, partial: Partial<ReturnType<typeof getVenueDraft>>) {
    setScheduleVenueDrafts((current) => ({ ...current, [venueId]: { ...getVenueDraft(venueId), ...partial } }));
  }

  function toggleVenueScheduleExpanded(venueId: string) {
    setExpandedVenueScheduleIds((current) =>
      current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId]
    );
  }

  function toggleScheduleVenueUsage(venueId: string, field: "useForZones" | "useForBracket") {
    updateVenueDraft(venueId, { [field]: !getVenueDraft(venueId)[field] });
  }

  function selectScheduleVenueDay(venueId: string, dayKey: string) {
    updateVenueDraft(venueId, { selectedDayKey: dayKey });
  }

  function toggleCourtSelection(venueId: string, courtIndex: number, totalCanchas: number) {
    const draft = getVenueDraft(venueId);
    const allIndices = Array.from({ length: totalCanchas }, (_, i) => i + 1);
    const currentSelected = draft.selectedCourtIndices ?? allIndices;
    const next = currentSelected.includes(courtIndex)
      ? currentSelected.filter((i) => i !== courtIndex)
      : [...currentSelected, courtIndex].sort((a, b) => a - b);
    if (next.length === 0) return;
    updateVenueDraft(venueId, { selectedCourtIndices: next });
  }

  async function handleAddZoneVenueSchedule(venueId: string) {
    const venueDraft = getVenueDraft(venueId);
    const venue = tournamentVenueOptions.find((v) => v.id === venueId);
    const maxCourts = Math.max(venue?.totalCanchas || 0, 1);
    const allIndices = Array.from({ length: maxCourts }, (_, i) => i + 1);
    const draftSelectedIndices = venueDraft.selectedCourtIndices?.length ? venueDraft.selectedCourtIndices : allIndices;

    if (!venueDraft.useForZones && !venueDraft.useForBracket) {
      showToast("Indica si esta sede se usara en zonas, en llaves o en ambas", false);
      return;
    }
    if (!venue || !venueDraft.selectedDayKey || !venueDraft.from || !venueDraft.to) {
      showToast("Selecciona el dia y completa el horario desde y hasta", false);
      return;
    }
    if (parseTimeToMinutes(venueDraft.to) <= parseTimeToMinutes(venueDraft.from)) {
      showToast("El horario de fin debe ser posterior al de inicio", false);
      return;
    }

    const newEntry = {
      id: `zone-schedule-${Date.now()}-${venueId}`,
      venueId: venue.id,
      venueName: venue.name,
      dayKey: venueDraft.selectedDayKey,
      from: venueDraft.from,
      to: venueDraft.to,
      courts: draftSelectedIndices.length,
      selectedCourtIndices: draftSelectedIndices,
      useForZones: Boolean(venueDraft.useForZones),
      useForBracket: Boolean(venueDraft.useForBracket),
    };
    // Reemplazar entradas existentes de la misma sede+dia para no acumular duplicados
    const nextSchedules = [
      ...zoneVenueSchedules.filter((entry) => !(entry.venueId === venueId && entry.dayKey === newEntry.dayKey)),
      newEntry,
    ];

    await persistZoneVenueSchedules(nextSchedules, "Franja horaria guardada");
  }

  async function handleRemoveZoneVenueSchedule(scheduleId: string) {
    const nextSchedules = zoneVenueSchedules.filter((entry) => entry.id !== scheduleId);
    await persistZoneVenueSchedules(nextSchedules);
  }

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [zoneResultModal, setZoneResultModal] = useState<{ zoneId: string; matchKey: string; match: any } | null>(null);
  const [standingsModal, setStandingsModal] = useState<any>(null);
  const [bracketResultModal, setBracketResultModal] = useState<{ match: any; ri: number; mi: number } | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ zoneId: string; matchKey: string } | null>(null);
  const [bracketScheduleModal, setBracketScheduleModal] = useState<{ ri: number; mi: number } | null>(null);
  const [savingAutoSchedule, setSavingAutoSchedule] = useState(false);

  // ── Computed ────────────────────────────────────────────────────────────────
  const zones: any[] = toArray(fixtureSetup?.zonePlanning?.zones);
  const bracketRounds: any[][] = normalizeBracketRounds(fixtureSetup?.bracketPreview);
  const hasBracket = bracketRounds.length > 0;

  // Partidos ya agendados (propia categoria + hermanas del evento) para la
  // ocupacion de cancha/pareja que usa el modulo de validacion compartido.
  // Las hermanas solo pueden pisar cancha, nunca pareja (una pareja no puede
  // estar inscripta en 2 categorias del mismo evento).
  const scheduledMatchesForOccupancy: ScheduledMatch[] = useMemo(() => {
    const ownMatches: ScheduledMatch[] = [];
    zones.forEach((zone: any) => {
      Object.entries(zone.matchSchedules ?? {}).forEach(([matchKey, schedule]: [string, any]) => {
        if (!schedule?.startTime || !schedule?.dayKey) return;
        ownMatches.push({
          tournamentId: torneoId,
          zoneId: zone.id,
          matchKey,
          categoryLabel: zoneCategoryLabel,
          zoneLabel: zone.label,
          dayKey: schedule.dayKey,
          startMinutes: parseTimeToMinutes(schedule.startTime),
          venueId: schedule.venueId || "",
          courtIndex: Number(schedule.courtIndex || 0),
          participantIds: getZoneMatchParticipantIds(zone, matchKey),
        });
      });
    });

    const siblingMatches: ScheduledMatch[] = [];
    siblingZonesForOccupancy.forEach((sibling) => {
      sibling.zones.forEach((zone: any) => {
        Object.entries(zone.matchSchedules ?? {}).forEach(([matchKey, schedule]: [string, any]) => {
          if (!schedule?.startTime || !schedule?.dayKey) return;
          siblingMatches.push({
            tournamentId: sibling.tournamentId,
            zoneId: zone.id,
            matchKey,
            categoryLabel: sibling.categoryLabel,
            zoneLabel: zone.label,
            dayKey: schedule.dayKey,
            startMinutes: parseTimeToMinutes(schedule.startTime),
            venueId: schedule.venueId || "",
            courtIndex: Number(schedule.courtIndex || 0),
            participantIds: [],
          });
        });
      });
    });

    return [...ownMatches, ...siblingMatches];
  }, [zones, zoneCategoryLabel, torneoId, siblingZonesForOccupancy]);

  const scheduleOccupancy: ScheduleOccupancy = useMemo(
    () => buildScheduleOccupancy(scheduledMatchesForOccupancy, matchDurationMinutes),
    [scheduledMatchesForOccupancy, matchDurationMinutes]
  );

  // Conflicto EN VIVO de un partido YA guardado (para marcarlo en rojo en la
  // tabla de cruces), recalculado contra el resto de la ocupacion (propia +
  // hermanas) en cada render. No bloquea nada; solo informa.
  function getMatchConflict(zone: any, matchKey: string): { hasConflict: boolean; conflictReason: string } {
    const schedule = zone?.matchSchedules?.[matchKey] ?? {};
    if (!schedule.startTime || !schedule.dayKey) {
      return { hasConflict: false, conflictReason: "" };
    }

    const participantIds = getZoneMatchParticipantIds(zone, matchKey);
    const dependsOn = ["G vs G", "P vs P"].includes(matchKey) ? getZoneOpeningMatchesEndTimes(zone) : [];

    const result = validateMatchSlot({
      dayKey: schedule.dayKey,
      startMinutes: parseTimeToMinutes(schedule.startTime),
      venueId: schedule.venueId || "",
      courtIndex: Number(schedule.courtIndex || 0),
      participantIds,
      excludeKey: { tournamentId: torneoId, zoneId: zone.id, matchKey },
      occupancy: scheduleOccupancy,
      matchDurationMinutes,
      restMinutes: DEFAULT_REST_MINUTES,
      dependsOn,
      pairLabelsById,
    });

    return { hasConflict: result.hasConflict, conflictReason: result.conflictReason };
  }

  function countConflictedMatches(): number {
    let count = 0;
    zones.forEach((zone: any) => {
      Object.keys(zone.matchSchedules ?? {}).forEach((matchKey) => {
        if (getMatchConflict(zone, matchKey).hasConflict) count += 1;
      });
    });
    return count;
  }

  const regMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of registrations) m[r.id] = r;
    return m;
  }, [registrations]);

  const assignedRegIds = useMemo(() => {
    const s = new Set<string>();
    for (const z of zones) for (const id of toArray(z.registrationIds)) s.add(id);
    return s;
  }, [zones]);

  const unassignedRegs = useMemo(
    () => registrations.filter(r => !assignedRegIds.has(r.id) && r.status !== "rejected" && r.withdrawalStatus !== "confirmed"),
    [registrations, assignedRegIds]
  );

  // Bloques por categoria para la grilla (activa + TODAS las hermanas, en
  // solo lectura), ordenados por el numero de la categoria (5ta antes que
  // 7ma antes que 8va). Las hermanas no son opcionales: se muestran siempre
  // que existan, plegables (igual que TournamentZonePlanningScreen.js).
  const allCategoryBlocks: CategoryBlock[] = useMemo(() => {
    const activeZones = zones;
    const activeConfirmed = registrations
      .filter((r: any) => r.status !== "rejected" && r.withdrawalStatus !== "confirmed")
      .map((r: any, i: number) => ({ ...r, __colorIndex: i }));
    const activeBlock: CategoryBlock = {
      tournamentId: torneoId,
      categoryLabel: zoneCategoryLabel,
      isActive: true,
      confirmedRegistrations: sortRegistrationsUnassignedFirst(activeConfirmed, assignedRegIds, buildZoneLetterMapForZones(activeZones)),
      zones: activeZones,
      assignedIds: assignedRegIds,
    };

    const siblingBlocks: CategoryBlock[] = Object.entries(siblingCategoriesData).map(([id, data]) => {
      const siblingZones = data.zones;
      const siblingAssignedIds = new Set<string>(siblingZones.flatMap((z: any) => toArray(z.registrationIds)));
      return {
        tournamentId: id,
        categoryLabel: data.categoryLabel,
        isActive: false,
        confirmedRegistrations: sortRegistrationsUnassignedFirst(data.confirmedRegistrations, siblingAssignedIds, buildZoneLetterMapForZones(siblingZones)),
        zones: siblingZones,
        assignedIds: siblingAssignedIds,
      };
    });

    return [activeBlock, ...siblingBlocks].sort(
      (a, b) => extractCategoryOrderNumber(a.categoryLabel) - extractCategoryOrderNumber(b.categoryLabel)
    );
  }, [torneoId, zoneCategoryLabel, registrations, zones, assignedRegIds, siblingCategoriesData]);

  // Columnas de hora: una por cada dia del torneo, lado a lado dentro del
  // mismo scroll horizontal (a diferencia de la app, que muestra un dia a la
  // vez por el espacio reducido de pantalla).
  const dayBlocks = useMemo(
    () => tournamentDayOptions.map((day) => ({
      key: day.key,
      label: formatDayKey(day.key),
      hourColumns: getHourColumnsForDay(zoneSchedulesForMatches, day.key),
    })),
    [tournamentDayOptions, zoneSchedulesForMatches]
  );

  const zoneLetterMapsByBlock = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    allCategoryBlocks.forEach((block) => map.set(block.tournamentId, buildZoneLetterMapForZones(block.zones)));
    return map;
  }, [allCategoryBlocks]);

  const categoryFilterOptions = useMemo(
    () => allCategoryBlocks.map((block, index) => ({
      tournamentId: block.tournamentId,
      label: block.categoryLabel || (block.isActive ? "Esta categoria" : "Categoria"),
      count: block.confirmedRegistrations.length,
      colorIndex: index,
    })),
    [allCategoryBlocks]
  );

  const gridRows: GridRow[] = useMemo(() => {
    const rows: GridRow[] = [];

    allCategoryBlocks.forEach((block, blockIndex) => {
      if (gridFilter.type === "category" && block.tournamentId !== gridFilter.tournamentId) return;

      const isCollapsed = !block.isActive && collapsedSiblingIds.has(block.tournamentId);
      rows.push({ type: "category-header", key: `header:${block.tournamentId}`, block, colorIndex: blockIndex, isCollapsed });

      if (isCollapsed) return;

      const zoneLetterMap = zoneLetterMapsByBlock.get(block.tournamentId) || new Map();

      block.confirmedRegistrations
        .filter((registration: any) => {
          if (gridFilter.type === "problems") return getTotalLoadedHours(registration) < 4;
          if (gridFilter.type === "unassigned") return !block.assignedIds.has(registration.id);
          return true;
        })
        .forEach((registration: any) => {
          rows.push({
            type: "pair", key: `pair:${block.tournamentId}:${registration.id}`, block, colorIndex: blockIndex,
            registration, zoneLetter: zoneLetterMap.get(String(registration.id)) || "",
          });
        });

      rows.push({ type: "coinciden", key: `coinciden:${block.tournamentId}`, block, colorIndex: blockIndex });
    });

    if (rows.length) rows.push({ type: "canchas-ocupadas", key: "canchas-ocupadas" });

    return rows;
  }, [allCategoryBlocks, gridFilter, collapsedSiblingIds, zoneLetterMapsByBlock]);

  function toggleSiblingCollapsed(siblingTournamentId: string) {
    setCollapsedSiblingIds((current) => {
      const next = new Set(current);
      if (next.has(siblingTournamentId)) next.delete(siblingTournamentId); else next.add(siblingTournamentId);
      return next;
    });
  }

  function countPairsAvailableAtHour(block: CategoryBlock, dayKey: string, hourMinutes: number): number {
    return block.confirmedRegistrations.filter((registration: any) => isSlotAvailable(registration, dayKey, hourMinutes)).length;
  }

  function getCourtsAvailableAtHour(dayKey: string, hourMinutes: number): number {
    let total = 0;
    zoneSchedulesForMatches
      .filter((schedule) => schedule.dayKey === dayKey)
      .forEach((schedule) => {
        const from = parseTimeToMinutes(schedule.from);
        const to = parseTimeToMinutes(schedule.to);
        if (hourMinutes >= from && hourMinutes < to) {
          total += Array.isArray(schedule.selectedCourtIndices) && schedule.selectedCourtIndices.length
            ? schedule.selectedCourtIndices.length
            : Number(schedule.courts || 1);
        }
      });
    return total;
  }

  function countMatchesAtHour(dayKey: string, hourMinutes: number): number {
    return scheduledMatchesForOccupancy.filter(
      (match) => match.dayKey === dayKey && match.startMinutes < hourMinutes + 60 && match.startMinutes + matchDurationMinutes > hourMinutes
    ).length;
  }

  async function handleToggleAvailabilityCell(registration: any, dayKey: string, hourMinutes: number) {
    const wasAvailable = isSlotAvailable(registration, dayKey, hourMinutes);
    const hasAssignedMatchHere = (scheduleOccupancy.byPair.get(registration.id) || []).some(
      (entry) => entry.dayKey === dayKey && hourMinutes < entry.endMinutes && hourMinutes + 60 > entry.startMinutes
    );

    const applyToggle = async () => {
      const nextAvailability = buildAvailabilityAfterCellToggle(registration, dayKey, hourMinutes, tournamentDayOptions);
      try {
        await updateDoc(doc(db, "tournaments", torneoId, "registrations", registration.id), { availability: nextAvailability });
      } catch {
        showToast("No pudimos guardar la disponibilidad, intenta nuevamente", false);
      }
    };

    if (wasAvailable && hasAssignedMatchHere) {
      const confirmed = window.confirm(
        `${getShortPairLabel(registration, registration.__colorIndex)} tiene un partido asignado el ${formatDayKey(dayKey)} ${formatMinutesToTime(hourMinutes)}. ¿Quitar igual esta disponibilidad?`
      );
      if (!confirmed) return;
    }

    await applyToggle();
  }

  function togglePairSelection(registrationId: string) {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      if (next.has(registrationId)) next.delete(registrationId); else next.add(registrationId);
      return next;
    });
  }

  function handleSetSub(s: FixSub) {
    setSub(s);
  }

  // ── Save helpers ────────────────────────────────────────────────────────────
  async function saveConfig() {
    setSavingConfig(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.matchFormat) fs.matchFormat = {};
      fs.matchFormat.zones = zonesFormat;
      fs.matchFormat.bracket = bracketFormat;
      fs.matchFormat.zonesSuperTieBreakPoints = zonesSuperTB;
      fs.matchFormat.bracketSuperTieBreakPoints = bracketSuperTB;
      fs.matchFormat.bracketFinalStagesOverride = bracketFinalOverride;
      fs.matchFormat.rapidModePoints = rapidMode ? rapidPoints : null;
      fs.matchDurationMinutes = duration;
      fs.lastViewedSection = "configuration";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Configuración guardada");
    } catch {
      showToast("Error al guardar", false);
    }
    setSavingConfig(false);
  }

  async function handleArmarZona() {
    const regIdList = Array.from(selectedPairIds);
    const alreadyAssigned = regIdList.filter((id) => assignedRegIds.has(id));
    if (alreadyAssigned.length) {
      showToast("Una de las parejas seleccionadas ya esta en una zona. Para usarla en otra, primero agregala a una zona existente o quitala de la actual.", false);
      return;
    }
    if (regIdList.length < 2 || regIdList.length > 4) {
      showToast("Seleccioná 2, 3 o 4 parejas para armar una zona.", false);
      return;
    }
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.zonePlanning) fs.zonePlanning = {};
      const currentZones = toArray(fs.zonePlanning.zones);
      const matchRows = getMatchRows(regIdList.length);
      const matchSchedules: Record<string, any> = {};
      for (const row of matchRows) matchSchedules[row] = {};
      currentZones.push({ id: `zone_${Date.now()}`, label: zoneAutoLabel(currentZones.length), registrationIds: regIdList, matchSchedules });
      fs.zonePlanning.zones = currentZones;
      fs.zonePlanning.status = fs.zonePlanning.status ?? "draft";
      fs.lastViewedSection = "newzones";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      setSelectedPairIds(new Set());
      showToast("Zona creada");
    } catch {
      showToast("Error al crear la zona", false);
    }
    setSavingZones(false);
  }

  async function handleAddPairToExistingZone(zoneId: string) {
    const selectedId = Array.from(selectedPairIds)[0];
    if (!selectedId) return;
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const currentZones = toArray(fs.zonePlanning?.zones);
      const targetZone = currentZones.find((z: any) => z.id === zoneId);
      if (!targetZone) { setSavingZones(false); return; }
      const targetIds = toArray(targetZone.registrationIds);
      if (targetIds.includes(selectedId)) {
        showToast("Esa pareja ya esta en esta zona.", false);
        setSavingZones(false);
        return;
      }
      if (targetIds.length >= 4) {
        showToast("Cada zona puede tener hasta 4 parejas.", false);
        setSavingZones(false);
        return;
      }
      fs.zonePlanning.zones = currentZones.map((z: any) => ({
        ...z,
        registrationIds: z.id === zoneId
          ? [...toArray(z.registrationIds).filter((id: string) => id !== selectedId), selectedId]
          : toArray(z.registrationIds).filter((id: string) => id !== selectedId),
      }));
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      setSelectedPairIds(new Set());
      showToast("Pareja agregada a la zona.");
    } catch {
      showToast("Error al agregar la pareja a la zona", false);
    }
    setSavingZones(false);
  }

  async function handleRemovePairFromZone(zoneId: string, regId: string) {
    const zone = zones.find((z: any) => z.id === zoneId);
    const zoneHasResult = Object.values(zone?.matchSchedules ?? {}).some(
      (m: any) => m?.result?.winnerRegistrationId || m?.result?.walkover
    );
    if (zoneHasResult) {
      showToast("Esta zona ya tiene resultados cargados. Elimina el resultado antes de quitar parejas.", false);
      return;
    }
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const currentZones = toArray(fs.zonePlanning?.zones);
      fs.zonePlanning.zones = currentZones.map((z: any) =>
        z.id === zoneId ? { ...z, registrationIds: toArray(z.registrationIds).filter((id: string) => id !== regId) } : z
      );
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Pareja quitada de la zona.");
    } catch {
      showToast("Error al quitar la pareja de la zona", false);
    }
    setSavingZones(false);
  }

  const confirmedRegistrations = useMemo(
    () => registrations.filter((r) => isRegistrationConfirmed(r, tournament)),
    [registrations, tournament]
  );

  const fixtureRecommendation = useMemo(
    () => resolveFixtureRecommendation(confirmedRegistrations.length, pathType, ruleSet),
    [confirmedRegistrations.length, pathType, ruleSet]
  );

  async function handleGenerarZonasAutomatico() {
    if (confirmedRegistrations.length < 6) {
      showToast("Necesitás al menos 6 parejas confirmadas", false);
      return;
    }
    if (zones.length > 0 && !window.confirm("Ya hay zonas armadas. ¿Las reemplazamos por el armado automático?")) {
      return;
    }
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      fs.zonePlanning = buildAutomaticZonePlanning(confirmedRegistrations, fixtureRecommendation);
      fs.lastViewedSection = "newzones";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Zonas generadas automáticamente");
      await fetchSiblingZonesForOccupancy();
    } catch {
      showToast("Error al generar las zonas", false);
    }
    setSavingZones(false);
  }

  async function confirmZones() {
    const unassignedCount = unassignedRegs.length;
    const conflictCount = countConflictedMatches();
    const conflictWarning = conflictCount > 0
      ? `Hay ${conflictCount} partido${conflictCount === 1 ? "" : "s"} con conflicto de horario. ¿Guardar igual?\n\n`
      : "";
    const warning = unassignedCount > 0
      ? `\n\nTodavia quedan ${unassignedCount} pareja${unassignedCount === 1 ? "" : "s"} sin zona asignada.`
      : "";
    if (!window.confirm(`${conflictWarning}El fixture del torneo se va a actualizar con este armado de zonas.${warning}\n\n¿Confirmar?`)) {
      return;
    }
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.zonePlanning) fs.zonePlanning = {};
      fs.zonePlanning.status = "confirmed";
      fs.lastViewedSection = "newzones";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Armado confirmado");
      await fetchSiblingZonesForOccupancy();
    } catch {
      showToast("Error al confirmar", false);
    }
    setSavingZones(false);
  }

  async function saveDraftZones() {
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.zonePlanning) fs.zonePlanning = {};
      fs.zonePlanning.status = fs.zonePlanning.status === "confirmed" ? "confirmed" : "draft";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Borrador guardado");
      await fetchSiblingZonesForOccupancy();
    } catch {
      showToast("Error al guardar el borrador", false);
    }
    setSavingZones(false);
  }

  async function saveZoneMatchResult(zoneId: string, matchKey: string, result: any) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const zoneList = toArray(fs.zonePlanning?.zones);
      const zone = zoneList.find((z: any) => z.id === zoneId);
      if (zone) {
        if (!zone.matchSchedules) zone.matchSchedules = {};
        if (!zone.matchSchedules[matchKey]) zone.matchSchedules[matchKey] = {};
        zone.matchSchedules[matchKey].result = result;
        zone.matchSchedules[matchKey].resultText = result.scoreText;
        fs.zonePlanning.zones = zoneList;

        // Si ya existe una llave, se resincroniza con el resultado nuevo
        // (igual que hace la app automaticamente al cambiar un resultado de zona).
        if (fs.bracketPreview) {
          const pairsByZoneId = new Map<string, BracketPair[]>(
            zoneList.map((z: any) => [
              z.id,
              toArray(z.registrationIds).map((id: string, idx: number) => ({
                id, label: regMap[id] ? getPairLabel(regMap[id], idx) : `Pareja ${idx + 1}`,
              })),
            ])
          );
          const synced = syncBracketWithZones(fs.bracketPreview, zoneList as ZonePlanningZone[], pairsByZoneId, ruleSet);
          if (synced) fs.bracketPreview = synced;
        }

        await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
        showToast("Resultado guardado");
      }
    } catch {
      showToast("Error al guardar el resultado", false);
    }
  }

  // Devuelve si efectivamente guardo (true) o si el organizador cancelo la
  // confirmacion de conflicto, no encontro la zona, o fallo el guardado
  // (false en los tres casos). El llamador SIEMPRE debe revisar este valor
  // antes de cerrar cualquier modal/selector: cerrar igual aunque haya
  // devuelto false hace parecer que "no se puede asignar nada" cuando en
  // realidad el organizador solo cancelo el cartel de conflicto y deberia
  // poder elegir otro horario sin que el selector se cierre solo.
  async function saveZoneMatchSchedule(zoneId: string, matchKey: string, schedule: { dayKey: string; startTime: string; venueId: string; courtIndex: number } | null): Promise<boolean> {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const zoneList = toArray(fs.zonePlanning?.zones);
      const zone = zoneList.find((z: any) => z.id === zoneId);
      if (!zone) return false;

      // Conflicto (cancha contra categorias hermanas, pareja superpuesta,
      // dependencia G vs G/P vs P, o fuera de disponibilidad cargada): nunca
      // bloquea, se confirma con el organizador antes de guardar igual.
      if (schedule?.dayKey && schedule?.startTime) {
        const participantIds = getZoneMatchParticipantIds(zone, matchKey);
        const startMinutes = parseTimeToMinutes(schedule.startTime);
        const dependsOn = ["G vs G", "P vs P"].includes(matchKey) ? getZoneOpeningMatchesEndTimes(zone) : [];
        const availabilityWarning = buildAvailabilityWarningForParticipants(participantIds, registrationsById, schedule.dayKey, startMinutes);

        const result = validateMatchSlot({
          dayKey: schedule.dayKey,
          startMinutes,
          venueId: schedule.venueId,
          courtIndex: schedule.courtIndex,
          participantIds,
          excludeKey: { tournamentId: torneoId, zoneId, matchKey },
          occupancy: scheduleOccupancy,
          matchDurationMinutes,
          restMinutes: DEFAULT_REST_MINUTES,
          dependsOn,
          pairLabelsById,
          availabilityWarning,
        });

        const reason = result.conflictReason || result.availabilityWarning;
        if (reason && !window.confirm(`${reason}. ¿Asignar igual?`)) {
          return false;
        }
      }

      if (!zone.matchSchedules) zone.matchSchedules = {};
      const existing = zone.matchSchedules[matchKey] ?? {};
      zone.matchSchedules[matchKey] = schedule
        ? { ...existing, ...schedule }
        : { ...existing, dayKey: "", startTime: "", venueId: "", courtIndex: 0 };
      fs.zonePlanning.zones = zoneList;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(schedule ? "Horario asignado" : "Horario borrado");
      await fetchSiblingZonesForOccupancy();
      return true;
    } catch {
      showToast("Error al guardar el horario", false);
      return false;
    }
  }

  async function handleAutoScheduleAll() {
    if (!zoneSchedulesForMatches.length) {
      showToast("Primero cargá horarios de cancha en Preferencias", false);
      return;
    }
    setSavingAutoSchedule(true);
    try {
      if (eventBatchId) {
        // Evento multi-categoria: reparte los partidos de TODAS las categorias
        // hermanas que ya tengan zonas creadas, en un solo pase contra el pool
        // compartido del evento, para que no se pisen entre categorias.
        const siblingsSnap = await getDocs(query(collection(db, "tournaments"), where("creationBatchId", "==", eventBatchId)));
        const siblings = siblingsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

        const combinedRegistrationsById = new Map<string, any>();
        const combinedZones: (ZonePlanningZone & { __tournamentId: string })[] = [];
        const siblingFixtureSetups: Record<string, any> = {};

        for (const sibling of siblings) {
          const siblingZones = toArray(sibling.fixtureSetup?.zonePlanning?.zones);
          if (!siblingZones.length) continue;

          const regsSnap = await getDocs(collection(db, "tournaments", sibling.id, "registrations"));
          const siblingConfirmed = regsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((r: any) => isRegistrationConfirmed(r, sibling));
          siblingConfirmed.forEach((r: any) => combinedRegistrationsById.set(r.id, r));

          siblingZones.forEach((zone: any) => combinedZones.push({ ...zone, __tournamentId: sibling.id }));
          siblingFixtureSetups[sibling.id] = sibling.fixtureSetup ?? {};
        }

        if (!combinedZones.length) {
          showToast("Ninguna categoria del evento tiene zonas creadas todavia", false);
          setSavingAutoSchedule(false);
          return;
        }

        const { zones: scheduledZones, unassignedCount } = buildAutoMatchSchedulesAcrossZones(
          combinedZones, combinedRegistrationsById, zoneSchedulesForMatches, matchDurationMinutes
        );

        const scheduledByTournament = new Map<string, any[]>();
        scheduledZones.forEach(({ __tournamentId, ...zone }) => {
          const list = scheduledByTournament.get(__tournamentId) ?? [];
          list.push(zone);
          scheduledByTournament.set(__tournamentId, list);
        });

        for (const [tid, zonesList] of scheduledByTournament) {
          const fs = JSON.parse(JSON.stringify(siblingFixtureSetups[tid] ?? {}));
          fs.zonePlanning = { ...(fs.zonePlanning ?? {}), zones: zonesList };
          await updateDoc(doc(db, "tournaments", tid), { fixtureSetup: fs });
        }

        showToast(
          unassignedCount > 0
            ? `Asignado. ${unassignedCount} partido(s) sin horario disponible.`
            : "Horarios asignados entre todas las categorias del evento, sin pisarse"
        );
      } else {
        const { zones: scheduledZones, unassignedCount } = buildAutoMatchSchedules(
          zones as ZonePlanningZone[], registrationsById, zoneSchedulesForMatches, matchDurationMinutes
        );
        const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
        fs.zonePlanning = { ...(fs.zonePlanning ?? {}), zones: scheduledZones };
        await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
        showToast(unassignedCount > 0 ? `Asignado. ${unassignedCount} partido(s) sin horario disponible.` : "Horarios asignados");
      }
      await fetchSiblingZonesForOccupancy();
    } catch {
      showToast("Error al asignar horarios", false);
    }
    setSavingAutoSchedule(false);
  }

  async function handleGenerateBracket() {
    if (!zones.length) {
      showToast("Primero armá las zonas", false);
      return;
    }
    setSavingAutoSchedule(true);
    try {
      const pairsByZoneId = new Map<string, BracketPair[]>(
        zones.map((zone: any) => [
          zone.id,
          toArray(zone.registrationIds).map((id: string, idx: number) => ({
            id, label: regMap[id] ? getPairLabel(regMap[id], idx) : `Pareja ${idx + 1}`,
          })),
        ])
      );
      const preview = buildBracketPreview(zones as ZonePlanningZone[], pairsByZoneId, ruleSet);
      if (!preview) {
        showToast("No hay un molde de llave para esta cantidad de parejas (se necesitan entre 6 y 32)", false);
        return;
      }
      const progressed = applyBracketProgressions(preview);
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      fs.bracketPreview = progressed;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(hasBracket ? "Llave regenerada" : "Llave generada");
    } catch {
      showToast("Error al generar la llave", false);
    }
    setSavingAutoSchedule(false);
  }

  const zoneSchedulesForBracket = useMemo(() => zoneVenueSchedules.filter((s) => s.useForBracket), [zoneVenueSchedules]);

  async function saveBracketMatchSchedule(ri: number, mi: number, schedule: { dayKey: string; startTime: string; venueName: string; courtIndex: number } | null) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const rounds = fs.bracketPreview?.rounds ?? [];
      const match = rounds[ri]?.matches?.[mi];
      if (!match) return;
      if (schedule) {
        match.scheduledDayKey = schedule.dayKey;
        match.scheduledTime = schedule.startTime;
        match.courtLabel = `${schedule.venueName} · Cancha ${schedule.courtIndex}`;
        const dayLabel = tournamentDayOptions.find((d) => d.key === schedule.dayKey)?.shortLabel || schedule.dayKey;
        match.scheduleLabel = `${dayLabel} · ${schedule.startTime} hs`;
      } else {
        match.scheduledDayKey = "";
        match.scheduledTime = "";
        match.courtLabel = "Cancha pendiente";
        match.scheduleLabel = "Horario pendiente";
      }
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(schedule ? "Horario asignado" : "Horario borrado");
    } catch {
      showToast("Error al guardar el horario", false);
    }
  }

  async function handleAutoScheduleBracket() {
    if (!fixtureSetup?.bracketPreview) return;
    if (!zoneSchedulesForBracket.length) {
      showToast("Primero cargá horarios de cancha marcados para llaves en Preferencias", false);
      return;
    }
    setSavingAutoSchedule(true);
    try {
      const { nextBracketPreview, unassignedCount } = assignSchedulesToBracketMatches(
        fixtureSetup.bracketPreview, zoneSchedulesForBracket, tournamentDayOptions, matchDurationMinutes
      );
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      fs.bracketPreview = nextBracketPreview;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(unassignedCount > 0 ? `Asignado. ${unassignedCount} partido(s) sin horario disponible.` : "Horarios asignados");
    } catch {
      showToast("Error al asignar horarios", false);
    }
    setSavingAutoSchedule(false);
  }

  async function saveBracketMatchResult(ri: number, mi: number, result: any, resultLabel: string) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const rounds = fs.bracketPreview?.rounds ?? (Array.isArray(fs.bracketPreview) ? fs.bracketPreview : []);
      const roundEntry = rounds[ri];
      const matches = Array.isArray(roundEntry) ? roundEntry : roundEntry?.matches;
      if (matches && matches[mi]) {
        matches[mi].result = result;
        matches[mi].resultLabel = resultLabel;
      }
      if (fs.bracketPreview?.rounds) fs.bracketPreview.rounds = rounds;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Resultado guardado");

      if (ri === rounds.length - 1) {
        upsertTournamentRankingEntry({ ...tournament, fixtureSetup: fs }, registrations).catch(() => null);
      }
    } catch {
      showToast("Error al guardar el resultado", false);
    }
  }

  const savedZonesFormat: MatchFmt = fixtureSetup?.matchFormat?.zones ?? "super_tiebreak";
  const savedBracketFormat: MatchFmt = fixtureSetup?.matchFormat?.bracket ?? "super_tiebreak";
  const savedBracketFinalOverride: BracketFinalOverride =
    ["none", "final_only", "semifinal_and_final"].includes(fixtureSetup?.matchFormat?.bracketFinalStagesOverride)
      ? fixtureSetup.matchFormat.bracketFinalStagesOverride
      : "none";
  const bracketLayout = hasBracket ? buildBracketLayout(bracketRounds) : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Sub-tab navigation: Preferencias en su propia linea, igual que en la app */}
      <div className="flex gap-1 mb-2 p-1 rounded-2xl" style={{ background: "#F2FAF5", border: "1px solid #D5EADF" }}>
        <button onClick={() => handleSetSub("configurar")}
          className="flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all"
          style={sub === "configurar" ? { background: "#086847", color: "#FFFFFF" } : { background: "transparent", color: "#086847" }}>
          PREFERENCIAS
        </button>
      </div>
      <div className="flex gap-1 mb-6 p-1 rounded-2xl" style={{ background: "#F2FAF5", border: "1px solid #D5EADF" }}>
        {([
          { id: "automatico", label: "ARMADO AUTOMATICO" },
          { id: "manual", label: "ARMADO MANUAL - EDITAR" },
        ] as { id: FixSub; label: string }[]).map(s => (
          <button key={s.id} onClick={() => handleSetSub(s.id)}
            className="flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all"
            style={sub === s.id ? { background: "#086847", color: "#FFFFFF" } : { background: "transparent", color: "#086847" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── CONFIGURAR ─────────────────────────────────────────────────────── */}
      {sub === "configurar" && (
        <div className="max-w-lg flex flex-col gap-4">
          {/* Parejas confirmadas */}
          <div className="rounded-[20px] border p-5 flex items-center justify-between" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <span className="font-black text-sm" style={{ color: "#173A2E" }}>Parejas confirmadas</span>
            <span className="font-black text-lg" style={{ color: "#086847" }}>{confirmedRegistrations.length}</span>
          </div>

          {/* Tipo de torneo */}
          <div className="rounded-[20px] border p-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-sm" style={{ color: "#173A2E" }}>TIPO DE TORNEO</span>
              <button onClick={() => setRuleSetInfoVisible(true)} className="p-1">
                <Info size={18} style={{ color: "#086847" }} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {TOURNAMENT_RULESET_OPTIONS.map((option) => (
                <button key={option.value} onClick={() => setRuleSet(option.value)}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                  style={ruleSet === option.value ? { background: "#EEF8F1", borderColor: "#72C98B" } : { background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                  <RadioDot active={ruleSet === option.value} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{option.label}</p>
                    <p className="text-xs" style={{ color: "#5F7D72" }}>{option.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "#5F7D72" }}>
              {TOURNAMENT_RULESET_OPTIONS.find((o) => o.value === ruleSet)?.description}
            </p>
          </div>

          {/* Accordion: Zonas */}
          {(["zonas", "llaves"] as const).map(section => {
            const isZonas = section === "zonas";
            const fmt = isZonas ? zonesFormat : bracketFormat;
            const setFmt = isZonas ? setZonesFormat : setBracketFormat;
            const superTB = isZonas ? zonesSuperTB : bracketSuperTB;
            const setSuperTB = isZonas ? setZonesSuperTB : setBracketSuperTB;
            const isOpen = configOpen === section;
            return (
              <div key={section} className="rounded-[20px] border overflow-hidden" style={{ borderColor: "#CFE7DC" }}>
                <button className="w-full flex items-center justify-between px-5 py-4 transition-colors"
                  style={{ background: isOpen ? "#EEF8F1" : "#F6FBF8" }}
                  onClick={() => setConfigOpen(isOpen ? null : section)}>
                  <span className="font-black text-sm" style={{ color: "#173A2E" }}>
                    {isZonas ? "Zonas" : "Llaves"}
                  </span>
                  {isOpen ? <ChevronUp size={16} style={{ color: "#5F7D72" }} /> : <ChevronDown size={16} style={{ color: "#5F7D72" }} />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: "#F0F7F4" }}>
                    <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>Formato de partido</p>
                    <div className="flex flex-col gap-2 mb-4">
                      {FORMAT_OPTIONS.map(opt => (
                        <button key={opt.id} onClick={() => setFmt(opt.id)}
                          className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                          style={fmt === opt.id ? { background: "#EEF8F1", borderColor: "#72C98B" } : { background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                          <RadioDot active={fmt === opt.id} />
                          <div>
                            <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{opt.label}</p>
                            <p className="text-xs" style={{ color: "#5F7D72" }}>{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {fmt === "super_tiebreak" && (
                      <div>
                        <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>Puntos Super Tie Break</p>
                        <Stepper value={superTB} onChange={setSuperTB} min={7} max={15} unit="pts" />
                      </div>
                    )}
                    {!isZonas && fmt === "super_tiebreak" && (
                      <div className="mt-4">
                        <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>Instancias finales</p>
                        <div className="flex flex-col gap-2">
                          {BRACKET_FINAL_OVERRIDE_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setBracketFinalOverride(opt.value)}
                              className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                              style={bracketFinalOverride === opt.value ? { background: "#EEF8F1", borderColor: "#72C98B" } : { background: "#FFFFFF", borderColor: "#CFE7DC" }}>
                              <RadioDot active={bracketFinalOverride === opt.value} />
                              <div>
                                <p className="text-xs font-black" style={{ color: "#173A2E" }}>{opt.label}</p>
                                <p className="text-xs" style={{ color: "#5F7D72" }}>{opt.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* MODO RELÁMPAGO */}
          <div className="rounded-[20px] border p-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <button onClick={() => setRapidMode(!rapidMode)} className="flex items-center gap-2 mb-2">
              {rapidMode ? <Check size={18} style={{ color: "#086847" }} /> : <div className="w-[18px] h-[18px] rounded-full border" style={{ borderColor: "#9BB8AE" }} />}
              <span className="font-black text-sm" style={{ color: rapidMode ? "#173A2E" : "#5F7D72" }}>MODO RELAMPAGO</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "#5F7D72" }}>1 SOLO SET A</span>
              <input
                type="text"
                value={rapidPoints}
                onChange={(e) => setRapidPoints(Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 9)}
                className="border rounded-lg px-2 py-1 text-xs w-14 text-center"
                style={{ borderColor: "#CFE7DC" }}
              />
              <span className="text-xs font-bold" style={{ color: "#5F7D72" }}>PTS</span>
            </div>
          </div>

          {/* Duración */}
          <div className="rounded-[20px] border p-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} style={{ color: "#5F7D72" }} />
              <span className="font-black text-sm" style={{ color: "#173A2E" }}>Duracion de partido promedio</span>
            </div>
            <input
              type="text"
              value={durationInput}
              onChange={(e) => setDurationInput(normalizeTypedTimeInput(e.target.value))}
              placeholder="1:15"
              className="border rounded-lg px-3 py-2 text-sm w-24"
              style={{ borderColor: "#CFE7DC" }}
            />
          </div>

          {/* Disponibilidad de sedes para zonas */}
          <div className="rounded-[20px] border p-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={16} style={{ color: "#5F7D72" }} />
              <span className="font-black text-sm" style={{ color: "#173A2E" }}>Disponibilidad de sedes para zonas</span>
            </div>
            <p className="text-xs mb-1" style={{ color: "#5F7D72" }}>
              Agrega las franjas horarias de canchas disponibles.
            </p>
            {eventBatchId && (
              <p className="text-xs mb-1" style={{ color: "#5F7D72" }}>
                Esta configuracion es compartida por todas las categorias de este evento.
              </p>
            )}
            <p className="text-xs mb-4" style={{ color: "#5F7D72" }}>
              Franjas para llaves detectadas: {zoneVenueSchedules.filter((s) => s.useForBracket).length}
            </p>

            {!tournamentVenueOptions.length ? (
              <p className="text-xs italic" style={{ color: "#9BB8AE" }}>
                Este torneo todavía no tiene ninguna sede cargada.
              </p>
            ) : !tournamentDayOptions.length ? (
              <p className="text-xs italic" style={{ color: "#9BB8AE" }}>
                Cargá la fecha de inicio y fin del torneo para poder elegir días.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {tournamentVenueOptions.map((venue, venueIndex) => {
                  const venueDraft = getVenueDraft(venue.id);
                  const venueSchedules = zoneVenueSchedules.filter((s) => s.venueId === venue.id);
                  const totalCanchas = venue.totalCanchas || 1;
                  const courtOptions = Array.from({ length: totalCanchas }, (_, i) => i + 1);
                  const effectiveSelectedIndices = venueDraft.selectedCourtIndices ?? courtOptions;
                  const isVenueEnabled = venueDraft.useForZones || venueDraft.useForBracket;
                  const isExpanded = expandedVenueScheduleIds.includes(venue.id);

                  return (
                    <div key={venue.id} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#CFE7DC" }}>
                      <button onClick={() => toggleVenueScheduleExpanded(venue.id)}
                        className="w-full flex items-center justify-between px-4 py-3">
                        <div className="text-left">
                          <p className="text-[10px] font-bold uppercase" style={{ color: "#5F7D72" }}>Sede {venueIndex + 1}</p>
                          <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{venue.name}</p>
                          <p className="text-xs" style={{ color: "#5F7D72" }}>
                            {effectiveSelectedIndices.length}/{totalCanchas} cancha{totalCanchas !== 1 ? "s" : ""} seleccionada{effectiveSelectedIndices.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-1 rounded-full"
                            style={isVenueEnabled ? { background: "#D7F2E2", color: "#167A45" } : { background: "#FBEBD2", color: "#A86500" }}>
                            {isVenueEnabled ? "Disponible" : "Sin seleccionar"}
                          </span>
                          {isExpanded ? <ChevronUp size={18} style={{ color: "#5F7D72" }} /> : <ChevronDown size={18} style={{ color: "#5F7D72" }} />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t flex flex-col gap-3" style={{ borderColor: "#F0F7F4" }}>
                          <div className="flex gap-2">
                            <button onClick={() => toggleScheduleVenueUsage(venue.id, "useForZones")}
                              className="text-xs font-bold px-3 py-1.5 rounded-full border"
                              style={venueDraft.useForZones ? { background: "#086847", color: "#FFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}>
                              Utilizar en Zonas
                            </button>
                            <button onClick={() => toggleScheduleVenueUsage(venue.id, "useForBracket")}
                              className="text-xs font-bold px-3 py-1.5 rounded-full border"
                              style={venueDraft.useForBracket ? { background: "#086847", color: "#FFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}>
                              Utilizar en Llaves
                            </button>
                          </div>

                          {courtOptions.length > 1 && (
                            <div>
                              <p className="text-[10px] font-bold mb-1" style={{ color: "#5F7D72" }}>Canchas a usar</p>
                              <div className="flex gap-1 flex-wrap">
                                {courtOptions.map((courtIndex) => (
                                  <button key={courtIndex} onClick={() => toggleCourtSelection(venue.id, courtIndex, totalCanchas)}
                                    className="w-8 h-8 rounded-lg text-xs font-bold border"
                                    style={effectiveSelectedIndices.includes(courtIndex) ? { background: "#086847", color: "#FFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}>
                                    {courtIndex}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {isVenueEnabled && (
                            <>
                              <div>
                                <p className="text-[10px] font-bold mb-1" style={{ color: "#5F7D72" }}>Dia</p>
                                <div className="flex gap-1 flex-wrap">
                                  {tournamentDayOptions.map((day) => (
                                    <button key={day.key} onClick={() => selectScheduleVenueDay(venue.id, day.key)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-full border"
                                      style={venueDraft.selectedDayKey === day.key ? { background: "#086847", color: "#FFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}>
                                      {day.shortLabel}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] font-bold mb-1" style={{ color: "#5F7D72" }}>Desde</p>
                                  <input type="time" value={venueDraft.from}
                                    onChange={(e) => updateVenueDraft(venue.id, { from: e.target.value })}
                                    className="border rounded-lg px-2 py-2 text-xs w-full" style={{ borderColor: "#CFE7DC" }} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold mb-1" style={{ color: "#5F7D72" }}>Hasta</p>
                                  <input type="time" value={venueDraft.to}
                                    onChange={(e) => updateVenueDraft(venue.id, { to: e.target.value })}
                                    className="border rounded-lg px-2 py-2 text-xs w-full" style={{ borderColor: "#CFE7DC" }} />
                                </div>
                              </div>

                              <button onClick={() => handleAddZoneVenueSchedule(venue.id)} disabled={savingSchedules}
                                className="py-2.5 rounded-xl font-black text-xs text-white disabled:opacity-40"
                                style={{ background: "#086847" }}>
                                {savingSchedules ? "GUARDANDO..." : "GUARDAR FRANJA"}
                              </button>

                              {venueSchedules.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                  {venueSchedules.map((s) => (
                                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "#F6FBF8" }}>
                                      <p className="text-xs" style={{ color: "#5F7D72" }}>
                                        {tournamentDayOptions.find((d) => d.key === s.dayKey)?.shortLabel ?? s.dayKey} · {s.from} a {s.to} · {s.selectedCourtIndices?.length ?? s.courts} cancha{(s.selectedCourtIndices?.length ?? s.courts) !== 1 ? "s" : ""}
                                      </p>
                                      <button onClick={() => handleRemoveZoneVenueSchedule(s.id)} disabled={savingSchedules} className="text-red-400 hover:text-red-600 p-1">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs" style={{ color: "#9BB8AE" }}>Aun no cargaste franjas horarias para esta sede.</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={saveConfig} disabled={savingConfig}
            className="w-full py-4 rounded-2xl font-black text-sm text-white disabled:opacity-40 transition-opacity"
            style={{ background: "#0B8457" }}>
            {savingConfig ? "Guardando..." : "GUARDAR CONFIGURACIÓN"}
          </button>
        </div>
      )}

      {/* ── ZONAS / LLAVES selector (shared by automatico + manual) ─────────── */}
      {(sub === "automatico" || sub === "manual") && (
        <div className="flex gap-3 mb-6">
          <button onClick={() => setView("zonas")}
            className="flex-1 py-3 rounded-2xl font-black text-sm border transition-all"
            style={view === "zonas"
              ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" }
              : { background: "#F6FBF8", color: "#086847", borderColor: "#CFE7DC" }}>
            ZONAS
          </button>
          <button onClick={() => setView("llaves")}
            className="flex-1 py-3 rounded-2xl font-black text-sm border transition-all"
            style={view === "llaves"
              ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" }
              : { background: "#F6FBF8", color: "#086847", borderColor: "#CFE7DC" }}>
            LLAVES
          </button>
        </div>
      )}

      {/* ── ARMADO AUTOMÁTICO — vista ZONAS ────────────────────────────────── */}
      {sub === "automatico" && view === "zonas" && (
        <div>
          <div className="rounded-2xl border p-5 mb-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
            <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>
              {confirmedRegistrations.length} pareja{confirmedRegistrations.length !== 1 ? "s" : ""} confirmada{confirmedRegistrations.length !== 1 ? "s" : ""}
            </p>

            {confirmedRegistrations.length < 6 ? (
              <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
                Necesitás al menos 6 parejas confirmadas para armar zonas automáticamente.
              </p>
            ) : (
              <>
                <p className="text-sm font-bold mb-1" style={{ color: "#173A2E" }}>
                  Zonas de {fixtureRecommendation.zoneSizes.join(" / ")}
                </p>
                <p className="text-xs mb-4" style={{ color: "#5F7D72" }}>{fixtureRecommendation.qualifiedSummary}</p>
                <button onClick={handleGenerarZonasAutomatico} disabled={savingZones}
                  className="w-full py-3 rounded-2xl font-black text-sm text-white disabled:opacity-40 transition-opacity"
                  style={{ background: "#086847" }}>
                  {savingZones ? "Generando..." : "GENERAR ZONAS AUTOMÁTICAMENTE"}
                </button>
              </>
            )}
          </div>

          {zones.length === 0 ? (
            <div className="text-center py-10 rounded-2xl border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
              <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
                No hay zonas configuradas todavía.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <button onClick={handleAutoScheduleAll} disabled={savingAutoSchedule}
                className="py-3 rounded-2xl font-black text-xs border disabled:opacity-40"
                style={{ borderColor: "#086847", color: "#086847", background: "#EEF8F1" }}>
                {savingAutoSchedule ? "Asignando..." : "ASIGNAR HORARIO/CANCHA AUTOMÁTICAMENTE"}
              </button>
              {zones.map((zone) => (
                <ZoneCard key={zone.id}
                  zone={zone} regMap={regMap} zonesFormat={savedZonesFormat} venueNameById={venueNameById} categoryLabel={zoneCategoryLabel}
                  getMatchConflict={getMatchConflict}
                  onResultClick={(matchKey, match) => setZoneResultModal({ zoneId: zone.id, matchKey, match })}
                  onStandingsClick={() => setStandingsModal(zone)}
                  onScheduleClick={(matchKey) => setScheduleModal({ zoneId: zone.id, matchKey })} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ARMADO MANUAL — vista ZONAS ────────────────────────────────────── */}
      {sub === "manual" && view === "zonas" && (
        <div>
              <AvailabilityGrid
                dayBlocks={dayBlocks}
                gridRows={gridRows}
                selectedPairIds={selectedPairIds}
                onTogglePairSelect={togglePairSelection}
                onToggleCell={handleToggleAvailabilityCell}
                onToggleSiblingCollapsed={toggleSiblingCollapsed}
                countPairsAvailableAtHour={(block, dayKey, hourMinutes) => countPairsAvailableAtHour(block, dayKey, hourMinutes)}
                getCourtsAvailableAtHour={getCourtsAvailableAtHour}
                countMatchesAtHour={countMatchesAtHour}
                gridFilter={gridFilter}
                setGridFilter={setGridFilter}
                categoryFilterOptions={categoryFilterOptions}
              />

              {/* Resumen de seleccion */}
              {selectedPairIds.size > 0 && (
                <div className="rounded-2xl border p-4 mb-5" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                  <p className="text-sm font-black mb-1" style={{ color: "#173A2E" }}>
                    {selectedPairIds.size} pareja{selectedPairIds.size === 1 ? "" : "s"} seleccionada{selectedPairIds.size === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs mb-3" style={{ color: "#5F7D72" }}>
                    {Array.from(selectedPairIds)
                      .map((id) => regMap[id] ? getPairLabel(regMap[id], 0) : "Pareja")
                      .join(" / ")}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleArmarZona} disabled={savingZones}
                      className="flex-1 py-2.5 rounded-xl font-black text-xs text-white disabled:opacity-40"
                      style={{ background: "#086847" }}>
                      {savingZones ? "Guardando..." : "ARMAR ZONA"}
                    </button>
                    <button onClick={() => setSelectedPairIds(new Set())}
                      className="px-4 py-2.5 rounded-xl font-black text-xs border"
                      style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                      Limpiar
                    </button>
                  </div>

                  {selectedPairIds.size === 1 && zones.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "#E3EFE8" }}>
                      <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "#5F7D72" }}>Agregar a zona existente</p>
                      <div className="flex gap-2 flex-wrap">
                        {zones.map((zone: any) => (
                          <button key={zone.id} disabled={savingZones} onClick={() => handleAddPairToExistingZone(zone.id)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full border disabled:opacity-40"
                            style={{ borderColor: "#CFE7DC", color: "#086847", background: "#FFFFFF" }}>
                            {zone.label ?? "Zona"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Existing zones */}
              {zones.length > 0 && (
                <div className="flex flex-col gap-4 mb-5">
                  <p className="text-xs font-black uppercase" style={{ color: "#9BB8AE", letterSpacing: "0.5px" }}>Zonas creadas</p>
                  {zones.map(zone => (
                    <ZoneCard key={zone.id}
                      zone={zone} regMap={regMap} zonesFormat={savedZonesFormat} venueNameById={venueNameById} categoryLabel={zoneCategoryLabel}
                      getMatchConflict={getMatchConflict}
                      onResultClick={(matchKey, match) => setZoneResultModal({ zoneId: zone.id, matchKey, match })}
                      onStandingsClick={() => setStandingsModal(zone)}
                      onScheduleClick={(matchKey) => setScheduleModal({ zoneId: zone.id, matchKey })}
                      onRemovePair={(regId) => handleRemovePairFromZone(zone.id, regId)} />
                  ))}
                </div>
              )}

              {/* GUARDAR BORRADOR | CONFIRMAR ARMADO */}
              <div className="flex gap-3">
                <button onClick={saveDraftZones} disabled={savingZones}
                  className="flex-1 py-3 rounded-2xl border font-black text-sm transition-all disabled:opacity-40"
                  style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F6FBF8" }}>
                  GUARDAR BORRADOR
                </button>
                <button onClick={confirmZones} disabled={savingZones || zones.length === 0}
                  className="flex-1 py-3 rounded-2xl font-black text-sm text-white disabled:opacity-40 transition-opacity"
                  style={{ background: "#0B8457" }}>
                  {savingZones ? "Confirmando..." : "CONFIRMAR ARMADO"}
                </button>
              </div>
        </div>
      )}

      {/* ── LLAVES (vista compartida por automatico + manual) ───────────────── */}
      {(sub === "automatico" || sub === "manual") && view === "llaves" && (
        <div>
          {!hasBracket ? (
            <div className="text-center py-10 rounded-2xl border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
              <p className="text-sm font-semibold mb-4" style={{ color: "#5F7D72" }}>No hay llaves configuradas.</p>
              <button onClick={handleGenerateBracket} disabled={savingAutoSchedule || !zones.length}
                className="py-3 px-6 rounded-2xl font-black text-sm text-white disabled:opacity-40 transition-opacity"
                style={{ background: "#086847" }}>
                {savingAutoSchedule ? "Generando..." : `GENERAR LLAVE ${ruleSet.toUpperCase()}`}
              </button>
              {!zones.length && (
                <p className="text-xs mt-3" style={{ color: "#9BB8AE" }}>Primero armá las zonas.</p>
              )}
            </div>
          ) : bracketLayout ? (
            <>
              <button onClick={handleAutoScheduleBracket} disabled={savingAutoSchedule}
                className="w-full mb-3 py-2.5 rounded-xl font-black text-xs border disabled:opacity-40"
                style={{ borderColor: "#086847", color: "#086847", background: "#EEF8F1" }}>
                {savingAutoSchedule ? "Asignando..." : "ASIGNAR HORARIO/CANCHA A LA LLAVE"}
              </button>
              <div className="flex items-center justify-end gap-2 mb-3">
                <button onClick={handleGenerateBracket} disabled={savingAutoSchedule}
                  className="text-xs font-bold px-3 py-1.5 rounded-full border mr-auto disabled:opacity-40"
                  style={{ borderColor: "#CFE7DC", color: "#086847" }}>
                  {savingAutoSchedule ? "Regenerando..." : "Regenerar llave"}
                </button>
                <button onClick={() => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(1))))}
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                  style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                  <Minus size={13} />
                </button>
                <span className="text-xs font-bold w-12 text-center" style={{ color: "#5F7D72" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button onClick={() => setZoom(z => Math.min(2, parseFloat((z + 0.1).toFixed(1))))}
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                  style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                  <Plus size={13} />
                </button>
                <button onClick={() => setZoom(1)} className="text-xs font-bold px-3 py-1.5 rounded-full border"
                  style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>Ajustar</button>
              </div>
              <div style={{ overflowX: "auto", overflowY: "visible", paddingBottom: 16 }}>
                <div style={{ position: "relative", width: bracketLayout.bw * zoom, height: bracketLayout.bh * zoom, minWidth: bracketLayout.bw * zoom }}>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: bracketLayout.bw, height: bracketLayout.bh, position: "relative" }}>
                    <svg style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }} width={bracketLayout.bw} height={bracketLayout.bh}>
                      {bracketLayout.lines.map((l, i) => (
                        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#B6CBD9" strokeWidth={2} strokeLinecap="round" />
                      ))}
                    </svg>
                    {bracketRounds.map((roundMatches, ri) => {
                      const color = roundColor(ri, bracketRounds.length);
                      const dark = isDarkRoundColor(color);
                      const label = roundLabel(roundMatches.length);
                      const p0 = bracketLayout.pos[ri][0];
                      return (
                        <div key={ri}>
                          <div style={{ position: "absolute", left: p0.x, top: B_PAD, width: CARD_W, height: B_HDR, background: color, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: dark ? "#FFF" : "#173A2E", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                          </div>
                          {roundMatches.map((match, mi) => {
                            const a = getSideA(match), b = getSideB(match);
                            const w = getWinnerId(match);
                            const matchSets = getSets(match);
                            const completed = isCompleted(match);
                            const score = getScoreText(match);
                            return (
                              <div key={match.id ?? mi} style={{ position: "absolute", left: bracketLayout.pos[ri][mi].x, top: bracketLayout.pos[ri][mi].y, width: CARD_W, height: CARD_H }}>
                                <div style={{ background: "#FFFFFF", borderRadius: 16, border: "2px solid #CFE7DC", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                                  {/* Side A */}
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: "1px solid #F0F7F4", background: w === a.id ? "rgba(11,132,87,0.06)" : undefined }}>
                                    <span style={{ flex: 1, fontSize: 12, fontWeight: w === a.id ? 800 : 500, color: w === a.id ? "#0B8457" : "#173A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                                    {completed && matchSets.length > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: w === a.id ? "#0B8457" : "#9BB8AE", flexShrink: 0 }}>{matchSets.map(s => s.a).join(" ")}</span>}
                                  </div>
                                  {/* Middle */}
                                  <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", background: "#F8FDFA", flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, color: "#9BB8AE" }}>{completed ? score : "Pendiente"}</span>
                                    <button onClick={() => setBracketResultModal({ match, ri, mi })}
                                      style={{ fontSize: 10, fontWeight: 700, color: "#086847", padding: "2px 8px", background: "#EEF8F1", borderRadius: 10, border: "1px solid #C5E5CF", cursor: "pointer", flexShrink: 0 }}>
                                      {completed ? "Editar" : "Resultado"}
                                    </button>
                                  </div>
                                  {/* Side B */}
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderTop: "1px solid #F0F7F4", background: w === b.id ? "rgba(11,132,87,0.06)" : undefined }}>
                                    <span style={{ flex: 1, fontSize: 12, fontWeight: w === b.id ? 800 : 500, color: w === b.id ? "#0B8457" : "#173A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</span>
                                    {completed && matchSets.length > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: w === b.id ? "#0B8457" : "#9BB8AE", flexShrink: 0 }}>{matchSets.map(s => s.b).join(" ")}</span>}
                                  </div>
                                  {/* Horario / cancha */}
                                  {!match.teamAIsBye && !match.teamBIsBye && (
                                    <button onClick={() => setBracketScheduleModal({ ri, mi })}
                                      style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, borderTop: "1px solid #F0F7F4", background: "#FAFCFB", flexShrink: 0, fontSize: 9, fontWeight: 700, color: "#5F7D72" }}>
                                      {match.scheduleLabel || "Horario pendiente"}{match.courtLabel && match.courtLabel !== "Cancha pendiente" ? ` · ${match.courtLabel}` : ""}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {zoneResultModal && (
        <ResultModal
          match={zoneResultModal.match}
          format={savedZonesFormat}
          onClose={() => setZoneResultModal(null)}
          onSave={async result => {
            const m = zoneResultModal.match;
            const winner = result.winnerId === m.pairAId ? "teamA" : result.winnerId === m.pairBId ? "teamB" : "";
            const sets = (result.sets ?? []).map((s: any) => ({ teamA: String(s.a ?? ""), teamB: String(s.b ?? "") }));
            await saveZoneMatchResult(zoneResultModal.zoneId, zoneResultModal.matchKey, {
              winnerRegistrationId: result.walkover ? "" : result.winnerId,
              winner, winnerSource: "manual", walkover: result.walkover, sets, scoreText: result.scoreText,
            });
            setZoneResultModal(null);
          }} />
      )}
      {standingsModal && (
        <StandingsModal zone={standingsModal} regMap={regMap} onClose={() => setStandingsModal(null)} />
      )}
      {bracketResultModal && (
        <ResultModal
          match={bracketResultModal.match}
          format={resolveBracketRoundMatchFormat(savedBracketFormat, savedBracketFinalOverride, bracketResultModal.match?.roundTitle)}
          onClose={() => setBracketResultModal(null)}
          onSave={async result => {
            const m = bracketResultModal.match;
            const winner = result.winnerId === m.teamAId ? "teamA" : result.winnerId === m.teamBId ? "teamB" : "";
            const sets = (result.sets ?? []).map((s: any) => ({ teamA: String(s.a ?? ""), teamB: String(s.b ?? "") }));
            await saveBracketMatchResult(
              bracketResultModal.ri, bracketResultModal.mi,
              { winner, winnerSource: "manual", walkover: result.walkover, sets },
              result.scoreText
            );
            setBracketResultModal(null);
          }} />
      )}
      {scheduleModal && (() => {
        const zone = zones.find((z: any) => z.id === scheduleModal.zoneId);
        if (!zone) return null;
        const currentSchedule = zone.matchSchedules?.[scheduleModal.matchKey] ?? {};
        const allSlots = buildZoneMatchSchedulingSlots(zoneSchedulesForMatches, matchDurationMinutes);
        const participantIds = getZoneMatchParticipantIds(zone, scheduleModal.matchKey);
        const dependsOn = ["G vs G", "P vs P"].includes(scheduleModal.matchKey)
          ? getZoneOpeningMatchesEndTimes(zone)
          : [];

        // No se oculta ni se deshabilita ningun horario: el que tiene
        // conflicto o advertencia se muestra igual, marcado con el motivo
        // (con estilos distintos: ver ScheduleMatchModal).
        const freeSlots = allSlots.map((slot) => {
          const availabilityWarning = buildAvailabilityWarningForParticipants(participantIds, registrationsById, slot.dayKey, slot.startMinutes);

          const result = validateMatchSlot({
            dayKey: slot.dayKey,
            startMinutes: slot.startMinutes,
            venueId: slot.venueId,
            courtIndex: slot.courtIndex,
            participantIds,
            excludeKey: { tournamentId: torneoId, zoneId: scheduleModal.zoneId, matchKey: scheduleModal.matchKey },
            occupancy: scheduleOccupancy,
            matchDurationMinutes,
            restMinutes: DEFAULT_REST_MINUTES,
            dependsOn,
            pairLabelsById,
            availabilityWarning,
          });

          return {
            ...slot,
            hasConflict: result.hasConflict,
            conflictReason: result.conflictReason,
            availabilityWarning: result.availabilityWarning,
          };
        });
        return (
          <ScheduleMatchModal
            matchKey={scheduleModal.matchKey}
            freeSlots={freeSlots}
            tournamentDayOptions={tournamentDayOptions}
            hasCurrentSchedule={Boolean(currentSchedule.dayKey && currentSchedule.startTime && currentSchedule.venueId)}
            onClose={() => setScheduleModal(null)}
            onClear={async () => {
              const saved = await saveZoneMatchSchedule(scheduleModal.zoneId, scheduleModal.matchKey, null);
              if (saved) setScheduleModal(null);
            }}
            onAssign={async (slot) => {
              // Si el organizador cancela el cartel de conflicto, saveZoneMatchSchedule
              // devuelve false y el selector tiene que seguir abierto para que pueda
              // elegir otro horario (cerrarlo igual hacia parecer que no se puede
              // asignar nada, aunque el organizador solo haya cancelado ESE horario).
              const saved = await saveZoneMatchSchedule(scheduleModal.zoneId, scheduleModal.matchKey, {
                dayKey: slot.dayKey, startTime: formatMinutesToTime(slot.startMinutes), venueId: slot.venueId, courtIndex: slot.courtIndex,
              });
              if (saved) setScheduleModal(null);
            }}
          />
        );
      })()}
      {bracketScheduleModal && (() => {
        const match = fixtureSetup?.bracketPreview?.rounds?.[bracketScheduleModal.ri]?.matches?.[bracketScheduleModal.mi];
        if (!match) return null;
        const allSlots = buildZoneMatchSchedulingSlots(zoneSchedulesForBracket, matchDurationMinutes);
        const occupiedKeys = new Set(
          toArray(fixtureSetup?.bracketPreview?.rounds).flatMap((r: any) =>
            toArray(r.matches)
              .filter((m: any) => m.scheduledDayKey && m.scheduledTime && m.courtLabel && m.courtLabel !== "Cancha pendiente")
              .map((m: any) => `${m.scheduledDayKey}|${m.scheduledTime}|${m.courtLabel}`)
          )
        );
        const freeSlots = allSlots.filter((slot) => !occupiedKeys.has(`${slot.dayKey}|${formatMinutesToTime(slot.startMinutes)}|${slot.venueName} · Cancha ${slot.courtIndex}`));
        return (
          <ScheduleMatchModal
            matchKey="llave"
            freeSlots={freeSlots}
            tournamentDayOptions={tournamentDayOptions}
            hasCurrentSchedule={Boolean(match.scheduledDayKey && match.scheduledTime)}
            onClose={() => setBracketScheduleModal(null)}
            onClear={async () => {
              await saveBracketMatchSchedule(bracketScheduleModal.ri, bracketScheduleModal.mi, null);
              setBracketScheduleModal(null);
            }}
            onAssign={async (slot) => {
              await saveBracketMatchSchedule(bracketScheduleModal.ri, bracketScheduleModal.mi, {
                dayKey: slot.dayKey, startTime: formatMinutesToTime(slot.startMinutes), venueName: slot.venueName, courtIndex: slot.courtIndex,
              });
              setBracketScheduleModal(null);
            }}
          />
        );
      })()}

      {ruleSetInfoVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-[22px] p-6 shadow-xl overflow-y-auto" style={{ background: "#FFFFFF", maxHeight: "90vh" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-base" style={{ color: "#173A2E" }}>¿Cómo se arman las zonas y llaves?</h3>
              <button onClick={() => setRuleSetInfoVisible(false)}><X size={18} style={{ color: "#5F7D72" }} /></button>
            </div>
            <div className="mb-4">
              <p className="text-sm font-bold mb-1" style={{ color: "#173A2E" }}>Torneo FAP (Federación Argentina de Pádel)</p>
              <p className="text-xs" style={{ color: "#5F7D72" }}>
                De cada zona de 4 parejas avanzan 3 a la fase eliminatoria. Al clasificar más parejas por zona, el cuadro final es más grande y el torneo tiene más partidos y fechas, ideal si querés que casi todos jueguen más de una ronda eliminatoria.
              </p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-bold mb-1" style={{ color: "#173A2E" }}>Torneo APA (Asociación Padel Argentina)</p>
              <p className="text-xs" style={{ color: "#5F7D72" }}>
                De cada zona de 4 parejas avanzan solo 2 a la fase eliminatoria. El cuadro final es más chico, por lo que el torneo se resuelve en menos partidos y fechas, ideal para torneos más cortos o con menos días de juego.
              </p>
            </div>
            <button onClick={() => setRuleSetInfoVisible(false)}
              className="w-full py-3 rounded-xl font-black text-sm text-white"
              style={{ background: "#086847" }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: asignar horario/cancha a un partido ───────────────────────────────
function ScheduleMatchModal({ matchKey, freeSlots, tournamentDayOptions, hasCurrentSchedule, onClose, onClear, onAssign }: {
  matchKey: string;
  freeSlots: {
    id: string; dayKey: string; startMinutes: number; venueId: string; venueName: string; courtIndex: number; timeLabel: string;
    hasConflict?: boolean; conflictReason?: string; availabilityWarning?: string;
  }[];
  tournamentDayOptions: { key: string; shortLabel: string }[];
  hasCurrentSchedule: boolean;
  onClose: () => void;
  onClear: () => Promise<void>;
  onAssign: (slot: { dayKey: string; startMinutes: number; venueId: string; venueName: string; courtIndex: number }) => Promise<void>;
}) {
  const dayKeysWithSlots = Array.from(new Set(freeSlots.map((s) => s.dayKey)));
  const [day, setDay] = useState<string>(dayKeysWithSlots[0] ?? "");
  const [saving, setSaving] = useState(false);
  const slotsForDay = freeSlots.filter((s) => s.dayKey === day);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-[22px] p-6 shadow-xl overflow-y-auto" style={{ background: "#FFFFFF", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Horario del partido</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#5F7D72" }} /></button>
        </div>

        {freeSlots.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "#5F7D72" }}>
            No hay horarios libres. Cargá más horarios de cancha en Preferencias.
          </p>
        ) : (
          <>
            <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Día</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {dayKeysWithSlots.map((dk) => (
                <button key={dk} onClick={() => setDay(dk)}
                  className="px-3 py-2 rounded-full text-xs font-bold border transition-all"
                  style={day === dk ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" } : { background: "#F6FBF8", color: "#086847", borderColor: "#CFE7DC" }}>
                  {tournamentDayOptions.find((d) => d.key === dk)?.shortLabel || dk}
                </button>
              ))}
            </div>
            <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Horario libre</p>
            <div className="flex flex-col gap-2 mb-2 max-h-60 overflow-y-auto">
              {slotsForDay
                .slice()
                // Los horarios realmente libres primero, para que no queden
                // escondidos entre los que solo tienen una advertencia de
                // disponibilidad (que suelen ser la mayoria: el organizador
                // a menudo agenda en horas que la pareja no cargo puntualmente).
                .sort((a, b) => Number(Boolean(a.conflictReason || a.availabilityWarning)) - Number(Boolean(b.conflictReason || b.availabilityWarning)))
                .map((slot) => {
                  // Un conflicto real (cancha/pareja/dependencia G-P) es mas
                  // grave que una simple advertencia de disponibilidad no
                  // cargada: se distinguen con colores distintos para que no
                  // parezca que TODOS los horarios estan "ocupados" cuando en
                  // realidad solo faltan cargar disponibilidad.
                  const tone: "conflict" | "warning" | "free" = slot.conflictReason ? "conflict" : slot.availabilityWarning ? "warning" : "free";
                  const reason = slot.conflictReason || slot.availabilityWarning;
                  const toneColors = {
                    conflict: { border: "#E6C0C0", background: "#FFF6F6", accent: "#B24343" },
                    warning: { border: "#F0DBA6", background: "#FFFBF0", accent: "#A6790A" },
                    free: { border: "#CFE7DC", background: "#F6FBF8", accent: "" },
                  }[tone];
                  return (
                    <button key={slot.id} disabled={saving}
                      onClick={async () => { setSaving(true); await onAssign(slot); setSaving(false); }}
                      className="text-left px-3 py-2.5 rounded-xl border text-xs font-semibold disabled:opacity-40"
                      style={{ borderColor: toneColors.border, color: "#173A2E", background: toneColors.background }}>
                      <div className="flex items-center gap-1.5">
                        {reason && <Info size={12} style={{ color: toneColors.accent, flexShrink: 0 }} />}
                        <span>{slot.timeLabel} · {slot.venueName} · Cancha {slot.courtIndex}</span>
                      </div>
                      {reason && (
                        <p className="text-[10px] font-bold mt-1" style={{ color: toneColors.accent }}>{reason}</p>
                      )}
                    </button>
                  );
                })}
            </div>
          </>
        )}

        {hasCurrentSchedule && (
          <button disabled={saving} onClick={async () => { setSaving(true); await onClear(); setSaving(false); }}
            className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold border disabled:opacity-40"
            style={{ borderColor: "#E6C0C0", color: "#B24343", background: "#FFF1F1" }}>
            Borrar horario asignado
          </button>
        )}
      </div>
    </div>
  );
}
