// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\utils\scheduleValidation.js
// (version app, React Native). Cualquier cambio de regla o de mensaje aca
// tiene que replicarse tambien alla, y viceversa, para que app y web validen
// exactamente igual. Los tests (casos a-f) tienen que ser los mismos en los
// dos: lib/__tests__/scheduleValidation.test.ts <-> src/utils/__tests__/scheduleValidation.test.js.
//
// Modulo unico de validacion de horarios de partidos de zona, usado por
// FixtureTab.tsx (Armado Manual - Editar y Armado Automatico). No decide
// nada sobre como se arman las zonas ni sobre los cruces (eso sigue en
// tournamentZones.ts, en buildZoneMatchRows / getPlanningMatchPairNumbers,
// etc). Este modulo solo sabe de tiempo: dado un horario candidato y lo que
// ya esta ocupado, dice si hay conflicto y por que.
//
// Nada de esto bloquea: el organizador puede pisar un partido a proposito
// para reprogramar el otro despues. Este modulo solo informa para que cada
// pantalla pida confirmacion y, una vez guardado, siga mostrando el partido
// en conflicto hasta que se resuelva (recalculando esto mismo contra el
// estado actual).
//
// Es deliberadamente "puro": no importa React, Firestore ni nada de
// tournamentZones.ts. El llamador resuelve sus propios ids de participantes,
// sus propias labels y su propia advertencia de disponibilidad (ya tiene su
// forma de leer disponibilidad cargada) y le pasa a este modulo datos
// simples.

export const DEFAULT_MATCH_DURATION_MINUTES = 75;
// Descanso minimo entre partidos de una misma pareja/cancha. Por ahora se usa
// 0 (sin descanso obligatorio); queda como parametro para poder sumarlo mas
// adelante (ej. configurable en Preferencias) sin tocar esta funcion.
export const DEFAULT_REST_MINUTES = 0;

export function formatMinutesToTime(totalMinutes = 0): string {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60) % 24;
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export type MatchExcludeKey = {
  tournamentId?: string;
  zoneId?: string;
  matchKey?: string;
};

function isSameMatchEntry(entry: OccupancyEntry, excludeKey?: MatchExcludeKey | null): boolean {
  if (!excludeKey) {
    return false;
  }

  return (
    String(entry.tournamentId || "") === String(excludeKey.tournamentId || "") &&
    String(entry.zoneId || "") === String(excludeKey.zoneId || "") &&
    String(entry.matchKey || "") === String(excludeKey.matchKey || "")
  );
}

export type ScheduledMatch = {
  tournamentId?: string;
  zoneId?: string;
  matchKey?: string;
  categoryLabel?: string;
  zoneLabel?: string;
  dayKey: string;
  startMinutes: number;
  venueId?: string;
  courtIndex?: number;
  // Ids de las 2 parejas (puede ir vacio para partidos de otra categoria: una
  // pareja nunca puede estar en 2 categorias del mismo evento, asi que esos
  // partidos solo importan para la ocupacion de cancha, nunca para la de
  // pareja).
  participantIds?: string[];
};

type OccupancyEntry = {
  tournamentId: string;
  zoneId: string;
  matchKey: string;
  categoryLabel: string;
  zoneLabel: string;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  venueId: string;
  courtIndex: number;
};

export type ScheduleOccupancy = {
  byCourt: Map<string, OccupancyEntry[]>;
  byPair: Map<string, OccupancyEntry[]>;
};

export function buildScheduleOccupancy(
  scheduledMatches: ScheduledMatch[] = [],
  matchDurationMinutes: number = DEFAULT_MATCH_DURATION_MINUTES
): ScheduleOccupancy {
  const byCourt = new Map<string, OccupancyEntry[]>();
  const byPair = new Map<string, OccupancyEntry[]>();

  scheduledMatches.forEach((match) => {
    if (!match || !match.dayKey || !Number.isFinite(Number(match.startMinutes))) {
      return;
    }

    const startMinutes = Number(match.startMinutes);
    const entry: OccupancyEntry = {
      tournamentId: match.tournamentId || "",
      zoneId: match.zoneId || "",
      matchKey: match.matchKey || "",
      categoryLabel: match.categoryLabel || "",
      zoneLabel: match.zoneLabel || "",
      dayKey: match.dayKey,
      startMinutes,
      endMinutes: startMinutes + matchDurationMinutes,
      venueId: match.venueId || "",
      courtIndex: Number(match.courtIndex || 0),
    };

    if (entry.venueId && entry.courtIndex > 0) {
      const courtKey = `${entry.dayKey}|${entry.venueId}|${entry.courtIndex}`;
      if (!byCourt.has(courtKey)) {
        byCourt.set(courtKey, []);
      }
      byCourt.get(courtKey)!.push(entry);
    }

    (Array.isArray(match.participantIds) ? match.participantIds : []).forEach((pairId) => {
      if (!pairId) {
        return;
      }
      if (!byPair.has(pairId)) {
        byPair.set(pairId, []);
      }
      byPair.get(pairId)!.push(entry);
    });
  });

  return { byCourt, byPair };
}

export type MatchDependency = {
  dayKey: string;
  endMinutes: number;
};

export type ValidateMatchSlotArgs = {
  dayKey: string;
  startMinutes: number;
  venueId?: string;
  courtIndex?: number;
  participantIds?: string[];
  excludeKey?: MatchExcludeKey | null;
  occupancy?: ScheduleOccupancy;
  matchDurationMinutes?: number;
  restMinutes?: number;
  // Para zonas de 4 (G vs G / P vs P), los partidos de ida de esa misma zona
  // que ya tienen horario. Si un partido de ida todavia no tiene horario
  // asignado, el llamador simplemente no lo incluye aca (no hay nada que
  // marcar como conflicto por un dato que no existe).
  dependsOn?: MatchDependency[];
  // { [pairId]: "Nombre / Nombre" } solo para armar el mensaje.
  pairLabelsById?: Record<string, string>;
  // String ya resuelta por el llamador ("" si no hay advertencia). Este
  // modulo no sabe leer disponibilidad cargada: cada pantalla ya tiene su
  // propia forma de resolverla.
  availabilityWarning?: string;
};

