// Portado desde src/screens/TournamentFixtureScreen.js (app movil): generacion
// de llaves de torneo para los reglamentos FAP y APA a partir de las zonas
// ya jugadas. Incluye las tablas de cruces oficiales (copiadas literal, son
// datos fijos, no algoritmo) y la logica de clasificacion por zona.
//
// Nota de alcance: solo se portan los caminos FAP y APA, porque son los
// unicos dos reglamentos que la web permite elegir al crear un torneo (no
// existe un tercer camino "generico" seleccionable). Por eso tampoco se
// porta repairBracketPreviewSourceLinks de la app (solo hace falta para ese
// camino generico): FAP/APA siempre declaran teamASourceMatchId/
// teamBSourceMatchId de forma explicita.

import {
  buildPlanningMatchLabels,
  getPlanningMatchPairNumbers,
  getZoneQualifiersCount,
  buildZoneMatchSchedulingSlots,
  parseTimeToMinutes,
  formatMinutesToTime,
  ZONE_MATCH_DURATION_MINUTES,
  type ZonePlanningZone,
  type ZoneVenueSchedule,
} from "./tournamentZones";

export type BracketPair = { id: string; label: string };

export type QualifierEntry = {
  id: string;
  label: string;
  seedLabel: string;
  zoneName: string;
  displayName: string;
  displayLines: string[];
  pairLabel: string;
  isBye?: boolean;
  sourceMatchId?: string;
};

export type BracketMatch = {
  id: string;
  title: string;
  roundTitle: string;
  teamAId: string;
  teamASeed: string;
  teamAName: string;
  teamALines: string[];
  teamAIsBye: boolean;
  teamASourceMatchId: string;
  teamBId: string;
  teamBSeed: string;
  teamBName: string;
  teamBLines: string[];
  teamBIsBye: boolean;
  teamBSourceMatchId: string;
  resultLabel: string;
  courtLabel: string;
  scheduledDayKey: string;
  scheduledTime: string;
  scheduleLabel: string;
  distributionPending?: boolean;
  result: { winnerSource: string; winner: string; sets: any[] };
};

export type BracketRound = { id: string; title: string; matches: BracketMatch[] };

export type BracketPreview = {
  mode: "automatic";
  ruleSet: "fap" | "apa";
  title: string;
  summary: string;
  recommendation: string;
  zonesLinked: string[];
  qualifierLabels: QualifierEntry[];
  byeCount: number;
  rounds: BracketRound[];
};

// ── Orden oficial de zonas (A, B, C... por tamano, las de 4 primero) ──────
// Las letras de las tablas de cruces FAP/APA ("1A", "2B") se refieren a este
// orden, no al orden en que se crearon las zonas.
export function orderZonesForBracketRuleSet(zones: ZonePlanningZone[] = []): (ZonePlanningZone & { bracketLetter: string })[] {
  return zones
    .map((zone, index) => {
      const size = zone.registrationIds?.length || 0;
      const sizeRank = size === 4 ? 0 : size === 3 ? 1 : size === 2 ? 2 : 3;
      return { index, sizeRank, size, zone };
    })
    .sort((a, b) => {
      if (a.sizeRank !== b.sizeRank) return a.sizeRank - b.sizeRank;
      if (b.size !== a.size) return b.size - a.size;
      return a.index - b.index;
    })
    .map(({ zone }, index) => ({ ...zone, bracketLetter: String.fromCharCode(65 + index) }));
}

// ── Clasificados por zona ──────────────────────────────────────────────────

function buildQualifierPlaceholder(zoneId: string, zoneLetter: string, qualifierIndex: number): QualifierEntry {
  const qualifierLabel = `${qualifierIndex + 1}${zoneLetter}`;
  return {
    id: `${zoneId}-q-${qualifierIndex + 1}`,
    label: qualifierLabel,
    seedLabel: qualifierLabel,
    zoneName: `Zona ${zoneLetter}`,
    displayName: qualifierLabel,
    displayLines: [],
    pairLabel: "",
  };
}

function formatPairShortLabel(label = ""): string {
  const parts = label.split(" / ").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts.join(" / ") : label || "Pareja";
}

function buildQualifierEntry(zoneLetter: string, qualifierIndex: number, pair: BracketPair): QualifierEntry {
  const qualifierLabel = `${qualifierIndex + 1}${zoneLetter}`;
  const pairLabel = String(pair?.label || "").trim();
  return {
    id: String(pair?.id || `zone-${zoneLetter}-q-${qualifierIndex + 1}`),
    label: qualifierLabel,
    seedLabel: qualifierLabel,
    zoneName: `Zona ${zoneLetter}`,
    displayName: pairLabel ? formatPairShortLabel(pairLabel) : qualifierLabel,
    displayLines: pairLabel ? [pairLabel] : [],
    pairLabel,
  };
}

// Para una zona ya jugada, resuelve quien salio 1ro/2do (y 3ro/4to en zonas
// de 4) segun las reglas reales: zona de 2 -> el propio partido define todo;
// zona de 4 -> "G vs G" define 1ro/2do y "P vs P" define 3ro/4to; zona de 3
// -> tabla de posiciones por cantidad de partidos ganados.
export function resolveZoneQualifiedEntries(
  zone: ZonePlanningZone,
  pairs: BracketPair[],
  zoneLetter: string
): QualifierEntry[] {
  const pairCount = pairs.length;
  const matchSchedules = zone.matchSchedules || {};
  const registrationIds = zone.registrationIds || [];
  const pairByRegId = new Map(pairs.map((p, idx) => [registrationIds[idx], p]));

  const winnerLoserOf = (matchKey: string): { winner: BracketPair; loser: BracketPair } | null => {
    const result = matchSchedules[matchKey]?.result;
    const winnerId = String(result?.winnerRegistrationId || "");
    if (!winnerId) return null;
    const pairNumbers = getPlanningMatchPairNumbers(zone, registrationIds, matchKey);
    if (pairNumbers.length !== 2) return null;
    const idA = registrationIds[Number(pairNumbers[0]) - 1];
    const idB = registrationIds[Number(pairNumbers[1]) - 1];
    const pairA = pairByRegId.get(idA);
    const pairB = pairByRegId.get(idB);
    if (!pairA || !pairB) return null;
    if (winnerId === idA) return { winner: pairA, loser: pairB };
    if (winnerId === idB) return { winner: pairB, loser: pairA };
    return null;
  };

  if (pairCount === 2) {
    const resolved = winnerLoserOf("1 vs 2");
    if (!resolved) return [];
    return [buildQualifierEntry(zoneLetter, 0, resolved.winner), buildQualifierEntry(zoneLetter, 1, resolved.loser)];
  }

  if (pairCount === 4) {
    const final = winnerLoserOf("G vs G");
    const thirdPlace = winnerLoserOf("P vs P");
    if (!final) return [];
    const qualified = [buildQualifierEntry(zoneLetter, 0, final.winner), buildQualifierEntry(zoneLetter, 1, final.loser)];
    if (thirdPlace) {
      qualified.push(buildQualifierEntry(zoneLetter, 2, thirdPlace.winner));
      qualified.push(buildQualifierEntry(zoneLetter, 3, thirdPlace.loser));
    }
    return qualified;
  }

  if (pairCount === 3) {
    const matchKeys = ["1 vs 2", "1 vs 3", "2 vs 3"];
    const allCompleted = matchKeys.every((key) => matchSchedules[key]?.result?.winnerRegistrationId);
    if (!allCompleted) return [];

    const standings = pairs.map((pair, index) => ({ pair, wins: 0, seed: index }));
    const standingsByRegId = new Map(registrationIds.map((id, idx) => [id, standings[idx]]));

    matchKeys.forEach((key) => {
      const winnerId = String(matchSchedules[key]?.result?.winnerRegistrationId || "");
      const entry = standingsByRegId.get(winnerId);
      if (entry) entry.wins += 1;
    });

    return standings
      .sort((a, b) => (b.wins !== a.wins ? b.wins - a.wins : a.seed - b.seed))
      .map((entry, index) => buildQualifierEntry(zoneLetter, index, entry.pair));
  }

  return [];
}

