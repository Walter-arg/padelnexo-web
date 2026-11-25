"use client";

import { useState, useMemo, useEffect } from "react";
import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
  buildZoneMatchSchedulingSlots,
  buildAutoMatchSchedules,
  getOccupiedSlotKeys,
  formatMinutesToTime,
  normalizeTypedTimeInput,
  parseMatchDurationToMinutes,
  formatMatchDurationValue,
  parseTimeToMinutes,
  type ZoneVenueSchedule,
  type ZonePlanningZone,
} from "@/lib/tournamentZones";
import { buildBracketPreview, applyBracketProgressions, assignSchedulesToBracketMatches, syncBracketWithZones, type BracketPair } from "@/lib/tournamentBracket";

// ── Types ─────────────────────────────────────────────────────────────────────
type FixSub = "configurar" | "automatico" | "manual";
type MatchFmt = "third_set" | "super_tiebreak";

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_W = 258;
const CARD_H = 172;
const COL_STEP = 282;
const B_PAD = 16;
const B_HDR = 34;
const ROUND_COLORS = ["#AEEBFF", "#6FCBFF", "#2E8FE8", "#0B4FB3"];

const PAIR_COLORS = [
  { bg: "#E8F5EE", fill: "#BFE8D0", text: "#0F5F37" },
  { bg: "#EAF3FF", fill: "#C7DFFF", text: "#1F5B99" },
  { bg: "#FFF4E3", fill: "#F7D89A", text: "#895A00" },
  { bg: "#F3EEFF", fill: "#D9CCFF", text: "#5B3EA0" },
  { bg: "#E8FAFA", fill: "#BCE9E7", text: "#146C68" },
  { bg: "#FFF0F4", fill: "#F7C7D2", text: "#9B314B" },
];

const TIME_SLOTS = [
  "07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00","23:00","00:00",
];

const FORMAT_OPTIONS: { id: MatchFmt; label: string; desc: string }[] = [
  { id: "third_set", label: "Tercer set", desc: "SET 1 — SET 2 — SET 3" },
  { id: "super_tiebreak", label: "Super Tie Break", desc: "SET 1 — SET 2 — SUPER TIE BREAK" },
];