export type ValidateMatchSlotResult = {
  hasConflict: boolean;
  conflictReason: string;
  availabilityWarning: string;
};

// Valida un horario candidato (o ya guardado) para UN partido puntual. Nunca
// bloquea: devuelve { hasConflict, conflictReason, availabilityWarning } para
// que el llamador decida como confirmarlo y como mostrarlo.
//
// excludeKey: identifica el propio partido que se esta agendando/revisando,
// para no chocar contra su propio horario ya guardado. Tambien sirve para
// revisar un partido YA guardado (pasandole su propio dayKey/startMinutes/
// venueId/courtIndex): el conflicto se recalcula contra el resto de la
// ocupacion, como si fuera un candidato.
export function validateMatchSlot({
  dayKey,
  startMinutes,
  venueId = "",
  courtIndex = 0,
  participantIds = [],
  excludeKey = null,
  occupancy,
  matchDurationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
  restMinutes = DEFAULT_REST_MINUTES,
  dependsOn = [],
  pairLabelsById = {},
  availabilityWarning = "",
}: ValidateMatchSlotArgs): ValidateMatchSlotResult {
  const startMin = Number(startMinutes) || 0;
  const endMin = startMin + matchDurationMinutes;
  const safeOccupancy: ScheduleOccupancy = occupancy || { byCourt: new Map(), byPair: new Map() };

  // a) Cancha: rango completo (inicio -> inicio+duracion), contando los
  // partidos de todas las categorias hermanas del evento.
  if (venueId && Number(courtIndex || 0) > 0) {
    const courtKey = `${dayKey}|${venueId}|${Number(courtIndex)}`;
    const courtEntries = (safeOccupancy.byCourt.get(courtKey) || []).filter(
      (entry) => !isSameMatchEntry(entry, excludeKey)
    );
    const courtConflict = courtEntries.find(
      (entry) => entry.dayKey === dayKey && rangesOverlap(startMin, endMin, entry.startMinutes, entry.endMinutes)
    );

    if (courtConflict) {
      const who = courtConflict.categoryLabel
        ? `${courtConflict.categoryLabel} · ${courtConflict.zoneLabel || "otro partido"}`
        : courtConflict.zoneLabel || "otro partido";

      return {
        hasConflict: true,
        conflictReason: `Cancha ${courtConflict.courtIndex} ocupada por ${who} hasta las ${formatMinutesToTime(courtConflict.endMinutes)}`,
        availabilityWarning: "",
      };
    }
  }

  // b) Pareja: no puede tener dos partidos de zona superpuestos (con
  // descanso minimo, si se configura mas adelante).
  for (const pairId of participantIds) {
    const entries = (safeOccupancy.byPair.get(pairId) || []).filter(
      (entry) => !isSameMatchEntry(entry, excludeKey)
    );
    const conflict = entries.find(
      (entry) =>
        entry.dayKey === dayKey &&
        rangesOverlap(startMin, endMin, entry.startMinutes - restMinutes, entry.endMinutes + restMinutes)
    );

    if (conflict) {
      const label = pairLabelsById[pairId] || "Una de las parejas";
      return {
        hasConflict: true,
        conflictReason: `${label} esta jugando hasta las ${formatMinutesToTime(conflict.endMinutes)}`,
        availabilityWarning: "",
      };
    }
  }

  // c) Zonas de 4: G vs G / P vs P deben empezar despues de que terminen los
  // dos partidos de ida (mas descanso).
  const sameDayDependencies = dependsOn.filter((dependency) => dependency && dependency.dayKey === dayKey);
  if (sameDayDependencies.length) {
    const earliestAllowed =
      Math.max(...sameDayDependencies.map((dependency) => Number(dependency.endMinutes) || 0)) + restMinutes;

    if (startMin < earliestAllowed) {
      return {
        hasConflict: true,
        conflictReason: `Este cruce depende de los partidos de ida de la zona: no puede empezar antes de las ${formatMinutesToTime(earliestAllowed)}`,
        availabilityWarning: "",
      };
    }
  }

  // d) Disponibilidad cargada: advertencia confirmable, nunca conflicto.
  return { hasConflict: false, conflictReason: "", availabilityWarning: availabilityWarning || "" };
}

export type SlotCandidate = {
  dayKey: string;
  startMinutes: number;
  venueId?: string;
  courtIndex?: number;
  [key: string]: unknown;
};

// Anota una lista de slots candidatos (cada uno con dayKey/startMinutes/
// venueId/courtIndex) con el resultado de validateMatchSlot, sin sacar nada
// de la lista: el llamador siempre muestra todas las opciones, marcando las
// que tienen conflicto o advertencia con su motivo.
export function annotateSlotCandidates<T extends SlotCandidate>(
  slots: T[] = [],
  context: Omit<ValidateMatchSlotArgs, "dayKey" | "startMinutes" | "venueId" | "courtIndex"> = {}
): (T & ValidateMatchSlotResult)[] {
  return slots.map((slot) => ({
    ...slot,
    ...validateMatchSlot({
      ...context,
      dayKey: slot.dayKey,
      startMinutes: slot.startMinutes,
      venueId: slot.venueId,
      courtIndex: slot.courtIndex,
    }),
  }));
}
