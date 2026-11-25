// Portado desde src/screens/TournamentFixtureScreen.js (app movil). Esta es
// la logica real de armado de zonas de torneo: horarios de cancha
// disponibles (zoneVenueSchedules), el molde de zonas segun cantidad de
// parejas (APA/FAP/presets fijos) y el reparto automatico de parejas por
// zona segun su disponibilidad declarada. Todo vive en
// tournament.fixtureSetup.zonePlanning, no en subcolecciones.

export type ZoneVenueSchedule = {
  id: string;
  venueId: string;
  venueName: string;
  dayKey: string;
  from: string;
  to: string;
  courts: number;
  selectedCourtIndices: number[];
  useForZones: boolean;
  useForBracket: boolean;
};

export type ZoneTemplate = { id: string; name: string; size: number; qualifiers: number };

export type FixtureRecommendation = {
  zoneSizes: number[];
  qualifierSizes: number[];
  qualifierCount: number;
  bracketSize: number;
  zoneTemplates: ZoneTemplate[];
  qualifiedSummary: string;
  bracketSummary: string;
  note: string;
  bracketTitle: string;
};

export type ZonePlanningZone = {
  id: string;
  label: string;
  registrationIds: string[];
  matchSchedules: Record<string, any>;
};

export type ZonePlanning = {
  confirmed?: boolean;
  status?: string;
  updatedAtMillis?: number;
  zones: ZonePlanningZone[];
};

// ── Horarios / tiempo ─────────────────────────────────────────────────────

export function isValidTimeString(value = ""): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

export function parseTimeToMinutes(value = ""): number {
  const normalized = String(value || "").trim();
  if (!isValidTimeString(normalized)) return 0;
  const [hours, minutes] = normalized.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes = 0): string {
  const safeMinutes = Math.max(Math.round(Number(totalMinutes || 0)), 0) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const ZONE_MATCH_DURATION_MINUTES = 75;
export const AVAILABILITY_EXTENSION_MINUTES = 90;

// Duracion de partido, mismo formato "h:mm" que usa la app (ej "1:15" = 75 min)
export function normalizeTypedTimeInput(value = ""): string {
  const sanitized = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);

  if (sanitized.includes(":")) {
    return sanitized;
  }

  const digitsOnly = sanitized.replace(/\D/g, "");

  if (digitsOnly.length <= 2) {
    return digitsOnly;
  }

  return `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}`;
}

export function parseMatchDurationToMinutes(value = ""): number {
  const trimmed = String(value || "").trim();

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes] = trimmed.split(":").map((item) => Number.parseInt(item, 10));
    return Math.max(hours * 60 + minutes, 15);
  }

  const numericValue = Number.parseInt(trimmed.replace(/\D/g, ""), 10);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : ZONE_MATCH_DURATION_MINUTES;
}

export function formatMatchDurationValue(totalMinutes = ZONE_MATCH_DURATION_MINUTES): string {
  const safeMinutes = Math.max(Number(totalMinutes || 0), 15);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

// ── zoneVenueSchedules ─────────────────────────────────────────────────────

export function normalizeZoneVenueSchedules(
  entries: any[] = [],
  tournamentDayKeys: string[] = [],
  venues: { id: string; name: string }[] = []
): ZoneVenueSchedule[] {
  const allowedDayKeys = new Set(tournamentDayKeys);
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const venueId = String(entry?.venueId || "").trim();
      const venue = venuesById.get(venueId);
      const dayKey = String(entry?.dayKey || "").trim();
      const from = String(entry?.from || "").trim();
      const to = String(entry?.to || "").trim();
      const courts = Math.max(Number.parseInt(String(entry?.courts || "0"), 10) || 0, 1);
      const rawIndices = Array.isArray(entry?.selectedCourtIndices)
        ? entry.selectedCourtIndices.filter((n: any) => Number.isInteger(n) && n >= 1 && n <= 50)
        : null;
      const selectedCourtIndices = rawIndices?.length
        ? [...rawIndices].sort((a, b) => a - b)
        : Array.from({ length: courts }, (_, i) => i + 1);

      if (!venueId || !venue || !allowedDayKeys.has(dayKey) || !isValidTimeString(from) || !isValidTimeString(to)) {
        return null;
      }
      if (parseTimeToMinutes(to) <= parseTimeToMinutes(from)) {
        return null;
      }

      return {
        id: String(entry?.id || `zone-schedule-${index + 1}`),
        venueId,
        venueName: venue.name || `Sede ${index + 1}`,
        dayKey,
        from,
        to,
        courts: selectedCourtIndices.length,
        selectedCourtIndices,
        useForZones: Boolean(entry?.useForZones),
        useForBracket: Boolean(entry?.useForBracket),
      };
    })
    .filter(Boolean) as ZoneVenueSchedule[];
}