export function buildQualifiedEntriesFromZones(
  orderedZones: (ZonePlanningZone & { bracketLetter: string })[],
  pairsByZoneId: Map<string, BracketPair[]>,
  ruleSet: "fap" | "apa"
): QualifierEntry[] {
  return orderedZones.flatMap((zone) => {
    const pairs = pairsByZoneId.get(zone.id) || [];
    const qualifierCount = getZoneQualifiersCount(ruleSet, pairs.length);
    const resolved = resolveZoneQualifiedEntries(zone, pairs, zone.bracketLetter);

    return Array.from({ length: qualifierCount }, (_, i) => resolved[i] || buildQualifierPlaceholder(zone.id, zone.bracketLetter, i));
  });
}

function buildApaEntryMap(qualifiedEntries: QualifierEntry[]): Record<string, QualifierEntry> {
  return qualifiedEntries.reduce((map: Record<string, QualifierEntry>, entry) => {
    const seed = String(entry.seedLabel || entry.label || "").trim().toUpperCase();
    if (seed) map[seed] = entry;
    return map;
  }, {});
}

function getSeedEntry(entriesBySeed: Record<string, QualifierEntry>, seed: string): QualifierEntry {
  const normalized = String(seed || "").trim().toUpperCase();
  return (
    entriesBySeed[normalized] || {
      id: `placeholder-${normalized}`,
      label: normalized,
      seedLabel: normalized,
      zoneName: "",
      displayName: normalized,
      displayLines: [],
      pairLabel: "",
    }
  );
}

function buildByeEntry(): QualifierEntry {
  return { id: "bye", label: "BYE", seedLabel: "", zoneName: "", displayName: "BYE", displayLines: [], pairLabel: "", isBye: true };
}

function buildPendingSourceEntry(sourceMatchId: string, label: string): QualifierEntry {
  return { id: `source-${sourceMatchId}`, label, seedLabel: label, zoneName: "", displayName: label, displayLines: [], pairLabel: "", sourceMatchId };
}

function buildDefaultBracketResult() {
  return { winnerSource: "", winner: "", sets: [] as any[] };
}

function buildBracketMatchFromEntries({
  id, roundTitle, title, teamA, teamB, teamASourceMatchId = "", teamBSourceMatchId = "",
}: {
  id: string; roundTitle: string; title: string; teamA: QualifierEntry; teamB: QualifierEntry;
  teamASourceMatchId?: string; teamBSourceMatchId?: string;
}): BracketMatch {
  const autoWinner = teamA?.isBye && !teamB?.isBye ? "teamB" : teamB?.isBye && !teamA?.isBye ? "teamA" : "";

  return {
    id, title, roundTitle,
    teamAId: teamA?.isBye ? "" : String(teamA?.id || ""),
    teamASeed: teamA?.seedLabel || teamA?.label || "",
    teamAName: teamA?.displayName === "BYE" ? "" : teamA?.displayName || "",
    teamALines: teamA?.displayLines || [],
    teamAIsBye: Boolean(teamA?.isBye),
    teamASourceMatchId,
    teamBId: teamB?.isBye ? "" : String(teamB?.id || ""),
    teamBSeed: teamB?.seedLabel || teamB?.label || "",
    teamBName: teamB?.displayName === "BYE" ? "" : teamB?.displayName || "",
    teamBLines: teamB?.displayLines || [],
    teamBIsBye: Boolean(teamB?.isBye),
    teamBSourceMatchId,
    resultLabel: autoWinner ? "Avanza por BYE" : "Resultado pendiente",
    courtLabel: "Cancha pendiente",
    scheduledDayKey: "",
    scheduledTime: "",
    scheduleLabel: "Horario pendiente",
    result: { ...buildDefaultBracketResult(), winnerSource: autoWinner ? "auto" : "", winner: autoWinner },
  };
}

// ── APA ─────────────────────────────────────────────────────────────────

function buildApaMatch(id: string, roundTitle: string, title: string, teamASeed: string, teamBSeed: string, entriesBySeed: Record<string, QualifierEntry>) {
  return buildBracketMatchFromEntries({ id, roundTitle, title, teamA: getSeedEntry(entriesBySeed, teamASeed), teamB: getSeedEntry(entriesBySeed, teamBSeed) });
}

function buildApaSourceMatch(id: string, roundTitle: string, title: string, teamASourceMatchId: string, teamBSeed: string, entriesBySeed: Record<string, QualifierEntry>) {
  return buildBracketMatchFromEntries({
    id, roundTitle, title,
    teamA: buildPendingSourceEntry(teamASourceMatchId, `Ganador ${title.replace(/^Semi\s*/i, "")}`),
    teamB: getSeedEntry(entriesBySeed, teamBSeed),
    teamASourceMatchId,
  });
}

function buildApaSeedSourceMatch(id: string, roundTitle: string, title: string, teamASeed: string, teamBSourceMatchId: string, entriesBySeed: Record<string, QualifierEntry>) {
  return buildBracketMatchFromEntries({
    id, roundTitle, title,
    teamA: getSeedEntry(entriesBySeed, teamASeed),
    teamB: buildPendingSourceEntry(teamBSourceMatchId, `Ganador ${title}`),
    teamBSourceMatchId,
  });
}

