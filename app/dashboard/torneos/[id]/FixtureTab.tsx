"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Plus, Minus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type FixSub = "zonas" | "llaves" | "configurar";
type MatchFmt = "third_set" | "super_tiebreak";

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_W = 258;
const CARD_H = 150;
const COL_STEP = 282;
const B_PAD = 16;
const B_HDR = 34;
const ROUND_COLORS = ["#AEEBFF", "#6FCBFF", "#2E8FE8", "#0B4FB3"];

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

// ── Data helpers ──────────────────────────────────────────────────────────────
const getSideA = (m: any) => ({
  id: m.pairAId ?? m.sideAId ?? m.sideARef ?? "",
  label: m.pairALabel ?? m.sideALabel ?? "TBD",
});
const getSideB = (m: any) => ({
  id: m.pairBId ?? m.sideBId ?? m.sideBRef ?? "",
  label: m.pairBLabel ?? m.sideBLabel ?? "TBD",
});
const getWinnerId = (m: any): string => m.result?.winnerId ?? m.winnerPairId ?? "";
const isCompleted = (m: any): boolean => !!getWinnerId(m) || m.result?.walkover === true;
const getSets = (m: any): { a: number; b: number }[] =>
  toArray(m.result?.sets ?? m.sets).map((s: any) => ({ a: s.a ?? s.sideA ?? 0, b: s.b ?? s.sideB ?? 0 }));
const getScoreText = (m: any): string => {
  const r = m.result;
  if (!r) return "";
  if (r.walkover) return "Walkover";
  return r.scoreText ?? getSets(m).map((s) => `${s.a}-${s.b}`).join(" ");
};

function roundLabel(n: number) {
  if (n === 1) return "Final";
  if (n === 2) return "Semifinales";
  if (n === 4) return "Cuartos de final";
  if (n === 8) return "Octavos de final";
  return `Ronda de ${n}`;
}

function roundColor(ri: number, total: number) {
  if (total <= 1) return ROUND_COLORS[3];
  const idx = Math.round((ri / (total - 1)) * (ROUND_COLORS.length - 1));
  return ROUND_COLORS[Math.min(idx, ROUND_COLORS.length - 1)];
}

function isDarkRoundColor(hex: string) {
  return hex === "#2E8FE8" || hex === "#0B4FB3";
}

// ── Standings computation ─────────────────────────────────────────────────────
function computeStandings(zone: any) {
  const map: Record<string, { pairId: string; pairLabel: string; pj: number; pg: number; pp: number; sf: number; sc: number; dif: number; dg: number }> = {};

  const ensure = (id: string, label: string) => {
    if (!map[id]) map[id] = { pairId: id, pairLabel: label, pj: 0, pg: 0, pp: 0, sf: 0, sc: 0, dif: 0, dg: 0 };
  };

  for (const m of zone.matches ?? []) {
    const a = getSideA(m), b = getSideB(m);
    const w = getWinnerId(m);
    if (!a.id || !b.id || (!w && !m.result?.walkover)) continue;
    ensure(a.id, a.label);
    ensure(b.id, b.label);

    if (w === a.id || (m.result?.walkover && m.result?.winnerId === a.id)) {
      map[a.id].pj++; map[a.id].pg++;
      map[b.id].pj++; map[b.id].pp++;
    } else {
      map[b.id].pj++; map[b.id].pg++;
      map[a.id].pj++; map[a.id].pp++;
    }

    for (const s of getSets(m)) {
      if (w === a.id) {
        map[a.id].sf += s.a; map[a.id].sc += s.b;
        map[b.id].sf += s.b; map[b.id].sc += s.a;
      } else {
        map[b.id].sf += s.b; map[b.id].sc += s.a;
        map[a.id].sf += s.a; map[a.id].sc += s.b;
      }
    }
  }

  return Object.values(map)
    .map((s) => ({ ...s, dif: s.sf - s.sc }))
    .sort((x, y) => y.pg - x.pg || y.pj - x.pj || y.dif - x.dif || y.dg - x.dg || y.sf - x.sf);
}