export function buildTournamentDayOptions(startDateMillis = 0, endDateMillis = 0, maxDays = 30) {
  if (!startDateMillis || !endDateMillis || endDateMillis < startDateMillis) return [];
  const days: { key: string; label: string; shortLabel: string }[] = [];
  const cursor = new Date(startDateMillis);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDateMillis);
  end.setHours(0, 0, 0, 0);

  for (let i = 0; cursor.getTime() <= end.getTime() && i < maxDays; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({
      key,
      label: cursor.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }),
      shortLabel: cursor.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function buildZoneMatchSchedulingSlots(schedules: ZoneVenueSchedule[] = [], durationMinutes = ZONE_MATCH_DURATION_MINUTES) {
  const slots: any[] = [];

  schedules.forEach((schedule) => {
    const startMinutes = parseTimeToMinutes(schedule.from);
    const endMinutes = parseTimeToMinutes(schedule.to);
    if (endMinutes - startMinutes < durationMinutes) return;

    const courtIndices = schedule.selectedCourtIndices?.length
      ? schedule.selectedCourtIndices
      : Array.from({ length: schedule.courts || 1 }, (_, i) => i + 1);

    for (let currentMinutes = startMinutes; currentMinutes + durationMinutes <= endMinutes; currentMinutes += durationMinutes) {
      for (const courtIndex of courtIndices) {
        slots.push({
          id: `${schedule.id}-${courtIndex}-${currentMinutes}`,
          scheduleId: schedule.id,
          venueId: schedule.venueId,
          venueName: schedule.venueName,
          courtIndex,
          dayKey: schedule.dayKey,
          startMinutes: currentMinutes,
          endMinutes: currentMinutes + durationMinutes,
          timeLabel: `${formatMinutesToTime(currentMinutes)} hs`,
        });
      }
    }
  });

  const seenPhysical = new Set<string>();
  const deduped = slots.filter((slot) => {
    const key = `${slot.dayKey}|${slot.startMinutes}|${slot.venueId}|${slot.courtIndex}`;
    if (seenPhysical.has(key)) return false;
    seenPhysical.add(key);
    return true;
  });

  return deduped.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey, "es");
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.venueName !== b.venueName) return a.venueName.localeCompare(b.venueName, "es");
    return a.courtIndex - b.courtIndex;
  });
}

// ── Molde de zonas segun cantidad de parejas ──────────────────────────────

function getApaZoneCount(totalPairs = 0): number {
  if (totalPairs >= 6 && totalPairs <= 8) return 2;
  if (totalPairs >= 9 && totalPairs <= 11) return 3;
  if (totalPairs >= 12 && totalPairs <= 14) return 4;
  if (totalPairs >= 15 && totalPairs <= 17) return 5;
  if (totalPairs >= 18 && totalPairs <= 20) return 6;
  if (totalPairs >= 21 && totalPairs <= 23) return 7;
  if (totalPairs >= 24 && totalPairs <= 26) return 8;
  if (totalPairs >= 27 && totalPairs <= 29) return 9;
  if (totalPairs >= 30 && totalPairs <= 32) return 10;
  return 0;
}

function distributeZoneSizes(totalPairs: number, zoneCount: number): number[] {
  if (!zoneCount) return [];
  const baseSize = Math.max(Math.floor(totalPairs / zoneCount), 2);
  const remainder = totalPairs - baseSize * zoneCount;
  return Array.from({ length: zoneCount }, (_, index) => baseSize + (remainder > 0 && index < remainder ? 1 : 0));
}

function buildApaZoneSizes(totalPairs = 0): number[] {
  return distributeZoneSizes(totalPairs, getApaZoneCount(totalPairs));
}

const FAP_ZONE_COUNT_BY_PAIRS: Record<number, number> = {
  6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 4, 15: 5, 16: 5, 17: 5,
  18: 6, 19: 6, 20: 6, 21: 7, 22: 7, 23: 7, 24: 8, 25: 8, 26: 8, 27: 9, 28: 9, 29: 9,
  30: 10, 31: 10, 32: 10,
};

function buildFapZoneSizes(totalPairs = 0): number[] {
  return distributeZoneSizes(totalPairs, FAP_ZONE_COUNT_BY_PAIRS[totalPairs] || 0);
}

const FAP_QUALIFIER_SIZES_BY_PAIRS: Record<number, number[]> = {
  6: [2, 2], 7: [3, 2], 8: [3, 3], 9: [2, 2, 2], 10: [3, 2, 2], 11: [3, 3, 2],
  12: [2, 2, 2, 2], 13: [3, 2, 2, 2], 14: [3, 3, 2, 2], 15: [2, 2, 2, 2, 2],
  16: [3, 2, 2, 2, 2], 17: [3, 3, 2, 2, 2], 18: [2, 2, 2, 2, 2, 2], 19: [3, 2, 2, 2, 2, 2],
  20: [3, 3, 2, 2, 2, 2], 21: [2, 2, 2, 2, 2, 2, 2], 22: [3, 2, 2, 2, 2, 2, 2],
  23: [3, 3, 2, 2, 2, 2, 2], 24: [2, 2, 2, 2, 2, 2, 2, 2], 25: [3, 2, 2, 2, 2, 2, 2, 2],
  26: [3, 3, 2, 2, 2, 2, 2, 2], 27: [2, 2, 2, 2, 2, 2, 2, 2, 2], 28: [3, 2, 2, 2, 2, 2, 2, 2, 2],
  29: [3, 3, 2, 2, 2, 2, 2, 2, 2], 30: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  31: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2], 32: [3, 3, 2, 2, 2, 2, 2, 2, 2, 2],
};