function buildApaDoubleSourceMatch(id: string, roundTitle: string, title: string, teamASourceMatchId: string, teamBSourceMatchId: string) {
  return buildBracketMatchFromEntries({
    id, roundTitle, title,
    teamA: buildPendingSourceEntry(teamASourceMatchId, `Ganador ${title} A`),
    teamB: buildPendingSourceEntry(teamBSourceMatchId, `Ganador ${title} B`),
    teamASourceMatchId, teamBSourceMatchId,
  });
}

function buildApaFinalRound(): BracketRound {
  return {
    id: "round-final", title: "Final",
    matches: [buildBracketMatchFromEntries({
      id: "apa-final-1", roundTitle: "Final", title: "Final",
      teamA: buildPendingSourceEntry("apa-semi-1", "Ganador Semi 1"),
      teamB: buildPendingSourceEntry("apa-semi-2", "Ganador Semi 2"),
      teamASourceMatchId: "apa-semi-1", teamBSourceMatchId: "apa-semi-2",
    })],
  };
}

function buildApaSemisFromQuarterIds(): BracketRound {
  return {
    id: "round-semis", title: "Semifinales",
    matches: [
      buildApaDoubleSourceMatch("apa-semi-1", "Semifinales", "Semi 1", "apa-qf-1", "apa-qf-2"),
      buildApaDoubleSourceMatch("apa-semi-2", "Semifinales", "Semi 2", "apa-qf-3", "apa-qf-4"),
    ],
  };
}

function buildApaQuarterRoundFromSourcePairs(pairs: [string, string][]): BracketRound {
  return {
    id: "round-cuartos", title: "Cuartos",
    matches: pairs.map(([a, b], index) => buildApaDoubleSourceMatch(`apa-qf-${index + 1}`, "Cuartos", `Llave ${index + 1}`, a, b)),
  };
}