// ── Bracket layout ────────────────────────────────────────────────────────────
function buildBracketLayout(rounds: any[][]) {
  const pos: { x: number; y: number }[][] = [];

  for (let ri = 0; ri < rounds.length; ri++) {
    pos[ri] = [];
    const x = B_PAD + ri * COL_STEP;
    if (ri === 0) {
      rounds[ri].forEach((_, mi) => {
        pos[ri][mi] = { x, y: B_PAD + B_HDR + 8 + mi * (CARD_H + 8) };
      });
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

// ── Result Modal (shared for zones & bracket) ─────────────────────────────────
function ResultModal({
  match,
  format,
  superTBPoints,
  onClose,
  onSave,
}: {
  match: any;
  format: MatchFmt;
  superTBPoints: number;
  onClose: () => void;
  onSave: (payload: { result: any; date?: string; time?: string; venue?: string }) => Promise<void>;
}) {
  const a = getSideA(match);
  const b = getSideB(match);
  const existingSets = getSets(match);
  const numRegSets = format === "third_set" ? 3 : 2;

  const initSets = Array.from({ length: numRegSets }, (_, i) => ({
    a: String(existingSets[i]?.a ?? ""),
    b: String(existingSets[i]?.b ?? ""),
  }));
  const initSuperTB = format === "super_tiebreak" && existingSets[numRegSets]
    ? { a: String(existingSets[numRegSets].a), b: String(existingSets[numRegSets].b) }
    : { a: "", b: "" };

  const [winner, setWinner] = useState<string>(getWinnerId(match) || (match.result?.walkover ? "walkover" : ""));
  const [sets, setSets] = useState(initSets);
  const [superTB, setSuperTB] = useState(initSuperTB);
  const [date, setDate] = useState(match.date ?? "");
  const [time, setTime] = useState(match.time ?? "");
  const [venue, setVenue] = useState(match.venue ?? "");
  const [saving, setSaving] = useState(false);

  const isWO = winner === "walkover";

  async function handleSave() {
    if (!winner) return;
    setSaving(true);
    const filteredSets = isWO
      ? []
      : sets
          .filter((s) => s.a !== "" || s.b !== "")
          .map((s) => ({ a: parseInt(s.a) || 0, b: parseInt(s.b) || 0 }));

    if (!isWO && format === "super_tiebreak" && (superTB.a !== "" || superTB.b !== "")) {
      filteredSets.push({ a: parseInt(superTB.a) || 0, b: parseInt(superTB.b) || 0 });
    }

    const result = {
      winnerId: isWO ? "" : winner,
      walkover: isWO,
      sets: filteredSets,
      scoreText: isWO ? "Walkover" : filteredSets.slice(0, numRegSets).map((s) => `${s.a}-${s.b}`).join(" "),
    };

    await onSave({ result, date: date || undefined, time: time || undefined, venue: venue || undefined });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-sm rounded-[22px] p-6 shadow-xl overflow-y-auto"
        style={{ background: "#FFFFFF", maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Resultado del partido</h3>
          <button onClick={onClose}>
            <X size={18} style={{ color: "#5F7D72" }} />
          </button>
        </div>

        {/* Winner selector */}
        <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>¿Quién ganó?</p>
        <div className="flex gap-2 mb-2">
          {[
            { id: a.id, label: a.label },
            { id: b.id, label: b.label },
          ].map((side) => (
            <button
              key={side.id}
              onClick={() => setWinner(side.id)}
              className="flex-1 rounded-xl py-3 px-2 text-xs font-bold border transition-all text-center"
              style={
                winner === side.id
                  ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                  : { background: "#F6FBF8", color: "#173A2E", borderColor: "#CFE7DC" }
              }
            >
              {side.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWinner("walkover")}
          className="w-full rounded-xl py-2 text-xs font-bold border mb-5 transition-all"
          style={
            isWO
              ? { background: "#667482", color: "#FFF", borderColor: "#667482" }
              : { background: "#F3F5F7", color: "#667482", borderColor: "#D4DBE2" }
          }
        >
          Walkover
        </button>

        {/* Sets */}
        {!isWO && (
          <div className="mb-5">
            <p className="text-xs font-bold mb-3" style={{ color: "#5F7D72" }}>Sets</p>
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-20 font-semibold" style={{ color: "#5F7D72" }}>SET {i + 1}</span>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={s.a}
                  onChange={(e) =>
                    setSets((prev) => prev.map((p, j) => (j === i ? { ...p, a: e.target.value } : p)))
                  }
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
                <span className="text-xs font-black" style={{ color: "#9BB8AE" }}>–</span>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={s.b}
                  onChange={(e) =>
                    setSets((prev) => prev.map((p, j) => (j === i ? { ...p, b: e.target.value } : p)))
                  }
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
              </div>
            ))}
            {format === "super_tiebreak" && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs w-20 font-semibold" style={{ color: "#5F7D72" }}>SUPER TB</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={superTB.a}
                  onChange={(e) => setSuperTB((p) => ({ ...p, a: e.target.value }))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
                <span className="text-xs font-black" style={{ color: "#9BB8AE" }}>–</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={superTB.b}
                  onChange={(e) => setSuperTB((p) => ({ ...p, b: e.target.value }))}
                  className="flex-1 text-center border rounded-lg py-1.5 text-sm font-bold"
                  style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
                  placeholder="0"
                />
              </div>
            )}
          </div>
        )}

        {/* Schedule */}
        <div className="mb-5">
          <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Programación (opcional)</p>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-[10px] mb-1 block" style={{ color: "#9BB8AE" }}>
                Día
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs"
                style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] mb-1 block" style={{ color: "#9BB8AE" }}>
                Hora
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-xs"
                style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
              />
            </div>
          </div>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Cancha / lugar (opcional)"
            className="w-full border rounded-xl px-3 py-2 text-xs"
            style={{ borderColor: "#CFE7DC", color: "#173A2E" }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !winner}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "#0B8457" }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Standings Modal ───────────────────────────────────────────────────────────
function StandingsModal({ zone, onClose }: { zone: any; onClose: () => void }) {
  const standings = computeStandings(zone);
  const qualifiers: number = zone.qualifiers ?? 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-[22px] p-6 shadow-xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base" style={{ color: "#173A2E" }}>
            Posiciones — {zone.name ?? zone.title ?? "Zona"}
          </h3>
          <button onClick={onClose}>
            <X size={18} style={{ color: "#5F7D72" }} />
          </button>
        </div>

        {standings.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "#5F7D72" }}>
            Sin partidos completados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 420 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #CFE7DC" }}>
                  {["#", "PAREJA", "PJ", "PG", "PP", "SF", "SC", "DIF", "DG"].map((h) => (
                    <th
                      key={h}
                      className="py-2 text-center font-black text-[10px] uppercase"
                      style={{ color: h === "PG" ? "#0B8457" : "#5F7D72", letterSpacing: "0.4px" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr
                    key={s.pairId}
                    style={{
                      borderBottom: "1px solid #F0F7F4",
                      background: i < qualifiers ? "rgba(11,132,87,0.04)" : undefined,
                    }}
                  >
                    <td className="py-2 text-center font-black" style={{ color: "#9BB8AE" }}>
                      {i + 1}
                    </td>
                    <td className="py-2 text-left max-w-[120px]">
                      <span className="flex items-center gap-1.5">
                        {i < qualifiers && (
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: "#0B8457" }}
                          />
                        )}
                        <span
                          className="font-semibold truncate"
                          style={{ color: i === 0 ? "#0B8457" : "#173A2E" }}
                        >
                          {s.pairLabel}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.pj}</td>
                    <td className="py-2 text-center font-black" style={{ color: "#0B8457" }}>{s.pg}</td>
                    <td className="py-2 text-center" style={{ color: "#E87070" }}>{s.pp}</td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.sf}</td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.sc}</td>
                    <td
                      className="py-2 text-center font-semibold"
                      style={{ color: s.dif >= 0 ? "#0B8457" : "#E87070" }}
                    >
                      {s.dif > 0 ? `+${s.dif}` : s.dif}
                    </td>
                    <td className="py-2 text-center" style={{ color: "#5F7D72" }}>{s.dg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {qualifiers > 0 && standings.length > 0 && (
          <p className="text-[10px] mt-3 flex items-center gap-1.5" style={{ color: "#5F7D72" }}>
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: "#0B8457" }}
            />
            Los primeros {qualifiers} clasifican a llaves
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-2xl border text-sm font-bold"
          style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ── Main FixtureTab component ─────────────────────────────────────────────────
export default function FixtureTab({
  torneoId,
  fixtureSetup,
  showToast,
}: {
  torneoId: string;
  fixtureSetup: any;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [sub, setSub] = useState<FixSub>("zonas");
  const [zoom, setZoom] = useState(1);

  // Zone modals
  const [zoneResultModal, setZoneResultModal] = useState<{
    zone: any;
    zoneIdx: number;
    match: any;
    matchIdx: number;
  } | null>(null);
  const [standingsModal, setStandingsModal] = useState<any | null>(null);

  // Bracket modal
  const [bracketResultModal, setBracketResultModal] = useState<{
    match: any;
    ri: number;
    mi: number;
  } | null>(null);

  // Config state (derived from fixtureSetup, local until saved)
  const currentFmt: MatchFmt = fixtureSetup?.matchFormat ?? "third_set";
  const currentSuperTB: number = fixtureSetup?.superTiebreakPoints ?? 10;
  const [configFmt, setConfigFmt] = useState<MatchFmt>(currentFmt);
  const [configSuperTB, setConfigSuperTB] = useState<number>(currentSuperTB);
  const [savingConfig, setSavingConfig] = useState(false);

  const zones: any[] = toArray(fixtureSetup?.zonesPreview);
  const bracketRounds: any[][] = normalizeBracketRounds(fixtureSetup?.bracketPreview);

  const hasZones = zones.length > 0;
  const hasBracket = bracketRounds.length > 0;

  // ── Save helpers ────────────────────────────────────────────────────────────
  async function saveZoneMatchResult(
    zoneIdx: number,
    matchIdx: number,
    payload: { result: any; date?: string; time?: string; venue?: string }
  ) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const zone = fs.zonesPreview[zoneIdx];
      const match = zone.matches[matchIdx];
      match.result = payload.result;
      match.status = "completed";
      if (payload.date !== undefined) match.date = payload.date;
      if (payload.time !== undefined) match.time = payload.time;
      if (payload.venue !== undefined) match.venue = payload.venue;
      zone.standings = computeStandings(zone);
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Resultado guardado");
    } catch {
      showToast("Error al guardar el resultado", false);
    }
  }

  async function saveBracketMatchResult(ri: number, mi: number, result: any) {
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      const rounds =
        fs.bracketPreview?.rounds ?? (Array.isArray(fs.bracketPreview) ? fs.bracketPreview : []);
      rounds[ri][mi].result = result;
      rounds[ri][mi].status = "completed";
      if (fs.bracketPreview?.rounds) fs.bracketPreview.rounds = rounds;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Resultado guardado");
    } catch {
      showToast("Error al guardar el resultado", false);
    }
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const fs = JSON.parse(JSON.stringify(fixtureSetup ?? {}));
      fs.matchFormat = configFmt;
      fs.superTiebreakPoints = configSuperTB;
      await updateDoc(doc(db, "tournaments", torneoId), { fixtureSetup: fs });
      showToast("Configuración guardada");
    } catch {
      showToast("Error al guardar", false);
    }
    setSavingConfig(false);
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!hasZones && !hasBracket) {
    return (
      <div className="text-center py-12 rounded-2xl border" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
        <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
          El fixture todavía no fue generado desde la app.
        </p>
        <p className="text-xs mt-1" style={{ color: "#9BB8AE" }}>
          Una vez creado aparecerá aquí automáticamente.
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Sub-tab navigation */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-2xl"
        style={{ background: "#F2FAF5", border: "1px solid #D5EADF" }}
      >
        {(["zonas", "llaves", "configurar"] as FixSub[]).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className="flex-1 py-3 rounded-xl font-black text-sm uppercase transition-all"
            style={
              sub === s
                ? { background: "#086847", color: "#FFFFFF" }
                : { background: "transparent", color: "#086847" }
            }
          >
            {s === "zonas" ? "ZONAS" : s === "llaves" ? "LLAVES" : "CONFIGURAR"}
          </button>
        ))}
      </div>

      {/* ── ZONAS ──────────────────────────────────────────────────────────── */}
      {sub === "zonas" && (
        <div className="flex flex-col gap-4">
          {!hasZones ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>
              No hay zonas configuradas.
            </p>
          ) : (
            zones.map((zone, zi) => {
              const zoneName = zone.name ?? zone.title ?? `Zona ${zi + 1}`;
              const pairs: any[] = toArray(zone.pairs);
              const zMatches: any[] = toArray(zone.matches);
              const completedCount = zMatches.filter(isCompleted).length;

              return (
                <div
                  key={zone.id ?? zi}
                  className="rounded-[22px] border-2 overflow-hidden"
                  style={{ background: "#FFFFFF", borderColor: "#A8CFBC" }}
                >
                  {/* Zone header */}
                  <div
                    className="px-5 py-3 flex items-center justify-between border-b flex-wrap gap-2"
                    style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}
                  >
                    <span
                      className="inline-block px-4 py-1.5 rounded-full text-sm font-black border"
                      style={{ background: "#E1F4F0", borderColor: "#9FD6CF", color: "#1F6D69" }}
                    >
                      {zoneName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "#9BB8AE" }}>
                        {completedCount}/{zMatches.length} partidos
                      </span>
                      <button
                        onClick={() => setStandingsModal(zone)}
                        className="text-xs font-black px-3 py-1.5 rounded-full border transition-colors"
                        style={{ background: "#EEF8F1", borderColor: "#C5E5CF", color: "#0B8457" }}
                      >
                        PUNTAJES
                      </button>
                    </div>
                  </div>

                  {/* Pairs */}
                  {pairs.length > 0 && (
                    <div className="px-5 pt-3 pb-1 flex flex-wrap gap-2">
                      {pairs.map((p, pi) => (
                        <div
                          key={p.pairId ?? pi}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
                          style={{ background: "#F6FBF8", borderColor: "#CFE7DC", color: "#173A2E" }}
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 text-white"
                            style={{ background: "#086847" }}
                          >
                            {pi + 1}
                          </span>
                          <span className="font-semibold">
                            {p.pairLabel ?? p.name ?? `Pareja ${pi + 1}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Match table */}
                  {zMatches.length > 0 ? (
                    <div className="px-5 pb-4 pt-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ minWidth: 520 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #CFE7DC" }}>
                              {["RESULTADO", "PAREJAS", "DÍA", "HORARIO", "LUGAR"].map((h) => (
                                <th
                                  key={h}
                                  className="py-2 text-left pr-3 font-black text-[10px] uppercase"
                                  style={{ color: "#9BB8AE", letterSpacing: "0.4px" }}
                                >
                                  {h}
                                </th>
                              ))}
                              <th className="py-2 w-16" />
                            </tr>
                          </thead>
                          <tbody>
                            {zMatches.map((m, mi) => {
                              const a = getSideA(m), b = getSideB(m);
                              const w = getWinnerId(m);
                              const completed = isCompleted(m);
                              const score = getScoreText(m);
                              const dateStr = m.date
                                ? (() => {
                                    try {
                                      return new Date(m.date).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
                                    } catch {
                                      return m.date;
                                    }
                                  })()
                                : "—";

                              return (
                                <tr key={m.id ?? mi} style={{ borderBottom: "1px solid #F0F7F4" }}>
                                  <td className="py-2.5 pr-3">
                                    {completed ? (
                                      <span
                                        className="text-[10px] font-black px-2 py-1 rounded-lg text-white whitespace-nowrap"
                                        style={{ background: "#173A2E" }}
                                      >
                                        {score || "•"}
                                      </span>
                                    ) : (
                                      <span
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
                                        style={{ background: "#F0F7F4", color: "#9BB8AE" }}
                                      >
                                        vs
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <div className="flex flex-wrap items-center gap-x-1">
                                      <span
                                        className="font-semibold whitespace-nowrap"
                                        style={{
                                          color: w === a.id ? "#0B8457" : "#173A2E",
                                          fontWeight: w === a.id ? 800 : 500,
                                        }}
                                      >
                                        {a.label}
                                      </span>
                                      <span style={{ color: "#CFE7DC" }}>vs</span>
                                      <span
                                        className="font-semibold whitespace-nowrap"
                                        style={{
                                          color: w === b.id ? "#0B8457" : "#173A2E",
                                          fontWeight: w === b.id ? 800 : 500,
                                        }}
                                      >
                                        {b.label}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-3 whitespace-nowrap" style={{ color: "#5F7D72" }}>
                                    {dateStr}
                                  </td>
                                  <td className="py-2.5 pr-3 whitespace-nowrap" style={{ color: "#5F7D72" }}>
                                    {m.time || "—"}
                                  </td>
                                  <td
                                    className="py-2.5 pr-3 truncate max-w-[80px]"
                                    style={{ color: "#5F7D72" }}
                                  >
                                    {m.venue || "—"}
                                  </td>
                                  <td className="py-2.5">
                                    <button
                                      onClick={() =>
                                        setZoneResultModal({ zone, zoneIdx: zi, match: m, matchIdx: mi })
                                      }
                                      className="text-[10px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors"
                                      style={{
                                        borderColor: "#CFE7DC",
                                        color: "#086847",
                                        background: "#F6FBF8",
                                      }}
                                    >
                                      {completed ? "Editar" : "Resultado"}
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
                    <p className="px-5 py-4 text-xs" style={{ color: "#9BB8AE" }}>
                      Sin partidos programados.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── LLAVES ─────────────────────────────────────────────────────────── */}
      {sub === "llaves" && (
        <div>
          {!hasBracket ? (
            <p className="text-sm text-center py-8" style={{ color: "#5F7D72" }}>
              No hay llaves configuradas.
            </p>
          ) : (() => {
            const { pos, bw, bh, lines } = buildBracketLayout(bracketRounds);
            return (
              <>
                {/* Zoom controls */}
                <div className="flex items-center justify-end gap-2 mb-3">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.3, parseFloat((z - 0.1).toFixed(1))))}
                    className="w-8 h-8 rounded-full border flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="text-xs font-bold w-12 text-center" style={{ color: "#5F7D72" }}>
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(1))))}
                    className="w-8 h-8 rounded-full border flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="text-xs font-bold px-3 py-1.5 rounded-full border"
                    style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    Ajustar
                  </button>
                </div>

                {/* Bracket board */}
                <div style={{ overflowX: "auto", overflowY: "visible", paddingBottom: 16 }}>
                  <div
                    style={{
                      position: "relative",
                      width: bw * zoom,
                      height: bh * zoom,
                      minWidth: bw * zoom,
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: "top left",
                        width: bw,
                        height: bh,
                        position: "relative",
                      }}
                    >
                      {/* Connector lines */}
                      <svg
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          pointerEvents: "none",
                          overflow: "visible",
                        }}
                        width={bw}
                        height={bh}
                      >
                        {lines.map((l, i) => (
                          <line
                            key={i}
                            x1={l.x1}
                            y1={l.y1}
                            x2={l.x2}
                            y2={l.y2}
                            stroke="#B6CBD9"
                            strokeWidth={2}
                            strokeLinecap="round"
                          />
                        ))}
                      </svg>

                      {/* Rounds */}
                      {bracketRounds.map((roundMatches, ri) => {
                        const color = roundColor(ri, bracketRounds.length);
                        const dark = isDarkRoundColor(color);
                        const label = roundLabel(roundMatches.length);
                        const p0 = pos[ri][0];
                        return (
                          <div key={ri}>
                            {/* Round header badge */}
                            <div
                              style={{
                                position: "absolute",
                                left: p0.x,
                                top: B_PAD,
                                width: CARD_W,
                                height: B_HDR,
                                background: color,
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  color: dark ? "#FFF" : "#173A2E",
                                  fontSize: 11,
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.6px",
                                }}
                              >
                                {label}
                              </span>
                            </div>

                            {/* Match cards */}
                            {roundMatches.map((match, mi) => {
                              const a = getSideA(match), b = getSideB(match);
                              const w = getWinnerId(match);
                              const matchSets = getSets(match);
                              const completed = isCompleted(match);
                              const score = getScoreText(match);

                              return (
                                <div
                                  key={match.id ?? mi}
                                  style={{
                                    position: "absolute",
                                    left: pos[ri][mi].x,
                                    top: pos[ri][mi].y,
                                    width: CARD_W,
                                    height: CARD_H,
                                  }}
                                >
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      borderRadius: 16,
                                      border: "2px solid #CFE7DC",
                                      overflow: "hidden",
                                      height: "100%",
                                      display: "flex",
                                      flexDirection: "column",
                                    }}
                                  >
                                    {/* Side A */}
                                    <div
                                      style={{
                                        flex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "0 12px",
                                        borderBottom: "1px solid #F0F7F4",
                                        background: w === a.id ? "rgba(11,132,87,0.06)" : undefined,
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: 1,
                                          fontSize: 12,
                                          fontWeight: w === a.id ? 800 : 500,
                                          color: w === a.id ? "#0B8457" : "#173A2E",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {a.label}
                                      </span>
                                      {completed && matchSets.length > 0 && (
                                        <span
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 900,
                                            color: w === a.id ? "#0B8457" : "#9BB8AE",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {matchSets.map((s) => s.a).join(" ")}
                                        </span>
                                      )}
                                    </div>

                                    {/* Middle row */}
                                    <div
                                      style={{
                                        height: 32,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "0 12px",
                                        background: "#F8FDFA",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <span style={{ fontSize: 10, color: "#9BB8AE" }}>
                                        {completed ? score : "Pendiente"}
                                      </span>
                                      <button
                                        onClick={() => setBracketResultModal({ match, ri, mi })}
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          color: "#086847",
                                          padding: "2px 8px",
                                          background: "#EEF8F1",
                                          borderRadius: 10,
                                          border: "1px solid #C5E5CF",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {completed ? "Editar" : "Resultado"}
                                      </button>
                                    </div>

                                    {/* Side B */}
                                    <div
                                      style={{
                                        flex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "0 12px",
                                        borderTop: "1px solid #F0F7F4",
                                        background: w === b.id ? "rgba(11,132,87,0.06)" : undefined,
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: 1,
                                          fontSize: 12,
                                          fontWeight: w === b.id ? 800 : 500,
                                          color: w === b.id ? "#0B8457" : "#173A2E",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {b.label}
                                      </span>
                                      {completed && matchSets.length > 0 && (
                                        <span
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 900,
                                            color: w === b.id ? "#0B8457" : "#9BB8AE",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {matchSets.map((s) => s.b).join(" ")}
                                        </span>
                                      )}
                                    </div>
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
            );
          })()}
        </div>
      )}

      {/* ── CONFIGURAR ─────────────────────────────────────────────────────── */}
      {sub === "configurar" && (
        <div className="max-w-md">
          <div
            className="rounded-[20px] border p-5"
            style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}
          >
            <p className="font-black text-sm mb-4" style={{ color: "#173A2E" }}>
              Formato de partidos
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {[
                { id: "third_set" as MatchFmt, label: "Tercer set", desc: "SET 1 — SET 2 — SET 3" },
                {
                  id: "super_tiebreak" as MatchFmt,
                  label: "Super Tie Break",
                  desc: "SET 1 — SET 2 — SUPER TIE BREAK",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setConfigFmt(opt.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                  style={
                    configFmt === opt.id
                      ? { background: "#EEF8F1", borderColor: "#72C98B" }
                      : { background: "#FFFFFF", borderColor: "#CFE7DC" }
                  }
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: configFmt === opt.id ? "#0B8457" : "#CFE7DC" }}
                  >
                    {configFmt === opt.id && (
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#0B8457" }} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#173A2E" }}>
                      {opt.label}
                    </p>
                    <p className="text-xs" style={{ color: "#5F7D72" }}>
                      {opt.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {configFmt === "super_tiebreak" && (
              <div className="mb-5">
                <label className="text-xs font-bold block mb-2" style={{ color: "#5F7D72" }}>
                  Puntos del Super Tie Break
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfigSuperTB((v) => Math.max(7, v - 1))}
                    className="w-9 h-9 rounded-full border flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-xl font-black w-8 text-center" style={{ color: "#173A2E" }}>
                    {configSuperTB}
                  </span>
                  <button
                    onClick={() => setConfigSuperTB((v) => Math.min(15, v + 1))}
                    className="w-9 h-9 rounded-full border flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    <Plus size={16} />
                  </button>
                  <span className="text-xs" style={{ color: "#9BB8AE" }}>
                    puntos
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="w-full py-3 rounded-2xl font-black text-sm text-white disabled:opacity-40"
              style={{ background: "#0B8457" }}
            >
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {zoneResultModal && (
        <ResultModal
          match={zoneResultModal.match}
          format={currentFmt}
          superTBPoints={currentSuperTB}
          onClose={() => setZoneResultModal(null)}
          onSave={async (payload) => {
            await saveZoneMatchResult(zoneResultModal.zoneIdx, zoneResultModal.matchIdx, payload);
            setZoneResultModal(null);
          }}
        />
      )}

      {standingsModal && (
        <StandingsModal zone={standingsModal} onClose={() => setStandingsModal(null)} />
      )}

      {bracketResultModal && (
        <ResultModal
          match={bracketResultModal.match}
          format={currentFmt}
          superTBPoints={currentSuperTB}
          onClose={() => setBracketResultModal(null)}
          onSave={async ({ result }) => {
            await saveBracketMatchResult(bracketResultModal.ri, bracketResultModal.mi, result);
            setBracketResultModal(null);
          }}
        />
      )}
    </div>
  );
}