function buildFapQualifierSizes(totalPairs = 0, zoneCount = 0): number[] {
  return FAP_QUALIFIER_SIZES_BY_PAIRS[totalPairs] || Array.from({ length: zoneCount }, () => 2);
}

function orderZoneSizesWithQualifiers(zoneSizes: number[] = [], qualifierSizes: number[] = []) {
  return zoneSizes
    .map((size, index) => ({ originalIndex: index, qualifiers: Number(qualifierSizes[index] || 2), size: Number(size || 0) }))
    .sort((first, second) => {
      const firstRank = first.size === 4 ? 0 : first.size === 2 ? 2 : 1;
      const secondRank = second.size === 4 ? 0 : second.size === 2 ? 2 : 1;
      if (firstRank !== secondRank) return firstRank - secondRank;
      if (second.size !== first.size) return second.size - first.size;
      return first.originalIndex - second.originalIndex;
    });
}

function buildZoneTemplates(zoneSizes: number[] = [], qualifierSizes: number[] = []): ZoneTemplate[] {
  return zoneSizes.map((size, index) => ({
    id: `zone-${index + 1}`,
    name: `Zona ${String.fromCharCode(65 + index)}`,
    size,
    qualifiers: Number(qualifierSizes[index] || 2),
  }));
}

type Preset = {
  zoneSizes: number[];
  qualifierSizes?: number[];
  qualifierCount?: number;
  bracketSize?: number;
  byeCount?: number;
  directAdvanceCount?: number;
  qualifiedSummary: string;
  bracketSummary: string;
  bracketTitle: string;
};