export function buildApaBracketPreview(
  orderedZones: (ZonePlanningZone & { bracketLetter: string })[],
  pairsByZoneId: Map<string, BracketPair[]>
): BracketPreview | null {
  const totalPairs = orderedZones.reduce((total, zone) => total + (zone.registrationIds?.length || 0), 0);
  const qualifierEntries = buildQualifiedEntriesFromZones(orderedZones, pairsByZoneId, "apa");
  const entriesBySeed = buildApaEntryMap(qualifierEntries);
  const finalRound = buildApaFinalRound();
  const zonesLinked = orderedZones.map((z) => z.label);

  const base = (title: string, summary: string, rounds: BracketRound[]): BracketPreview => ({
    mode: "automatic", ruleSet: "apa", title, summary,
    recommendation: "Cruces APA segun posiciones de zona.",
    zonesLinked, qualifierLabels: qualifierEntries, byeCount: 0, rounds,
  });

  if (totalPairs >= 6 && totalPairs <= 8) {
    return base("Semifinales APA", "Formato APA: semifinales directas con 2 clasificados por zona.", [
      { id: "round-semis", title: "Semifinales", matches: [
        buildApaMatch("apa-semi-1", "Semifinales", "Semifinal 1", "1A", "2B", entriesBySeed),
        buildApaMatch("apa-semi-2", "Semifinales", "Semifinal 2", "2A", "1B", entriesBySeed),
      ] },
      finalRound,
    ]);
  }

  if (totalPairs >= 9 && totalPairs <= 11) {
    return base("Cruces APA", "Formato APA: cruces previos y semifinales.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2B", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-2", "Cruces", "Cruce 2", "1C", "2A", entriesBySeed),
      ] },
      { id: "round-semis", title: "Semifinales", matches: [
        buildApaSourceMatch("apa-semi-1", "Semifinales", "Semi 1", "apa-cruce-1", "1A", entriesBySeed),
        buildApaSourceMatch("apa-semi-2", "Semifinales", "Semi 2", "apa-cruce-2", "1B", entriesBySeed),
      ] },
      finalRound,
    ]);
  }

  if (totalPairs >= 12 && totalPairs <= 14) {
    return base("Cuartos APA", "Formato APA: cuartos de final con zonas A a D.", [
      { id: "round-cuartos", title: "Cuartos", matches: [
        buildApaMatch("apa-qf-1", "Cuartos", "Llave 1", "1A", "2C", entriesBySeed),
        buildApaMatch("apa-qf-2", "Cuartos", "Llave 2", "2B", "1D", entriesBySeed),
        buildApaMatch("apa-qf-3", "Cuartos", "Llave 3", "1C", "2A", entriesBySeed),
        buildApaMatch("apa-qf-4", "Cuartos", "Llave 4", "2D", "1B", entriesBySeed),
      ] },
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 15 && totalPairs <= 17) {
    return base("Llave APA", "Formato APA: cruces previos y cuartos.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2B", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-4", "Cruces", "Cruce 4", "2A", "2D", entriesBySeed),
      ] },
      { id: "round-cuartos", title: "Cuartos", matches: [
        buildApaSourceMatch("apa-qf-1", "Cuartos", "Llave 1", "apa-cruce-1", "1A", entriesBySeed),
        buildApaMatch("apa-qf-2", "Cuartos", "Llave 2", "1E", "1D", entriesBySeed),
        buildApaMatch("apa-qf-3", "Cuartos", "Llave 3", "1C", "2E", entriesBySeed),
        buildApaSourceMatch("apa-qf-4", "Cuartos", "Llave 4", "apa-cruce-4", "1B", entriesBySeed),
      ] },
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 18 && totalPairs <= 20) {
    return base("Llave APA", "Formato APA: cuatro cruces previos y cuartos.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2F", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-2", "Cruces", "Cruce 2", "1E", "2B", entriesBySeed),
        buildApaMatch("apa-cruce-3", "Cruces", "Cruce 3", "2A", "1F", entriesBySeed),
        buildApaMatch("apa-cruce-4", "Cruces", "Cruce 4", "2E", "2D", entriesBySeed),
      ] },
      { id: "round-cuartos", title: "Cuartos", matches: [
        buildApaSourceMatch("apa-qf-1", "Cuartos", "Llave 1", "apa-cruce-1", "1A", entriesBySeed),
        buildApaSourceMatch("apa-qf-2", "Cuartos", "Llave 2", "apa-cruce-2", "1D", entriesBySeed),
        buildApaSourceMatch("apa-qf-3", "Cuartos", "Llave 3", "apa-cruce-3", "1C", entriesBySeed),
        buildApaSourceMatch("apa-qf-4", "Cuartos", "Llave 4", "apa-cruce-4", "1B", entriesBySeed),
      ] },
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 21 && totalPairs <= 23) {
    return base("Llave APA", "Formato APA: 6 cruces previos y cuartos.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2F", "2G", entriesBySeed),
        buildApaMatch("apa-cruce-2", "Cruces", "Cruce 2", "1E", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-3", "Cruces", "Cruce 3", "2B", "1D", entriesBySeed),
        buildApaMatch("apa-cruce-4", "Cruces", "Cruce 4", "1C", "2A", entriesBySeed),
        buildApaMatch("apa-cruce-5", "Cruces", "Cruce 5", "2D", "1F", entriesBySeed),
        buildApaMatch("apa-cruce-6", "Cruces", "Cruce 6", "1G", "2E", entriesBySeed),
      ] },
      { id: "round-cuartos", title: "Cuartos", matches: [
        buildApaSeedSourceMatch("apa-qf-1", "Cuartos", "Llave 1", "1A", "apa-cruce-1", entriesBySeed),
        buildApaDoubleSourceMatch("apa-qf-2", "Cuartos", "Llave 2", "apa-cruce-2", "apa-cruce-3"),
        buildApaDoubleSourceMatch("apa-qf-3", "Cuartos", "Llave 3", "apa-cruce-4", "apa-cruce-5"),
        buildApaSourceMatch("apa-qf-4", "Cuartos", "Llave 4", "apa-cruce-6", "1B", entriesBySeed),
      ] },
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 24 && totalPairs <= 26) {
    return base("Llave APA", "Formato APA: 7 cruces previos y cuartos.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2F", "2G", entriesBySeed),
        buildApaMatch("apa-cruce-2", "Cruces", "Cruce 2", "1E", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-3", "Cruces", "Cruce 3", "2B", "1D", entriesBySeed),
        buildApaMatch("apa-cruce-4", "Cruces", "Cruce 4", "1C", "2A", entriesBySeed),
        buildApaMatch("apa-cruce-5", "Cruces", "Cruce 5", "2D", "1F", entriesBySeed),
        buildApaMatch("apa-cruce-6", "Cruces", "Cruce 6", "1G", "2E", entriesBySeed),
        buildApaMatch("apa-cruce-7", "Cruces", "Cruce 7", "1H", "2H", entriesBySeed),
      ] },
      { id: "round-cuartos", title: "Cuartos", matches: [
        buildApaSeedSourceMatch("apa-qf-1", "Cuartos", "Llave 1", "1A", "apa-cruce-1", entriesBySeed),
        buildApaDoubleSourceMatch("apa-qf-2", "Cuartos", "Llave 2", "apa-cruce-2", "apa-cruce-3"),
        buildApaDoubleSourceMatch("apa-qf-3", "Cuartos", "Llave 3", "apa-cruce-4", "apa-cruce-5"),
        buildApaDoubleSourceMatch("apa-qf-4", "Cuartos", "Llave 4", "apa-cruce-6", "apa-cruce-7"),
      ] },
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 27 && totalPairs <= 29) {
    return base("Llave APA", "Formato APA: integracion en octavos respetando orden visual.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2B", "2C", entriesBySeed),
        buildApaMatch("apa-cruce-8", "Cruces", "Cruce 8", "2D", "2A", entriesBySeed),
      ] },
      { id: "round-octavos", title: "Octavos", matches: [
        buildApaSeedSourceMatch("apa-r16-1", "Octavos", "Llave 1", "1A", "apa-cruce-1", entriesBySeed),
        buildApaMatch("apa-r16-2", "Octavos", "Llave 2", "1I", "1H", entriesBySeed),
        buildApaMatch("apa-r16-3", "Octavos", "Llave 3", "1E", "2G", entriesBySeed),
        buildApaMatch("apa-r16-4", "Octavos", "Llave 4", "2F", "1D", entriesBySeed),
        buildApaMatch("apa-r16-5", "Octavos", "Llave 5", "1C", "2E", entriesBySeed),
        buildApaMatch("apa-r16-6", "Octavos", "Llave 6", "2H", "1F", entriesBySeed),
        buildApaMatch("apa-r16-7", "Octavos", "Llave 7", "1G", "2I", entriesBySeed),
        buildApaSourceMatch("apa-r16-8", "Octavos", "Llave 8", "apa-cruce-8", "1B", entriesBySeed),
      ] },
      buildApaQuarterRoundFromSourcePairs([["apa-r16-1", "apa-r16-2"], ["apa-r16-3", "apa-r16-4"], ["apa-r16-5", "apa-r16-6"], ["apa-r16-7", "apa-r16-8"]]),
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  if (totalPairs >= 30 && totalPairs <= 32) {
    return base("Llave APA", "Formato APA: integracion en octavos respetando orden visual.", [
      { id: "round-cruces", title: "Cruces", matches: [
        buildApaMatch("apa-cruce-1", "Cruces", "Cruce 1", "2C", "2F", entriesBySeed),
        buildApaMatch("apa-cruce-4", "Cruces", "Cruce 4", "2G", "2B", entriesBySeed),
        buildApaMatch("apa-cruce-5", "Cruces", "Cruce 5", "2A", "2H", entriesBySeed),
        buildApaMatch("apa-cruce-8", "Cruces", "Cruce 8", "2E", "2D", entriesBySeed),
      ] },
      { id: "round-octavos", title: "Octavos", matches: [
        buildApaSeedSourceMatch("apa-r16-1", "Octavos", "Llave 1", "1A", "apa-cruce-1", entriesBySeed),
        buildApaMatch("apa-r16-2", "Octavos", "Llave 2", "1I", "1H", entriesBySeed),
        buildApaMatch("apa-r16-3", "Octavos", "Llave 3", "1E", "2J", entriesBySeed),
        buildApaSourceMatch("apa-r16-4", "Octavos", "Llave 4", "apa-cruce-4", "1D", entriesBySeed),
        buildApaSeedSourceMatch("apa-r16-5", "Octavos", "Llave 5", "1C", "apa-cruce-5", entriesBySeed),
        buildApaMatch("apa-r16-6", "Octavos", "Llave 6", "2I", "2F", entriesBySeed),
        buildApaMatch("apa-r16-7", "Octavos", "Llave 7", "1G", "1D", entriesBySeed),
        buildApaSourceMatch("apa-r16-8", "Octavos", "Llave 8", "apa-cruce-8", "1B", entriesBySeed),
      ] },
      buildApaQuarterRoundFromSourcePairs([["apa-r16-1", "apa-r16-2"], ["apa-r16-3", "apa-r16-4"], ["apa-r16-5", "apa-r16-6"], ["apa-r16-7", "apa-r16-8"]]),
      buildApaSemisFromQuarterIds(),
      finalRound,
    ]);
  }

  return null;
}