const TOURNAMENT_RULESET_OPTIONS: { value: "fap" | "apa"; label: string; subtitle: string; description: string }[] = [
  { value: "fap", label: "TORNEO FAP", subtitle: "Federacion Argentina de Padel", description: "Modalidad mas extensa." },
  { value: "apa", label: "TORNEO APA", subtitle: "Asociacion Padel Argentina", description: "Modalidad mas corta." },
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

function isAvailable(reg: any, dayKey: string, timeSlot: string): boolean {
  const day = reg?.availability?.[dayKey];
  if (!day) return false;
  const quick: string[] = Array.isArray(day.quickSlots) ? day.quickSlots : [];
  if (quick.includes(timeSlot)) return true;
  const custom: any[] = Array.isArray(day.customSlots) ? day.customSlots : [];
  return custom.some((s: any) => (s.startTime ?? s.start ?? "") === timeSlot);
}

function getAllDayKeys(registrations: any[]): string[] {
  const keys = new Set<string>();
  for (const reg of registrations) {
    for (const k of Object.keys(reg.availability ?? {})) keys.add(k);
  }
  return Array.from(keys).sort();
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
function ZoneCard({ zone, regMap, zonesFormat, venueNameById, onResultClick, onStandingsClick, onScheduleClick }: {
  zone: any; regMap: Record<string, any>; zonesFormat: MatchFmt; venueNameById: Record<string, string>;
  onResultClick: (matchKey: string, match: any) => void;
  onStandingsClick: () => void;
  onScheduleClick: (matchKey: string) => void;
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
        <span className="inline-block px-4 py-1.5 rounded-full text-sm font-black border"
          style={{ background: "#E1F4F0", borderColor: "#9FD6CF", color: "#1F6D69" }}>
          {zone.label ?? "Zona"}
        </span>
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
                    ? `${venueName}${md.courtIndex ? " · C" + md.courtIndex : ""}`
                    : "—";

                  return (
                    <tr key={matchKey} style={{ borderBottom: "1px solid #F0F7F4" }}>
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
  const [sub, setSub] = useState<FixSub>("configurar");
  const [view, setView] = useState<"zonas" | "llaves">("zonas");
  const [zoom, setZoom] = useState(1);

  // ── Config state ────────────────────────────────────────────────────────────
  const mf = fixtureSetup?.matchFormat ?? {};
  const [zonesFormat, setZonesFormat] = useState<MatchFmt>(mf.zones ?? "super_tiebreak");
  const [bracketFormat, setBracketFormat] = useState<MatchFmt>(mf.bracket ?? "super_tiebreak");
  const [zonesSuperTB, setZonesSuperTB] = useState<number>(mf.zonesSuperTieBreakPoints ?? 10);
  const [bracketSuperTB, setBracketSuperTB] = useState<number>(mf.bracketSuperTieBreakPoints ?? 10);
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [savingZones, setSavingZones] = useState(false);
  const [pathType, setPathType] = useState<"strict" | "flex">("strict");

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

  const regMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of registrations) m[r.id] = r;
    return m;
  }, [registrations]);

  const allDayKeys = useMemo(() => getAllDayKeys(registrations), [registrations]);

  const assignedRegIds = useMemo(() => {
    const s = new Set<string>();
    for (const z of zones) for (const id of toArray(z.registrationIds)) s.add(id);
    return s;
  }, [zones]);

  const unassignedRegs = useMemo(
    () => registrations.filter(r => !assignedRegIds.has(r.id) && r.status !== "rejected"),
    [registrations, assignedRegIds]
  );

  function handleSetSub(s: FixSub) {
    if (s === "manual" && !selectedDay && allDayKeys.length > 0) setSelectedDay(allDayKeys[0]);
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
    if (selectedPairIds.size < 2) { showToast("Seleccioná al menos 2 parejas", false); return; }
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.zonePlanning) fs.zonePlanning = {};
      const currentZones = toArray(fs.zonePlanning.zones);
      const regIdList = Array.from(selectedPairIds);
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
    } catch {
      showToast("Error al generar las zonas", false);
    }
    setSavingZones(false);
  }

  async function confirmZones() {
    setSavingZones(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      if (!fs.zonePlanning) fs.zonePlanning = {};
      fs.zonePlanning.status = "confirmed";
      fs.lastViewedSection = "newzones";
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Armado confirmado");
    } catch {
      showToast("Error al confirmar", false);
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

  async function saveZoneMatchSchedule(zoneId: string, matchKey: string, schedule: { dayKey: string; startTime: string; venueId: string; courtIndex: number } | null) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const zoneList = toArray(fs.zonePlanning?.zones);
      const zone = zoneList.find((z: any) => z.id === zoneId);
      if (!zone) return;
      if (!zone.matchSchedules) zone.matchSchedules = {};
      const existing = zone.matchSchedules[matchKey] ?? {};
      zone.matchSchedules[matchKey] = schedule
        ? { ...existing, ...schedule }
        : { ...existing, dayKey: "", startTime: "", venueId: "", courtIndex: 0 };
      fs.zonePlanning.zones = zoneList;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(schedule ? "Horario asignado" : "Horario borrado");
    } catch {
      showToast("Error al guardar el horario", false);
    }
  }

  async function handleAutoScheduleAll() {
    if (!zoneSchedulesForMatches.length) {
      showToast("Primero cargá horarios de cancha en Configurar", false);
      return;
    }
    setSavingAutoSchedule(true);
    try {
      const { zones: scheduledZones, unassignedCount } = buildAutoMatchSchedules(
        zones as ZonePlanningZone[], registrationsById, zoneSchedulesForMatches, matchDurationMinutes
      );
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      fs.zonePlanning = { ...(fs.zonePlanning ?? {}), zones: scheduledZones };
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast(unassignedCount > 0 ? `Asignado. ${unassignedCount} partido(s) sin horario disponible.` : "Horarios asignados");
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
      showToast("Primero cargá horarios de cancha marcados para llaves en Configurar", false);
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
  const bracketLayout = hasBracket ? buildBracketLayout(bracketRounds) : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl" style={{ background: "#F2FAF5", border: "1px solid #D5EADF" }}>
        {([
          { id: "configurar", label: "PREFERENCIAS" },
          { id: "automatico", label: "ARMADO AUTO" },
          { id: "manual", label: "ARMADO MANUAL" },
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
                <div className="flex gap-2 mb-3">
                  {([
                    { id: "strict", label: "Llave corta" },
                    { id: "flex", label: "Llave larga" },
                  ] as const).map((opt) => (
                    <button key={opt.id} onClick={() => setPathType(opt.id)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
                      style={pathType === opt.id ? { background: "#086847", color: "#FFF", borderColor: "#086847" } : { borderColor: "#CFE7DC", color: "#5F7D72" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
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
                  zone={zone} regMap={regMap} zonesFormat={savedZonesFormat} venueNameById={venueNameById}
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
              {/* Day selector chips */}
              {allDayKeys.length === 0 ? (
                <div className="rounded-2xl border px-5 py-6 mb-5 text-center" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
                  <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>Las parejas aún no cargaron disponibilidad.</p>
                  <p className="text-xs mt-1" style={{ color: "#9BB8AE" }}>
                    Cuando lo hagan, sus horarios disponibles aparecerán acá.
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Seleccioná un día para ver disponibilidad</p>
                  <div className="flex gap-2 flex-wrap">
                    {allDayKeys.map(dk => (
                      <button key={dk} onClick={() => setSelectedDay(dk)}
                        className="px-3 py-2 rounded-full text-xs font-bold border transition-all"
                        style={selectedDay === dk
                          ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" }
                          : { background: "#F6FBF8", color: "#086847", borderColor: "#CFE7DC" }}>
                        {formatDayKey(dk)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability grid */}
              {selectedDay && (
                <div className="mb-5">
                  {unassignedRegs.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: "#9BB8AE" }}>
                      Todas las parejas ya tienen zona asignada.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>
                        Hacé click en el encabezado de una pareja para seleccionarla
                      </p>
                      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "#CFE7DC" }}>
                        <table className="text-xs border-collapse" style={{ minWidth: 200 + unassignedRegs.length * 90 }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #CFE7DC" }}>
                              <th className="py-3 px-3 text-left font-black text-[10px] uppercase sticky left-0 bg-white"
                                style={{ color: "#9BB8AE", minWidth: 52 }}>HORA</th>
                              {unassignedRegs.map((reg, ri) => {
                                const color = PAIR_COLORS[ri % 6];
                                const selected = selectedPairIds.has(reg.id);
                                return (
                                  <th key={reg.id}
                                    className="py-2 px-2 text-center cursor-pointer transition-all"
                                    onClick={() => setSelectedPairIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(reg.id)) next.delete(reg.id); else next.add(reg.id);
                                      return next;
                                    })}
                                    style={{ background: selected ? color.fill : color.bg, minWidth: 88, userSelect: "none" }}>
                                    <div className="font-black text-[10px] mb-0.5" style={{ color: color.text }}>P{ri + 1}</div>
                                    <div className="font-semibold text-[10px] truncate" style={{ color: color.text, maxWidth: 80 }}>
                                      {getPairLabel(reg, ri).split(" / ")[0]}
                                    </div>
                                    {selected && <Check size={10} className="mx-auto mt-1" style={{ color: color.text }} />}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {TIME_SLOTS.map((slot, si) => (
                              <tr key={slot} style={{ background: si % 2 === 0 ? "#FAFCFB" : "#FFFFFF" }}>
                                <td className="py-1.5 px-3 font-mono text-[11px] font-semibold sticky left-0"
                                  style={{ color: "#5F7D72", background: si % 2 === 0 ? "#FAFCFB" : "#FFFFFF", borderRight: "1px solid #F0F7F4" }}>
                                  {slot}
                                </td>
                                {unassignedRegs.map((reg, ri) => {
                                  const avail = isAvailable(reg, selectedDay, slot);
                                  const color = PAIR_COLORS[ri % 6];
                                  return (
                                    <td key={reg.id} className="py-1.5 px-2 text-center">
                                      <div className="rounded h-5 mx-auto" style={{
                                        background: avail ? color.fill : "transparent",
                                        border: avail ? "none" : "1px solid #EFF4F2",
                                        width: 36,
                                      }} />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ARMAR ZONA */}
              {selectedPairIds.size >= 2 && (
                <button onClick={handleArmarZona} disabled={savingZones}
                  className="w-full py-3 rounded-2xl font-black text-sm text-white mb-5 disabled:opacity-40 transition-opacity"
                  style={{ background: "#086847" }}>
                  {savingZones ? "Guardando..." : `ARMAR ZONA (${selectedPairIds.size} parejas seleccionadas)`}
                </button>
              )}

              {/* Existing zones */}
              {zones.length > 0 && (
                <div className="flex flex-col gap-4 mb-5">
                  <p className="text-xs font-black uppercase" style={{ color: "#9BB8AE", letterSpacing: "0.5px" }}>Zonas creadas</p>
                  {zones.map(zone => (
                    <ZoneCard key={zone.id}
                      zone={zone} regMap={regMap} zonesFormat={savedZonesFormat} venueNameById={venueNameById}
                      onResultClick={(matchKey, match) => setZoneResultModal({ zoneId: zone.id, matchKey, match })}
                      onStandingsClick={() => setStandingsModal(zone)}
                      onScheduleClick={(matchKey) => setScheduleModal({ zoneId: zone.id, matchKey })} />
                  ))}
                </div>
              )}

              {/* GUARDAR BORRADOR | CONFIRMAR ARMADO */}
              <div className="flex gap-3">
                <button onClick={() => showToast("Borrador guardado")}
                  className="flex-1 py-3 rounded-2xl border font-black text-sm transition-all"
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
          format={savedBracketFormat}
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
        const occupied = getOccupiedSlotKeys(zones as ZonePlanningZone[], scheduleModal.zoneId, scheduleModal.matchKey);
        const allSlots = buildZoneMatchSchedulingSlots(zoneSchedulesForMatches, matchDurationMinutes);
        const freeSlots = allSlots.filter((slot) => !occupied.has(`${slot.dayKey}|${slot.startMinutes}|${slot.venueId}|${slot.courtIndex}`));
        return (
          <ScheduleMatchModal
            matchKey={scheduleModal.matchKey}
            freeSlots={freeSlots}
            tournamentDayOptions={tournamentDayOptions}
            hasCurrentSchedule={Boolean(currentSchedule.dayKey && currentSchedule.startTime && currentSchedule.venueId)}
            onClose={() => setScheduleModal(null)}
            onClear={async () => {
              await saveZoneMatchSchedule(scheduleModal.zoneId, scheduleModal.matchKey, null);
              setScheduleModal(null);
            }}
            onAssign={async (slot) => {
              await saveZoneMatchSchedule(scheduleModal.zoneId, scheduleModal.matchKey, {
                dayKey: slot.dayKey, startTime: formatMinutesToTime(slot.startMinutes), venueId: slot.venueId, courtIndex: slot.courtIndex,
              });
              setScheduleModal(null);
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
  freeSlots: { id: string; dayKey: string; startMinutes: number; venueId: string; venueName: string; courtIndex: number; timeLabel: string }[];
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
              {slotsForDay.map((slot) => (
                <button key={slot.id} disabled={saving}
                  onClick={async () => { setSaving(true); await onAssign(slot); setSaving(false); }}
                  className="text-left px-3 py-2.5 rounded-xl border text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E", background: "#F6FBF8" }}>
                  {slot.timeLabel} · {slot.venueName} · Cancha {slot.courtIndex}
                </button>
              ))}
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