// Tabla fija de moldes de zona por cantidad de parejas (6 a 12), copiada
// tal cual de la app (presets en resolveFixtureRecommendation).
const FIXED_PRESETS: Record<number, { strict: Preset; flex: Preset }> = {
  6: {
    strict: { zoneSizes: [3, 3], qualifierSizes: [2, 2], qualifierCount: 4, bracketSize: 4, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Semifinales directas.", bracketTitle: "Semifinales" },
    flex: { zoneSizes: [3, 3], qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Semifinales directas.", bracketTitle: "Semifinales" },
  },
  7: {
    strict: { zoneSizes: [4, 3], qualifierSizes: [2, 2], qualifierCount: 4, bracketSize: 4, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Semifinales directas.", bracketTitle: "Semifinales" },
    flex: { zoneSizes: [4, 3], qualifierSizes: [3, 2], qualifierCount: 5, bracketSize: 8, byeCount: 3, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 en la zona de 3 y 3 en la zona de 4.", bracketSummary: "Llave larga con bye para las mejores ubicadas.", bracketTitle: "Llave de 8 con bye" },
  },
  8: {
    strict: { zoneSizes: [4, 4], qualifierSizes: [2, 2], qualifierCount: 4, bracketSize: 4, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Semifinales directas.", bracketTitle: "Semifinales" },
    flex: { zoneSizes: [3, 3, 2], qualifierSizes: [2, 2, 2], qualifierCount: 6, bracketSize: 8, byeCount: 2, directAdvanceCount: 2, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Los 2 mejores 1ros avanzan a semifinales y las otras 4 parejas juegan cuartos.", bracketTitle: "Cuartos + semifinales" },
  },
  9: {
    strict: { zoneSizes: [3, 3, 3], qualifierSizes: [2, 2, 2], qualifierCount: 6, bracketSize: 8, byeCount: 2, directAdvanceCount: 2, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Los 2 mejores 1ros avanzan a semifinales y las otras 4 parejas juegan cuartos.", bracketTitle: "Cuartos + semifinales" },
    flex: { zoneSizes: [3, 3, 3], qualifierSizes: [2, 2, 2], qualifierCount: 6, bracketSize: 8, byeCount: 2, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Llave de 8 con bye para las mejores ubicadas.", bracketTitle: "Llave de 8 con bye" },
  },
  10: {
    strict: { zoneSizes: [3, 3, 4], qualifierSizes: [2, 2, 2], qualifierCount: 6, bracketSize: 8, byeCount: 2, directAdvanceCount: 2, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Los 2 mejores 1ros avanzan a semifinales y las otras 4 parejas juegan cuartos.", bracketTitle: "Cuartos + semifinales" },
    flex: { zoneSizes: [3, 3, 4], qualifierSizes: [2, 2, 3], qualifierCount: 7, bracketSize: 8, byeCount: 1, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 en las zonas de 3 y 3 en la zona de 4.", bracketSummary: "Llave de 8 con 1 bye para la mejor ubicada.", bracketTitle: "Llave de 8 con bye" },
  },
  11: {
    strict: { zoneSizes: [3, 3, 3, 2], qualifierSizes: [2, 2, 2, 2], qualifierCount: 8, bracketSize: 8, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona. En la zona de 2 ambas parejas clasifican y el partido define 1ro y 2do.", bracketSummary: "Cuartos de final.", bracketTitle: "Cuartos" },
    flex: { zoneSizes: [3, 3, 3, 2], qualifierSizes: [2, 2, 2, 2], qualifierCount: 8, bracketSize: 8, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona. En la zona de 2 ambas parejas clasifican y el partido define 1ro y 2do.", bracketSummary: "Cuartos de final.", bracketTitle: "Cuartos" },
  },
  12: {
    strict: { zoneSizes: [3, 3, 3, 3], qualifierSizes: [2, 2, 2, 2], qualifierCount: 8, bracketSize: 8, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Cuartos de final.", bracketTitle: "Cuartos" },
    flex: { zoneSizes: [3, 3, 3, 3], qualifierSizes: [2, 2, 2, 2], qualifierCount: 8, bracketSize: 8, byeCount: 0, directAdvanceCount: 0, qualifiedSummary: "Clasifican 2 por zona.", bracketSummary: "Cuartos de final.", bracketTitle: "Cuartos" },
  },
};

export function resolveFixtureRecommendation(
  pairCount = 0,
  pathType: "strict" | "flex" = "strict",
  ruleSet: "apa" | "fap" | "manual" = "fap"
): FixtureRecommendation {
  const path = pathType === "flex" ? "flex" : "strict";
  const totalPairs = Number(pairCount || 0);

  if (totalPairs < 6) {
    return {
      zoneSizes: [], zoneTemplates: [], qualifierSizes: [], qualifierCount: 0, bracketSize: 0,
      qualifiedSummary: "Todavia no hay suficientes parejas confirmadas para recomendar zonas.",
      bracketSummary: "Se necesitan al menos 6 parejas confirmadas.",
      note: "Completa el cupo minimo antes de crear el fixture.",
      bracketTitle: "Pendiente",
    };
  }

  if (ruleSet === "apa") {
    const rawZoneSizes = buildApaZoneSizes(totalPairs);
    const orderedZones = orderZoneSizesWithQualifiers(rawZoneSizes, rawZoneSizes.map(() => 2));
    const zoneSizes = orderedZones.map((zone) => zone.size);
    const qualifierSizes = orderedZones.map((zone) => zone.qualifiers);

    if (zoneSizes.length) {
      return {
        zoneSizes, qualifierSizes,
        qualifierCount: qualifierSizes.reduce((total, count) => total + count, 0),
        bracketSize: zoneSizes.length >= 9 ? 16 : zoneSizes.length >= 4 ? 8 : 4,
        zoneTemplates: buildZoneTemplates(zoneSizes, qualifierSizes),
        qualifiedSummary: "Clasifican 2 por zona segun molde APA.",
        bracketSummary: "La llave se arma con el molde APA correspondiente a la cantidad de parejas.",
        note: "La app respeta los cruces APA cargados para este rango de parejas.",
        bracketTitle: "Llave APA",
      };
    }
  }

  if (ruleSet === "fap") {
    const rawZoneSizes = buildFapZoneSizes(totalPairs);
    const rawQualifierSizes = buildFapQualifierSizes(totalPairs, rawZoneSizes.length);
    const orderedZones = orderZoneSizesWithQualifiers(rawZoneSizes, rawQualifierSizes);
    const zoneSizes = orderedZones.map((zone) => zone.size);
    const qualifierSizes = orderedZones.map((zone) => zone.qualifiers);

    if (zoneSizes.length) {
      return {
        zoneSizes, qualifierSizes,
        qualifierCount: qualifierSizes.reduce((total, count) => total + count, 0),
        bracketSize: 16,
        zoneTemplates: buildZoneTemplates(zoneSizes, qualifierSizes),
        qualifiedSummary: "Clasifican segun molde FAP para esta cantidad de parejas.",
        bracketSummary: "La llave se arma con el molde FAP correspondiente.",
        note: "La app respeta los cruces FAP cargados para este rango de parejas.",
        bracketTitle: "Llave FAP",
      };
    }
  }

  const selectedPreset = FIXED_PRESETS[totalPairs]?.[path];

  if (selectedPreset) {
    return {
      zoneSizes: selectedPreset.zoneSizes,
      qualifierSizes: selectedPreset.qualifierSizes || selectedPreset.zoneSizes.map(() => 2),
      qualifierCount: selectedPreset.qualifierCount ?? selectedPreset.zoneSizes.length * 2,
      bracketSize: selectedPreset.bracketSize ?? 8,
      zoneTemplates: buildZoneTemplates(selectedPreset.zoneSizes, selectedPreset.qualifierSizes || selectedPreset.zoneSizes.map(() => 2)),
      qualifiedSummary: selectedPreset.qualifiedSummary,
      bracketSummary: selectedPreset.bracketSummary,
      bracketTitle: selectedPreset.bracketTitle,
      note:
        path === "strict"
          ? "La app prioriza menos cruces y una salida mas directa del torneo."
          : "La app prioriza que mas parejas sigan en competencia usando bye cuando haga falta.",
    };
  }

  const zoneSizes: number[] = [];
  let remainingPairs = totalPairs;
  while (remainingPairs > 0) {
    if (remainingPairs === 4 || remainingPairs === 2) {
      zoneSizes.push(remainingPairs);
      remainingPairs = 0;
    } else {
      zoneSizes.push(3);
      remainingPairs -= 3;
    }
  }

  return {
    zoneSizes,
    qualifierSizes: zoneSizes.map(() => 2),
    qualifierCount: path === "strict" ? Math.min(8, zoneSizes.length * 2) : Math.min(16, zoneSizes.length * 2),
    bracketSize: path === "strict" ? 8 : 16,
    zoneTemplates: buildZoneTemplates(zoneSizes, zoneSizes.map(() => 2)),
    qualifiedSummary: path === "strict" ? "Clasifican menos parejas y se prioriza una llave corta." : "Clasifican mas parejas y se usan bye cuando haga falta.",
    bracketSummary: path === "strict" ? "Se recomienda una llave corta con prioridad para los 1ros de zona." : "Se recomienda una llave larga con continuidad deportiva.",
    note: path === "strict" ? "La app prioriza zonas de 3, luego una de 4 y solo en ultimo recurso una de 2." : "La app prioriza que menos parejas queden eliminadas directamente.",
    bracketTitle: path === "strict" ? "Llave corta" : "Llave larga",
  };
}

// ── Reparto de parejas en zonas segun disponibilidad ──────────────────────

const QUICK_SLOT_MINUTE_RANGES: Record<string, { from: number; to: number }> = {
  morning: { from: 8 * 60, to: 12 * 60 },
  afternoon: { from: 12 * 60, to: 18 * 60 },
  night: { from: 18 * 60, to: 23 * 60 },
  late_night: { from: 23 * 60, to: 26 * 60 },
};

function getDayTimeRanges(dayAvailability: any = {}) {
  const ranges: { from: number; to: number }[] = [];
  (dayAvailability?.quickSlots || []).forEach((key: string) => {
    const r = QUICK_SLOT_MINUTE_RANGES[key];
    if (r) ranges.push(r);
  });
  (dayAvailability?.customSlots || []).forEach((slot: any) => {
    const from = parseTimeToMinutes(slot.from);
    const to = parseTimeToMinutes(slot.to);
    if (to > from) ranges.push({ from, to });
  });
  return ranges;
}

function getTotalAvailabilityMinutes(availability: any = {}): number {
  return Object.values(availability || {}).reduce((total: number, day: any) => {
    return total + getDayTimeRanges(day).reduce((sum, r) => sum + (r.to - r.from), 0);
  }, 0);
}

function computeAvailabilityCompatibilityScore(availA: any = {}, availB: any = {}): number {
  const daysA = Object.keys(availA);
  if (!daysA.length || !Object.keys(availB).length) return 0;
  let score = 0;
  daysA.forEach((dayKey) => {
    if (!availB[dayKey]) return;
    score += 1;
    const rangesA = getDayTimeRanges(availA[dayKey]);
    const rangesB = getDayTimeRanges(availB[dayKey]);
    rangesA.forEach((ra) => {
      rangesB.forEach((rb) => {
        score += Math.max(0, Math.min(ra.to, rb.to) - Math.max(ra.from, rb.from));
      });
    });
  });
  return score;
}

export function groupRegistrationsByAvailability(registrations: any[], zoneTemplates: ZoneTemplate[]) {
  const sorted = [...registrations].sort((a, b) => {
    const minsA = getTotalAvailabilityMinutes(a.availability);
    const minsB = getTotalAvailabilityMinutes(b.availability);
    if (minsA === 0 && minsB === 0) return (a.pairLabel || "").localeCompare(b.pairLabel || "", "es");
    if (minsA === 0) return 1;
    if (minsB === 0) return -1;
    return minsA !== minsB ? minsA - minsB : (a.pairLabel || "").localeCompare(b.pairLabel || "", "es");
  });
  const assignedIds = new Set<string>();
  const result: any[] = [];

  zoneTemplates.forEach((template) => {
    const size = Number(template.size || 0);
    const group: any[] = [];

    for (let i = 0; i < sorted.length && group.length < size; i++) {
      if (!assignedIds.has(sorted[i].id) && group.length === 0) {
        group.push(sorted[i]);
        assignedIds.add(sorted[i].id);
        break;
      }
    }

    while (group.length < size) {
      let bestScore = -1;
      let bestIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (assignedIds.has(sorted[i].id)) continue;
        const rawScore = group.reduce(
          (sum, member) => sum + computeAvailabilityCompatibilityScore(sorted[i].availability || {}, member.availability || {}),
          0
        );
        const isFlexible = getTotalAvailabilityMinutes(sorted[i].availability || {}) === 0;
        const score = rawScore > 0 ? rawScore : isFlexible ? 0.5 : 0;
        if (score > bestScore || bestIdx === -1) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      group.push(sorted[bestIdx]);
      assignedIds.add(sorted[bestIdx].id);
    }

    result.push(...group);
  });

  sorted.forEach((r) => { if (!assignedIds.has(r.id)) result.push(r); });
  return result;
}

export function buildAutomaticZonePlanning(registrations: any[] = [], recommendation: FixtureRecommendation): ZonePlanning {
  const zoneTemplates = recommendation.zoneTemplates || [];
  const sorted = groupRegistrationsByAvailability(registrations, zoneTemplates);
  let cursor = 0;

  return {
    confirmed: true,
    updatedAtMillis: Date.now(),
    zones: zoneTemplates.map((template, index) => {
      const size = Number(template.size || 0);
      const pairs = sorted.slice(cursor, cursor + size);
      cursor += size;

      return {
        id: template.id || `zone-${index + 1}`,
        label: template.name || `Zona ${String.fromCharCode(65 + index)}`,
        matchSchedules: {},
        registrationIds: pairs.map((registration) => registration.id),
      };
    }),
  };
}

// ── Partidos dentro de una zona ───────────────────────────────────────────

export function isRegistrationConfirmed(registration: any = {}, tournament: any = {}): boolean {
  if (registration?.withdrawalStatus === "confirmed" || registration?.status === "rejected") return false;
  if (registration?.status === "confirmed" || registration?.confirmedAt) return true;

  const payments = Array.isArray(registration?.payments) ? registration.payments : [];
  const approvedCount = payments.filter((p: any) => p?.status === "approved").length;
  const pairConfirmationMode = String(tournament?.pairConfirmationMode || "").trim().toLowerCase();
  const requiresPayment = Number(tournament?.entryFee || 0) > 0;

  if (pairConfirmationMode === "none") return true;
  if (!requiresPayment && pairConfirmationMode !== "manual") return true;
  if (pairConfirmationMode === "one_paid") return approvedCount >= 1;
  if (pairConfirmationMode === "both_paid") return payments.length > 0 && approvedCount >= payments.length;
  return false;
}

export function getZoneQualifiersCount(ruleSet = "fap", pairCount = 0): number {
  if (ruleSet === "fap" && Number(pairCount || 0) === 4) return 3;
  return Math.min(2, Number(pairCount || 0));
}

export function buildPlanningMatchLabels(pairCount = 0): string[] {
  if (pairCount === 2) return ["1 vs 2"];
  if (pairCount === 3) return ["1 vs 2", "1 vs 3", "2 vs 3"];
  if (pairCount === 4) return ["1 vs 2", "3 vs 4", "G vs G", "P vs P"];
  return [];
}

// ── Disponibilidad para asignar horario a un partido ──────────────────────

function expandAvailabilityWindowsForDay(dayAvailability: any = {}) {
  const windows: { fromMinutes: number; toMinutes: number }[] = [];
  (dayAvailability?.quickSlots || []).forEach((key: string) => {
    const r = QUICK_SLOT_MINUTE_RANGES[key];
    if (r) windows.push({ fromMinutes: r.from, toMinutes: r.to });
  });
  (dayAvailability?.customSlots || []).forEach((slot: any) => {
    const from = parseTimeToMinutes(slot?.from ?? slot?.startTime ?? slot?.start ?? "");
    const to = parseTimeToMinutes(slot?.to ?? slot?.endTime ?? slot?.end ?? "");
    if (to > from) windows.push({ fromMinutes: from, toMinutes: to });
  });
  return windows;
}

// Pareja sin ninguna disponibilidad cargada -> se la considera disponible
// siempre (eligio coordinar por chat, no restringe el picker).
export function isPairAvailableForSlot(
  availability: any = {},
  dayKey = "",
  slotStartMinutes = 0,
  slotEndMinutes = 0,
  extensionMinutes = 0
): boolean {
  if (!Object.keys(availability || {}).length) return true;
  const dayAvailability = availability?.[dayKey];
  if (!dayAvailability) return false;
  const windows = expandAvailabilityWindowsForDay(dayAvailability);
  if (!windows.length) return false;

  return windows.some(
    (w) => slotStartMinutes >= w.fromMinutes - extensionMinutes && slotEndMinutes <= w.toMinutes + extensionMinutes
  );
}

// Equivalente a buildAutoMatchSchedules: asigna dia/horario/cancha a cada
// partido numerico (no a "G vs G"/"P vs P", que dependen de resultados que
// todavia no existen) cruzando la disponibilidad real de ambas parejas y
// evitando que una misma pareja juegue 2 partidos superpuestos.
export function buildAutoMatchSchedules(
  zones: ZonePlanningZone[],
  registrationsById: Map<string, any>,
  venueSchedules: ZoneVenueSchedule[],
  matchDurationMinutes = ZONE_MATCH_DURATION_MINUTES
): { zones: ZonePlanningZone[]; unassignedCount: number } {
  const slots = buildZoneMatchSchedulingSlots(venueSchedules, matchDurationMinutes);
  if (!slots.length) return { zones, unassignedCount: 0 };

  const usedSlotIds = new Set<string>();
  const pairOccupancy = new Map<string, any[]>();
  let unassignedCount = 0;

  const overlaps = (a: any, b: any) => a.dayKey === b.dayKey && a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;

  const scheduledZones = zones.map((zone) => {
    const pairCount = zone.registrationIds.length;
    const matchLabels = buildPlanningMatchLabels(pairCount);
    const matchSchedules = { ...(zone.matchSchedules || {}) };

    matchLabels.forEach((matchLabel) => {
      const parts = matchLabel.match(/^(\d+)\s+vs\s+(\d+)$/i);
      if (!parts) return;

      const idA = zone.registrationIds[Number(parts[1]) - 1];
      const idB = zone.registrationIds[Number(parts[2]) - 1];
      if (!idA || !idB) return;

      const availA = registrationsById.get(idA)?.availability || {};
      const availB = registrationsById.get(idB)?.availability || {};
      const occA = pairOccupancy.get(idA) || [];
      const occB = pairOccupancy.get(idB) || [];

      const findCandidates = (extensionMinutes: number) =>
        slots.filter(
          (slot) =>
            !usedSlotIds.has(slot.id) &&
            !occA.some((u) => overlaps(slot, u)) &&
            !occB.some((u) => overlaps(slot, u)) &&
            isPairAvailableForSlot(availA, slot.dayKey, slot.startMinutes, slot.endMinutes, extensionMinutes) &&
            isPairAvailableForSlot(availB, slot.dayKey, slot.startMinutes, slot.endMinutes, extensionMinutes)
        );

      const strictCandidates = findCandidates(0);
      const extendedCandidates = strictCandidates.length ? strictCandidates : findCandidates(AVAILABILITY_EXTENSION_MINUTES);
      const candidates = extendedCandidates.length ? extendedCandidates : findCandidates(AVAILABILITY_EXTENSION_MINUTES * 2);

      if (!candidates.length) {
        unassignedCount++;
        return;
      }

      const allOcc = [...occA, ...occB];
      candidates.sort((a, b) => {
        const aVenue = allOcc.filter((u) => u.venueId === a.venueId).length;
        const bVenue = allOcc.filter((u) => u.venueId === b.venueId).length;
        if (bVenue !== aVenue) return bVenue - aVenue;
        if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        return a.courtIndex - b.courtIndex;
      });

      const chosen = candidates[0];
      usedSlotIds.add(chosen.id);
      pairOccupancy.set(idA, [...occA, chosen]);
      pairOccupancy.set(idB, [...occB, chosen]);

      matchSchedules[matchLabel] = {
        ...(matchSchedules[matchLabel] || {}),
        dayKey: chosen.dayKey,
        startTime: formatMinutesToTime(chosen.startMinutes),
        venueId: chosen.venueId,
        courtIndex: chosen.courtIndex || 0,
      };
    });

    return { ...zone, matchSchedules };
  });

  return { zones: scheduledZones, unassignedCount };
}

// Equivalente a buildAutoMatchSchedules, pero para eventos multi-categoria:
// en vez de asignar los partidos zona por zona en el orden en que vienen,
// junta TODOS los partidos de TODAS las categorias del evento en una sola
// bolsa y los ordena por disponibilidad mas restringida primero, para que
// ninguna categoria se quede sin cancha por haber sido procesada despues.
// Cada zona debe venir con un campo __tournamentId que identifique a que
// torneo/categoria pertenece, para poder separar el resultado por categoria
// al guardar.
export function buildAutoMatchSchedulesAcrossZones(
  zones: (ZonePlanningZone & { __tournamentId: string })[],
  registrationsById: Map<string, any>,
  venueSchedules: ZoneVenueSchedule[],
  matchDurationMinutes = ZONE_MATCH_DURATION_MINUTES
): { zones: (ZonePlanningZone & { __tournamentId: string })[]; unassignedCount: number } {
  const slots = buildZoneMatchSchedulingSlots(venueSchedules, matchDurationMinutes);
  if (!slots.length) return { zones, unassignedCount: 0 };

  const usedSlotIds = new Set<string>();
  const pairOccupancy = new Map<string, any[]>();
  let unassignedCount = 0;

  const overlaps = (a: any, b: any) => a.dayKey === b.dayKey && a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;

  const pendingMatches: { zone: ZonePlanningZone & { __tournamentId: string }; matchLabel: string; idA: string; idB: string }[] = [];
  zones.forEach((zone) => {
    const matchLabels = buildPlanningMatchLabels(zone.registrationIds.length);
    matchLabels.forEach((matchLabel) => {
      const parts = matchLabel.match(/^(\d+)\s+vs\s+(\d+)$/i);
      if (!parts) return;
      const idA = zone.registrationIds[Number(parts[1]) - 1];
      const idB = zone.registrationIds[Number(parts[2]) - 1];
      if (!idA || !idB) return;
      pendingMatches.push({ zone, matchLabel, idA, idB });
    });
  });

  const restrictionScore = ({ idA, idB }: { idA: string; idB: string }) => {
    const minsA = getTotalAvailabilityMinutes(registrationsById.get(idA)?.availability || {});
    const minsB = getTotalAvailabilityMinutes(registrationsById.get(idB)?.availability || {});
    // Sin disponibilidad cargada = flexible (puede jugar cuando sea), se procesa al final
    return Math.min(minsA || Infinity, minsB || Infinity);
  };

  pendingMatches.sort((a, b) => restrictionScore(a) - restrictionScore(b));

  const matchSchedulesByZoneKey = new Map<string, Record<string, any>>();

  pendingMatches.forEach(({ zone, matchLabel, idA, idB }) => {
    const availA = registrationsById.get(idA)?.availability || {};
    const availB = registrationsById.get(idB)?.availability || {};
    const occA = pairOccupancy.get(idA) || [];
    const occB = pairOccupancy.get(idB) || [];

    const findCandidates = (extensionMinutes: number) =>
      slots.filter(
        (slot) =>
          !usedSlotIds.has(slot.id) &&
          !occA.some((u) => overlaps(slot, u)) &&
          !occB.some((u) => overlaps(slot, u)) &&
          isPairAvailableForSlot(availA, slot.dayKey, slot.startMinutes, slot.endMinutes, extensionMinutes) &&
          isPairAvailableForSlot(availB, slot.dayKey, slot.startMinutes, slot.endMinutes, extensionMinutes)
      );

    const strictCandidates = findCandidates(0);
    const extendedCandidates = strictCandidates.length ? strictCandidates : findCandidates(AVAILABILITY_EXTENSION_MINUTES);
    const candidates = extendedCandidates.length ? extendedCandidates : findCandidates(AVAILABILITY_EXTENSION_MINUTES * 2);

    if (!candidates.length) {
      unassignedCount++;
      return;
    }

    const allOcc = [...occA, ...occB];
    candidates.sort((a, b) => {
      const aVenue = allOcc.filter((u) => u.venueId === a.venueId).length;
      const bVenue = allOcc.filter((u) => u.venueId === b.venueId).length;
      if (bVenue !== aVenue) return bVenue - aVenue;
      if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.courtIndex - b.courtIndex;
    });

    const chosen = candidates[0];
    usedSlotIds.add(chosen.id);
    pairOccupancy.set(idA, [...occA, chosen]);
    pairOccupancy.set(idB, [...occB, chosen]);

    const zoneKey = `${zone.__tournamentId}:${zone.id}`;
    if (!matchSchedulesByZoneKey.has(zoneKey)) {
      matchSchedulesByZoneKey.set(zoneKey, { ...(zone.matchSchedules || {}) });
    }
    matchSchedulesByZoneKey.get(zoneKey)![matchLabel] = {
      dayKey: chosen.dayKey,
      startTime: formatMinutesToTime(chosen.startMinutes),
      venueId: chosen.venueId,
      courtIndex: chosen.courtIndex || 0,
    };
  });

  const scheduledZones = zones.map((zone) => {
    const zoneKey = `${zone.__tournamentId}:${zone.id}`;
    return { ...zone, matchSchedules: matchSchedulesByZoneKey.get(zoneKey) || zone.matchSchedules || {} };
  });

  return { zones: scheduledZones, unassignedCount };
}

// Slots ya ocupados por OTRO partido (de cualquier zona) en el mismo
// dia+hora+sede+cancha, para que el picker manual no los vuelva a ofrecer.
export function getOccupiedSlotKeys(zones: ZonePlanningZone[], excludeZoneId = "", excludeMatchKey = ""): Set<string> {
  const occupied = new Set<string>();
  zones.forEach((zone) => {
    Object.entries(zone.matchSchedules || {}).forEach(([matchKey, schedule]: [string, any]) => {
      if (zone.id === excludeZoneId && matchKey === excludeMatchKey) return;
      if (!schedule?.dayKey || !schedule?.startTime || !schedule?.venueId) return;
      occupied.add(`${schedule.dayKey}|${parseTimeToMinutes(schedule.startTime)}|${schedule.venueId}|${schedule.courtIndex || 0}`);
    });
  });
  return occupied;
}

// Resuelve, para "G vs G" / "P vs P" (semis cruzadas de una zona de 4), que
// 2 numeros de pareja (1-based) corresponden realmente segun los
// resultados ya cargados de "1 vs 2" y "3 vs 4".
export function getPlanningMatchPairNumbers(zone: ZonePlanningZone, registrationIds: string[], matchLabel: string): string[] {
  const directParts = String(matchLabel || "").match(/^(\d+)\s+vs\s+(\d+)$/i);
  if (directParts) return [directParts[1], directParts[2]];

  if (registrationIds.length !== 4 || !["G vs G", "P vs P"].includes(matchLabel)) return [];

  const openingMatches = ["1 vs 2", "3 vs 4"].map((openingMatchLabel) => {
    const openingParts = openingMatchLabel.match(/^(\d+)\s+vs\s+(\d+)$/i);
    const openingParticipantIds = openingParts
      ? [registrationIds[Number(openingParts[1]) - 1], registrationIds[Number(openingParts[2]) - 1]]
      : [];
    const winnerId = String(zone.matchSchedules?.[openingMatchLabel]?.result?.winnerRegistrationId || "");
    const winnerIndex = openingParticipantIds.findIndex((id) => String(id || "") === winnerId);

    if (!openingParts || winnerIndex < 0) return null;

    return { loser: openingParts[winnerIndex === 0 ? 2 : 1], winner: openingParts[winnerIndex + 1] };
  });

  if (openingMatches.some((entry) => !entry)) return [];

  return matchLabel === "G vs G"
    ? openingMatches.map((entry) => entry!.winner)
    : openingMatches.map((entry) => entry!.loser);
}