// ── FAP ─────────────────────────────────────────────────────────────────

function getFapMatchId(code: string): string {
  return `fap-${code.trim().toLowerCase()}`;
}

function buildFapDoubleSourceMatch(code: string, roundTitle: string, teamASourceCode: string, teamBSourceCode: string) {
  return buildBracketMatchFromEntries({
    id: getFapMatchId(code), roundTitle, title: code,
    teamA: buildPendingSourceEntry(getFapMatchId(teamASourceCode), `Ganador ${teamASourceCode}`),
    teamB: buildPendingSourceEntry(getFapMatchId(teamBSourceCode), `Ganador ${teamBSourceCode}`),
    teamASourceMatchId: getFapMatchId(teamASourceCode), teamBSourceMatchId: getFapMatchId(teamBSourceCode),
  });
}

function buildFapFinalRound(): BracketRound {
  return {
    id: "round-final", title: "Final",
    matches: [buildBracketMatchFromEntries({
      id: getFapMatchId("P64"), roundTitle: "Final", title: "P64",
      teamA: buildPendingSourceEntry(getFapMatchId("P61"), "Ganador P61"),
      teamB: buildPendingSourceEntry(getFapMatchId("P62"), "Ganador P62"),
      teamASourceMatchId: getFapMatchId("P61"), teamBSourceMatchId: getFapMatchId("P62"),
    })],
  };
}

function isFapSourceToken(value: string): boolean {
  return /^P\d+$/i.test(value.trim());
}

type FapMatchSpec = { code: string; a: string; b: string };

function buildFapDeclarativeMatch(spec: FapMatchSpec, roundTitle: string, entriesBySeed: Record<string, QualifierEntry>): BracketMatch {
  const teamA = String(spec.a || "").trim();
  const teamB = String(spec.b || "").trim();
  const teamASourceMatchId = isFapSourceToken(teamA) ? getFapMatchId(teamA) : "";
  const teamBSourceMatchId = isFapSourceToken(teamB) ? getFapMatchId(teamB) : "";

  return buildBracketMatchFromEntries({
    id: getFapMatchId(spec.code), roundTitle, title: spec.code,
    teamA: teamASourceMatchId ? buildPendingSourceEntry(teamASourceMatchId, `Ganador ${teamA}`) : getSeedEntry(entriesBySeed, teamA),
    teamB: teamBSourceMatchId ? buildPendingSourceEntry(teamBSourceMatchId, `Ganador ${teamB}`) : getSeedEntry(entriesBySeed, teamB),
    teamASourceMatchId, teamBSourceMatchId,
  });
}

type FapTemplate = { pre?: FapMatchSpec[]; integration?: FapMatchSpec[]; quarters?: FapMatchSpec[]; semis?: FapMatchSpec[]; final: FapMatchSpec[] };

function getFapPreRoundTitle(totalPairs: number): string {
  return totalPairs >= 7 && totalPairs <= 11 ? "Cuartos" : "Octavos";
}

function buildFapRoundsFromSpecs(groups: FapTemplate, entriesBySeed: Record<string, QualifierEntry>, totalPairs: number): BracketRound[] {
  const preRoundTitle = getFapPreRoundTitle(totalPairs);
  const roundOrder: [keyof FapTemplate, string, string][] = [
    ["pre", preRoundTitle, preRoundTitle === "Cuartos" ? "round-cuartos" : "round-octavos"],
    ["integration", "Octavos", "round-octavos-integracion"],
    ["quarters", "Cuartos", "round-cuartos"],
    ["semis", "Semifinales", "round-semis"],
    ["final", "Final", "round-final"],
  ];

  return roundOrder
    .map(([key, title, id]) => {
      const specs = groups[key];
      if (!specs || !specs.length) return null;
      return { id, title, matches: specs.map((spec) => buildFapDeclarativeMatch(spec, title, entriesBySeed)) };
    })
    .filter((round): round is BracketRound => Boolean(round));
}

// Tabla de cruces oficiales FAP por cantidad de parejas (6 a 32). Dato fijo,
// copiado literal de la app — no hay algoritmo que lo re-derive.
const FAP_EXTRA_TEMPLATES: Record<number, FapTemplate> = {
  6: { semis: [{ code: "P61", a: "1A", b: "2B" }, { code: "P62", a: "2A", b: "1B" }], final: [{ code: "P64", a: "P61", b: "P62" }] },
  7: {
    pre: [{ code: "P58", a: "3A", b: "2B" }],
    semis: [{ code: "P61", a: "1A", b: "P58" }, { code: "P62", a: "2A", b: "1B" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  8: {
    pre: [{ code: "P58", a: "3A", b: "2B" }, { code: "P59", a: "2A", b: "3B" }],
    semis: [{ code: "P61", a: "1A", b: "P58" }, { code: "P62", a: "P59", b: "1B" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  9: {
    pre: [{ code: "P58", a: "2B", b: "2C" }, { code: "P59", a: "1C", b: "2A" }],
    semis: [{ code: "P61", a: "1A", b: "P58" }, { code: "P62", a: "P59", b: "1B" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  10: {
    pre: [{ code: "P58", a: "2B", b: "2C" }, { code: "P59", a: "1C", b: "2A" }, { code: "P60", a: "3A", b: "1B" }],
    semis: [{ code: "P61", a: "1A", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  11: {
    pre: [
      { code: "P57", a: "1A", b: "3B" }, { code: "P58", a: "2B", b: "2C" },
      { code: "P59", a: "1C", b: "2A" }, { code: "P60", a: "3A", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  12: {
    quarters: [
      { code: "P57", a: "1A", b: "2B" }, { code: "P58", a: "2C", b: "1D" },
      { code: "P59", a: "1C", b: "2D" }, { code: "P60", a: "2A", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  13: {
    pre: [{ code: "P50", a: "3A", b: "2B" }],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "2C", b: "1D" },
      { code: "P59", a: "1C", b: "2D" }, { code: "P60", a: "2A", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  14: {
    pre: [{ code: "P50", a: "3A", b: "2B" }, { code: "P55", a: "2A", b: "3B" }],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "2C", b: "1D" },
      { code: "P59", a: "1C", b: "2D" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  15: {
    pre: [{ code: "P50", a: "2B", b: "2C" }, { code: "P55", a: "2D", b: "2A" }],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "1E", b: "1D" },
      { code: "P59", a: "1C", b: "2E" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  16: {
    pre: [{ code: "P50", a: "2B", b: "2C" }, { code: "P54", a: "3A", b: "2E" }, { code: "P55", a: "2D", b: "2A" }],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "1E", b: "1D" },
      { code: "P59", a: "1C", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  17: {
    pre: [
      { code: "P50", a: "2B", b: "2C" }, { code: "P51", a: "1E", b: "3B" },
      { code: "P54", a: "3A", b: "2E" }, { code: "P55", a: "2D", b: "2A" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "1D" },
      { code: "P59", a: "1C", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  18: {
    pre: [
      { code: "P50", a: "2C", b: "2F" }, { code: "P51", a: "1E", b: "2B" },
      { code: "P54", a: "2A", b: "1F" }, { code: "P55", a: "2E", b: "2D" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "1D" },
      { code: "P59", a: "1C", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  19: {
    pre: [
      { code: "P50", a: "2C", b: "2F" }, { code: "P51", a: "1E", b: "2B" }, { code: "P52", a: "3A", b: "1D" },
      { code: "P54", a: "2A", b: "1F" }, { code: "P55", a: "2E", b: "2D" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "1C", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  20: {
    pre: [
      { code: "P50", a: "2C", b: "2F" }, { code: "P51", a: "1E", b: "2B" }, { code: "P52", a: "3A", b: "1D" },
      { code: "P53", a: "1C", b: "3B" }, { code: "P54", a: "2A", b: "1F" }, { code: "P55", a: "2E", b: "2D" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  21: {
    pre: [
      { code: "P50", a: "2F", b: "2G" }, { code: "P51", a: "1E", b: "2C" }, { code: "P52", a: "2B", b: "1D" },
      { code: "P53", a: "1C", b: "2A" }, { code: "P54", a: "2D", b: "1F" }, { code: "P55", a: "1G", b: "2E" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "1B" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  22: {
    pre: [
      { code: "P50", a: "2F", b: "2G" }, { code: "P51", a: "1E", b: "2C" }, { code: "P52", a: "2B", b: "1D" },
      { code: "P53", a: "1C", b: "2A" }, { code: "P54", a: "2D", b: "1F" }, { code: "P55", a: "1G", b: "2E" },
      { code: "P56", a: "3A", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "1A", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  23: {
    pre: [
      { code: "P49", a: "1A", b: "3B" }, { code: "P50", a: "2F", b: "2G" }, { code: "P51", a: "1E", b: "2C" },
      { code: "P52", a: "2B", b: "1D" }, { code: "P53", a: "1C", b: "2A" }, { code: "P54", a: "2D", b: "1F" },
      { code: "P55", a: "1G", b: "2E" }, { code: "P56", a: "3A", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  24: {
    pre: [
      { code: "P49", a: "1A", b: "2B" }, { code: "P50", a: "2G", b: "1H" }, { code: "P51", a: "1E", b: "2F" },
      { code: "P52", a: "2C", b: "1D" }, { code: "P53", a: "1C", b: "2D" }, { code: "P54", a: "2E", b: "1F" },
      { code: "P55", a: "1G", b: "2H" }, { code: "P56", a: "2A", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  25: {
    pre: [
      { code: "P34", a: "3A", b: "2B" }, { code: "P50", a: "2G", b: "1H" }, { code: "P51", a: "1E", b: "2F" },
      { code: "P52", a: "2C", b: "1D" }, { code: "P53", a: "1C", b: "2D" }, { code: "P54", a: "2E", b: "1F" },
      { code: "P55", a: "1G", b: "2H" }, { code: "P56", a: "2A", b: "1B" },
    ],
    integration: [{ code: "P49", a: "1A", b: "P34" }],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  26: {
    pre: [
      { code: "P34", a: "3A", b: "2B" }, { code: "P50", a: "2G", b: "1H" }, { code: "P51", a: "1E", b: "2F" },
      { code: "P52", a: "2C", b: "1D" }, { code: "P53", a: "1C", b: "2D" }, { code: "P54", a: "2E", b: "1F" },
      { code: "P55", a: "1G", b: "2H" }, { code: "P56", a: "2A", b: "3B" },
    ],
    integration: [{ code: "P49", a: "1A", b: "P34" }],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  27: {
    pre: [
      { code: "P34", a: "2B", b: "2C" }, { code: "P50", a: "1I", b: "1H" }, { code: "P51", a: "1E", b: "2G" },
      { code: "P52", a: "2F", b: "1D" }, { code: "P53", a: "1C", b: "2E" }, { code: "P54", a: "2H", b: "1F" },
      { code: "P55", a: "1G", b: "2I" }, { code: "P47", a: "2D", b: "2A" },
    ],
    integration: [{ code: "P49", a: "1A", b: "P34" }, { code: "P56", a: "P47", b: "1B" }],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  28: {
    pre: [
      { code: "P34", a: "2B", b: "2C" }, { code: "P50", a: "1I", b: "1H" }, { code: "P51", a: "1E", b: "2G" },
      { code: "P52", a: "2F", b: "1D" }, { code: "P42", a: "3A", b: "2E" }, { code: "P54", a: "2H", b: "1F" },
      { code: "P55", a: "1G", b: "2I" }, { code: "P47", a: "2D", b: "2A" },
    ],
    integration: [
      { code: "P49", a: "1A", b: "P34" }, { code: "P53", a: "1C", b: "P42" }, { code: "P56", a: "P47", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  29: {
    pre: [
      { code: "P34", a: "2B", b: "2C" }, { code: "P50", a: "1I", b: "1H" }, { code: "P51", a: "1E", b: "2G" },
      { code: "P39", a: "2F", b: "3B" }, { code: "P42", a: "3A", b: "2E" }, { code: "P54", a: "2H", b: "1F" },
      { code: "P55", a: "1G", b: "2I" }, { code: "P47", a: "2D", b: "2A" },
    ],
    integration: [
      { code: "P49", a: "1A", b: "P34" }, { code: "P52", a: "P39", b: "1D" },
      { code: "P53", a: "1C", b: "P42" }, { code: "P56", a: "P47", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  30: {
    pre: [
      { code: "P34", a: "2C", b: "2F" }, { code: "P50", a: "1I", b: "1H" }, { code: "P51", a: "1E", b: "2J" },
      { code: "P39", a: "2G", b: "2B" }, { code: "P42", a: "2A", b: "2H" }, { code: "P54", a: "2I", b: "1F" },
      { code: "P55", a: "1G", b: "1J" }, { code: "P47", a: "2E", b: "2D" },
    ],
    integration: [
      { code: "P49", a: "1A", b: "P34" }, { code: "P52", a: "P39", b: "1D" },
      { code: "P53", a: "1C", b: "P42" }, { code: "P56", a: "P47", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  31: {
    pre: [
      { code: "P34", a: "2C", b: "2F" }, { code: "P50", a: "1I", b: "1H" }, { code: "P51", a: "1E", b: "2J" },
      { code: "P39", a: "2G", b: "2B" }, { code: "P42", a: "2A", b: "2H" }, { code: "P43", a: "2I", b: "3A" },
      { code: "P55", a: "1G", b: "1J" }, { code: "P47", a: "2E", b: "2D" },
    ],
    integration: [
      { code: "P49", a: "1A", b: "P34" }, { code: "P52", a: "P39", b: "1D" }, { code: "P53", a: "1C", b: "P42" },
      { code: "P54", a: "P43", b: "1F" }, { code: "P56", a: "P47", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
  32: {
    pre: [
      { code: "P34", a: "2C", b: "2F" }, { code: "P50", a: "1I", b: "1H" }, { code: "P38", a: "3B", b: "2J" },
      { code: "P39", a: "2G", b: "2B" }, { code: "P42", a: "2A", b: "2H" }, { code: "P43", a: "2I", b: "3A" },
      { code: "P55", a: "1G", b: "1J" }, { code: "P47", a: "2E", b: "2D" },
    ],
    integration: [
      { code: "P49", a: "1A", b: "P34" }, { code: "P51", a: "1E", b: "P38" }, { code: "P52", a: "P39", b: "1D" },
      { code: "P53", a: "1C", b: "P42" }, { code: "P54", a: "P43", b: "1F" }, { code: "P56", a: "P47", b: "1B" },
    ],
    quarters: [
      { code: "P57", a: "P49", b: "P50" }, { code: "P58", a: "P51", b: "P52" },
      { code: "P59", a: "P53", b: "P54" }, { code: "P60", a: "P55", b: "P56" },
    ],
    semis: [{ code: "P61", a: "P57", b: "P58" }, { code: "P62", a: "P59", b: "P60" }],
    final: [{ code: "P64", a: "P61", b: "P62" }],
  },
};

export function buildFapBracketPreview(
  orderedZones: (ZonePlanningZone & { bracketLetter: string })[],
  pairsByZoneId: Map<string, BracketPair[]>
): BracketPreview | null {
  const totalPairs = orderedZones.reduce((total, zone) => total + (zone.registrationIds?.length || 0), 0);
  const template = FAP_EXTRA_TEMPLATES[totalPairs];
  if (!template) return null;

  const qualifierEntries = buildQualifiedEntriesFromZones(orderedZones, pairsByZoneId, "fap");
  const entriesBySeed = buildApaEntryMap(qualifierEntries);

  return {
    mode: "automatic", ruleSet: "fap", title: "Llave FAP",
    summary: `Formato FAP: cruces oficiales para ${totalPairs} parejas.`,
    recommendation: "Cruces FAP segun posiciones de zona.",
    zonesLinked: orderedZones.map((z) => z.label),
    qualifierLabels: qualifierEntries,
    byeCount: 0,
    rounds: buildFapRoundsFromSpecs(template, entriesBySeed, totalPairs),
  };
}

// ── Dispatcher + progresion de rondas ──────────────────────────────────────

export function buildBracketPreview(
  zones: ZonePlanningZone[],
  pairsByZoneId: Map<string, BracketPair[]>,
  ruleSet: "fap" | "apa"
): BracketPreview | null {
  const orderedZones = orderZonesForBracketRuleSet(zones);
  return ruleSet === "apa" ? buildApaBracketPreview(orderedZones, pairsByZoneId) : buildFapBracketPreview(orderedZones, pairsByZoneId);
}

function resolveAdvanceEntry(match: BracketMatch | undefined, target: "winner" | "loser") {
  const winnerKey = match?.result?.winner;
  if (!winnerKey || !["teamA", "teamB"].includes(winnerKey)) return null;
  const teamKey = target === "winner" ? winnerKey : winnerKey === "teamA" ? "teamB" : "teamA";

  return {
    id: (match as any)[`${teamKey}Id`] || "",
    seed: (match as any)[`${teamKey}Seed`] || "",
    name: (match as any)[`${teamKey}Name`] || "",
    lines: (match as any)[`${teamKey}Lines`] || [],
    isBye: Boolean((match as any)[`${teamKey}IsBye`]),
  };
}

// Propaga ganadores entre rondas via teamASourceMatchId/teamBSourceMatchId
// (FAP/APA siempre los declaran explicitos, no por posicion).
export function applyBracketProgressions(bracketPreview: BracketPreview): BracketPreview {
  const rounds = bracketPreview.rounds.map((round) => ({ ...round, matches: round.matches.map((m) => ({ ...m })) }));
  const resolvedById = new Map<string, BracketMatch>();

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const currentRound = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];

    currentRound.matches.forEach((match) => { if (match.id) resolvedById.set(match.id, match); });

    nextRound.matches = nextRound.matches.map((match) => {
      const sourceA = match.teamASourceMatchId ? resolvedById.get(match.teamASourceMatchId) : undefined;
      const sourceB = match.teamBSourceMatchId ? resolvedById.get(match.teamBSourceMatchId) : undefined;
      const winnerA = resolveAdvanceEntry(sourceA, "winner");
      const winnerB = resolveAdvanceEntry(sourceB, "winner");
      const keepPendingA = Boolean(match.teamASourceMatchId) && !winnerA;
      const keepPendingB = Boolean(match.teamBSourceMatchId) && !winnerB;

      return {
        ...match,
        teamAId: keepPendingA ? match.teamAId : winnerA?.id || "",
        teamASeed: keepPendingA ? match.teamASeed : winnerA?.seed || "",
        teamAName: keepPendingA ? match.teamAName : winnerA?.name || "",
        teamALines: keepPendingA ? match.teamALines : winnerA?.lines || [],
        teamAIsBye: keepPendingA ? match.teamAIsBye : Boolean(winnerA?.isBye),
        teamBId: keepPendingB ? match.teamBId : winnerB?.id || "",
        teamBSeed: keepPendingB ? match.teamBSeed : winnerB?.seed || "",
        teamBName: keepPendingB ? match.teamBName : winnerB?.name || "",
        teamBLines: keepPendingB ? match.teamBLines : winnerB?.lines || [],
        teamBIsBye: keepPendingB ? match.teamBIsBye : Boolean(winnerB?.isBye),
      };
    });
  }

  return { ...bracketPreview, rounds };
}

// ── Horario/cancha para partidos de llave ─────────────────────────────────
// Igual que para zonas, pero con una regla extra: ninguna ronda puede
// empezar antes de que termine la anterior (prevRoundMaxEnd*). Para
// semifinales (penultima ronda) busca una ventana con canchas suficientes
// para jugarlas todas en simultaneo; para el resto, primera cancha libre.
export function assignSchedulesToBracketMatches(
  bracketPreview: BracketPreview,
  venueSchedules: ZoneVenueSchedule[],
  tournamentDayOptions: { key: string; shortLabel: string }[],
  matchDurationMinutes = ZONE_MATCH_DURATION_MINUTES
): { nextBracketPreview: BracketPreview; unassignedCount: number } {
  const bracketSchedules = venueSchedules.filter((s) => s.useForBracket);
  const allSlots = buildZoneMatchSchedulingSlots(bracketSchedules, matchDurationMinutes);
  const usedSlotIds = new Set<string>();
  let unassignedCount = 0;
  let prevRoundMaxEndDayKey = "";
  let prevRoundMaxEndMinutes = 0;

  const rounds = bracketPreview.rounds.map((round, roundIndex) => {
    const roundMinDayKey = prevRoundMaxEndDayKey;
    const roundMinStartMinutes = prevRoundMaxEndMinutes;
    let thisRoundMaxEndDayKey = "";
    let thisRoundMaxEndMinutes = 0;

    const eligibleSlots = allSlots.filter(
      (slot) =>
        !usedSlotIds.has(slot.id) &&
        (!roundMinDayKey || slot.dayKey > roundMinDayKey || (slot.dayKey === roundMinDayKey && slot.startMinutes >= roundMinStartMinutes))
    );

    const timeWindows: (typeof allSlots)[number][][] = [];
    eligibleSlots.forEach((slot) => {
      const last = timeWindows[timeWindows.length - 1];
      if (last && last[0].dayKey === slot.dayKey && last[0].startMinutes === slot.startMinutes) {
        last.push(slot);
      } else {
        timeWindows.push([slot]);
      }
    });

    const isSemisRound = roundIndex === bracketPreview.rounds.length - 2;
    const numPlayable = round.matches.filter((m) => !m.teamAIsBye && !m.teamBIsBye).length;
    const simultaneousWindow = isSemisRound ? timeWindows.find((w) => w.length >= numPlayable) || null : null;

    const assignedSlots = new Map<number, (typeof allSlots)[number]>();
    let windowIndex = 0;
    let windowCourtOffset = 0;

    round.matches.forEach((match, index) => {
      if (match.teamAIsBye || match.teamBIsBye) return;

      let slot: (typeof allSlots)[number] | null = null;

      if (simultaneousWindow) {
        if (windowCourtOffset < simultaneousWindow.length) {
          slot = simultaneousWindow[windowCourtOffset];
          windowCourtOffset += 1;
        }
      } else {
        while (windowIndex < timeWindows.length) {
          if (windowCourtOffset < timeWindows[windowIndex].length) {
            slot = timeWindows[windowIndex][windowCourtOffset];
            windowCourtOffset += 1;
            break;
          }
          windowIndex += 1;
          windowCourtOffset = 0;
        }
      }

      if (!slot) {
        unassignedCount += 1;
        return;
      }

      assignedSlots.set(index, slot);
      usedSlotIds.add(slot.id);
      const slotEnd = slot.startMinutes + matchDurationMinutes;
      if (!thisRoundMaxEndDayKey || slot.dayKey > thisRoundMaxEndDayKey || (slot.dayKey === thisRoundMaxEndDayKey && slotEnd > thisRoundMaxEndMinutes)) {
        thisRoundMaxEndDayKey = slot.dayKey;
        thisRoundMaxEndMinutes = slotEnd;
      }
    });

    const nextMatches = round.matches.map((match, index) => {
      if (match.teamAIsBye || match.teamBIsBye) {
        return { ...match, distributionPending: false, courtLabel: "Cancha pendiente", scheduleLabel: "Horario pendiente", scheduledDayKey: "", scheduledTime: "" };
      }

      const slot = assignedSlots.get(index);

      if (!slot) {
        return { ...match, distributionPending: true, courtLabel: "Cancha pendiente", scheduleLabel: "Horario pendiente", scheduledDayKey: "", scheduledTime: "" };
      }

      const dayLabel = tournamentDayOptions.find((d) => d.key === slot.dayKey)?.shortLabel || slot.dayKey;

      return {
        ...match,
        distributionPending: false,
        courtLabel: `${slot.venueName} · Cancha ${slot.courtIndex}`,
        scheduleLabel: `${dayLabel} · ${formatMinutesToTime(slot.startMinutes)} hs`,
        scheduledDayKey: slot.dayKey,
        scheduledTime: formatMinutesToTime(slot.startMinutes),
      };
    });

    if (thisRoundMaxEndDayKey) {
      prevRoundMaxEndDayKey = thisRoundMaxEndDayKey;
      prevRoundMaxEndMinutes = thisRoundMaxEndMinutes;
    }

    return { ...round, matches: nextMatches };
  });

  return { nextBracketPreview: { ...bracketPreview, rounds }, unassignedCount };
}

// ── Sincronizacion automatica ──────────────────────────────────────────────
// Igual que syncBracketPreviewQualifiedEntries en la app: cuando cambia un
// resultado de zona despues de armada la llave, se reconstruye entera (los
// ids de partido son deterministicos, ej. "apa-qf-1"/"fap-p57") y se
// reinyectan por id los campos que ya se habian cargado (resultado,
// horario/cancha) desde la llave vieja, para no perderlos.
export function syncBracketWithZones(
  previousBracket: BracketPreview,
  zones: ZonePlanningZone[],
  pairsByZoneId: Map<string, BracketPair[]>,
  ruleSet: "fap" | "apa"
): BracketPreview | null {
  const nextBracket = buildBracketPreview(zones, pairsByZoneId, ruleSet);
  if (!nextBracket) return null;

  const previousById = new Map(previousBracket.rounds.flatMap((r) => r.matches).map((m) => [m.id, m]));

  const mergedRounds = nextBracket.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      const previousMatch = previousById.get(match.id);
      if (!previousMatch) return match;
      return {
        ...match,
        courtLabel: previousMatch.courtLabel || match.courtLabel,
        scheduledDayKey: previousMatch.scheduledDayKey || match.scheduledDayKey,
        scheduledTime: previousMatch.scheduledTime || match.scheduledTime,
        scheduleLabel: previousMatch.scheduleLabel || match.scheduleLabel,
        result: previousMatch.result?.winner || previousMatch.result?.sets?.length ? previousMatch.result : match.result,
        resultLabel: previousMatch.result?.winner ? previousMatch.resultLabel : match.resultLabel,
      };
    }),
  }));

  return applyBracketProgressions({ ...nextBracket, rounds: mergedRounds });
}
