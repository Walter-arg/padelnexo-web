// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\screens\TournamentZonePlanningScreen.js
// (helpers de la grilla nueva de "Armado Manual - Editar": CATEGORY_BAR_COLORS /
// getCategoryColor, getHourColumnsForDay, getTotalLoadedHours, getHoursStatusTag,
// buildZoneLetterMapForZones, sortRegistrationsUnassignedFirst, isSlotAvailable y
// buildAvailabilityAfterCellToggle). En la app estas funciones viven sueltas
// dentro de la pantalla (no en un modulo separado); aca si se separan en su
// propio archivo para que FixtureTab.tsx y AvailabilityGrid.tsx las compartan.
// Cualquier cambio de regla o de numero (el "< 4h" de getHoursStatusTag, los
// horarios de QUICK_SLOT_DEFINITIONS, el criterio de ordenamiento) tiene que
// replicarse tambien alla, y viceversa.
//
// Tests: lib/__tests__/availabilityGrid.test.ts. Si se agrega un test
// equivalente del lado de la app, usar los mismos casos.

// Nota: no se importa lib/tournamentZones.ts aca a proposito (mismo criterio
// que lib/scheduleValidation.ts): este modulo queda sin dependencias propias
// del proyecto, asi el test corre con el loader nativo de Node sin tocar
// extensiones de import, y el helper se puede mover/portar sin arrastrar el
// resto de tournamentZones.ts. parseTimeToMinutes/formatMinutesToTime son
// una copia exacta de las de tournamentZones.ts.
function parseTimeToMinutes(value = ""): number {
  const [hour = "0", minute = "0"] = String(value).split(":");
  return Number.parseInt(hour, 10) * 60 + Number.parseInt(minute, 10);
}

function formatMinutesToTime(totalMinutes = 0): string {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60) % 24;
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type DayOption = { key: string; label?: string; shortLabel?: string };

export type VenueScheduleForHours = { dayKey: string; from: string; to: string };

export type HourColumn = { minutes: number; label: string };

export type ZoneForLetterMap = { label?: string; registrationIds?: string[] };

export type HoursStatusTag = { tone: "danger" | "warning" | "success"; label: string };

export type AvailabilityDaySlots = { quickSlots?: string[]; customSlots?: { from: string; to: string }[] };
export type Availability = Record<string, AvailabilityDaySlots>;

// Color fijo por categoria (barra de encabezado + casilleros), distinto de
// PAIR_COLORS que es por pareja dentro de una categoria.
export const CATEGORY_BAR_COLORS = ["#1B5D92", "#0F5F37", "#895A00", "#5B3EA0", "#146C68", "#9B314B"];

export function getCategoryColor(index = 0): string {
  return CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length];
}

// Columnas de hora de la grilla: salen de la disponibilidad de sedes
// configurada para el dia elegido (no de un rango fijo). Si hay mas de una
// franja sin pisarse, se toma el rango que va desde la mas temprana a la mas
// tardia (las horas intermedias sin cancha configurada quedan igual como
// columna, simplemente no van a tener partidos ahi).
export function getHourColumnsForDay(venueSchedules: VenueScheduleForHours[] = [], dayKey = ""): HourColumn[] {
  const daySchedules = venueSchedules.filter((schedule) => schedule.dayKey === dayKey);
  if (!daySchedules.length) return [];

  const minFrom = Math.min(...daySchedules.map((schedule) => parseTimeToMinutes(schedule.from)));
  // "00:00" como fin de franja significa "hasta la medianoche" (fin del
  // mismo dia): tomado literal (minuto 0) una franja que termina a
  // medianoche colapsaba a una sola columna en vez de cubrir todo el rango.
  const maxTo = Math.max(...daySchedules.map((schedule) => (schedule.to === "00:00" ? 24 * 60 : parseTimeToMinutes(schedule.to))));
  const startHour = Math.floor(minFrom / 60);
  const endHour = Math.max(startHour + 1, Math.ceil(maxTo / 60));
  const columns: HourColumn[] = [];

  for (let hour = startHour; hour < endHour; hour += 1) {
    const normalizedHour = ((hour % 24) + 24) % 24;
    columns.push({ minutes: hour * 60, label: `${String(normalizedHour).padStart(2, "0")}:00` });
  }

  return columns;
}

const QUICK_SLOT_DEFINITIONS: { key: string; from: string; to: string }[] = [
  { key: "morning", from: "08:00", to: "12:00" },
  { key: "afternoon", from: "12:00", to: "18:00" },
  { key: "night", from: "18:00", to: "23:00" },
  { key: "late_night", from: "23:00", to: "02:00" },
];

// Horas totales cargadas por una pareja, sumando TODOS los dias (no solo el
// dia seleccionado), para el diagnostico "Sin horario / < 4h / >= 4h".
export function getTotalLoadedHours(registration: { availability?: Availability } = {}): number {
  const availability = registration?.availability || {};
  let totalMinutes = 0;

  Object.values(availability).forEach((dayValue) => {
    (dayValue?.quickSlots || []).forEach((slotKey) => {
      const definition = QUICK_SLOT_DEFINITIONS.find((slot) => slot.key === slotKey);
      if (!definition) return;
      const from = parseTimeToMinutes(definition.from);
      let to = parseTimeToMinutes(definition.to);
      if (to <= from) to += 24 * 60;
      totalMinutes += to - from;
    });

    (Array.isArray(dayValue?.customSlots) ? dayValue.customSlots : []).forEach((slot) => {
      const from = parseTimeToMinutes(slot.from);
      let to = parseTimeToMinutes(slot.to);
      if (to <= from) to += 24 * 60;
      totalMinutes += Math.max(0, to - from);
    });
  });

  return totalMinutes / 60;
}

export function getHoursStatusTag(totalHours = 0): HoursStatusTag {
  if (totalHours <= 0) {
    return { tone: "danger", label: "Sin horario" };
  }

  const label = `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} h`;

  if (totalHours < 4) {
    return { tone: "warning", label };
  }

  return { tone: "success", label };
}

const ZONE_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function buildZoneLetterMapForZones(zones: ZoneForLetterMap[] = []): Map<string, string> {
  const map = new Map<string, string>();

  zones.forEach((zone, zoneIndex) => {
    const label = String(zone?.label || "").trim();
    const letterMatch = label.match(/zona\s+([a-z0-9]+)/i);
    const letter = (letterMatch?.[1] || ZONE_LETTERS[zoneIndex] || `${zoneIndex + 1}`).toUpperCase();

    (zone.registrationIds || []).forEach((registrationId) => {
      map.set(String(registrationId), letter);
    });
  });

  return map;
}

// Parejas sin zona primero, luego las asignadas agrupadas por letra de zona.
export function sortRegistrationsUnassignedFirst<T extends { id: string }>(
  registrations: T[] = [],
  assignedIds: Set<string>,
  zoneLetterMap: Map<string, string>
): T[] {
  return [...registrations].sort((first, second) => {
    const firstAssigned = assignedIds.has(first.id);
    const secondAssigned = assignedIds.has(second.id);

    if (firstAssigned !== secondAssigned) {
      return firstAssigned ? 1 : -1;
    }

    if (firstAssigned && secondAssigned) {
      const firstLetter = zoneLetterMap.get(String(first.id)) || "";
      const secondLetter = zoneLetterMap.get(String(second.id)) || "";
      const comparison = firstLetter.localeCompare(secondLetter, "es", { numeric: true, sensitivity: "base" });
      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  });
}

// Disponibilidad puntual de una pareja en un horario (hora redonda), con el
// mismo manejo de franjas "overnight" (ej. 23:00-02:00) que la app.
export function isSlotAvailable(
  registration: { availability?: Availability } = {},
  dayKey = "",
  slotMinutes = 0
): boolean {
  const availability = registration?.availability?.[dayKey] || {};
  const quickRanges = (availability.quickSlots || [])
    .map((slotKey) => QUICK_SLOT_DEFINITIONS.find((slot) => slot.key === slotKey))
    .filter((slot): slot is { key: string; from: string; to: string } => Boolean(slot))
    .map((slot) => ({ from: slot.from, to: slot.to }));
  const customRanges = Array.isArray(availability.customSlots) ? availability.customSlots : [];

  return [...quickRanges, ...customRanges].some((range) => {
    const fromMinutes = parseTimeToMinutes(range.from);
    let toMinutes = parseTimeToMinutes(range.to);

    if (toMinutes <= fromMinutes) {
      toMinutes += 24 * 60;
    }

    return slotMinutes >= fromMinutes && slotMinutes < toMinutes;
  });
}

function uniqueStrings(values: string[] = []): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCustomSlot(slot: { from?: string; to?: string } = {}): { from: string; to: string } | null {
  const from = String(slot.from || "").trim();
  const to = String(slot.to || "").trim();

  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from === to) {
    return null;
  }

  return { from, to };
}

function dedupeCustomSlots(slots: { from: string; to: string }[] = []): { from: string; to: string }[] {
  const uniqueMap = new Map<string, { from: string; to: string }>();

  slots.forEach((slot) => {
    const normalized = normalizeCustomSlot(slot);
    if (!normalized) return;
    uniqueMap.set(`${normalized.from}-${normalized.to}`, normalized);
  });

  return [...uniqueMap.values()].sort(
    (first, second) => parseTimeToMinutes(first.from) - parseTimeToMinutes(second.from)
  );
}

function normalizeTournamentAvailability(rawAvailability: Availability = {}, dayOptions: DayOption[] = []): Availability {
  const allowedDayKeys = new Set(dayOptions.map((day) => day.key).filter(Boolean));
  const validQuickSlotKeys = new Set(QUICK_SLOT_DEFINITIONS.map((slot) => slot.key));
  const result: Availability = {};

  dayOptions.forEach((day) => {
    const dayValue = rawAvailability?.[day.key] || {};
    const quickSlots = uniqueStrings(dayValue.quickSlots || []).filter((slotKey) => validQuickSlotKeys.has(slotKey));
    const customSlots = dedupeCustomSlots(dayValue.customSlots);

    if (!allowedDayKeys.has(day.key) || (!quickSlots.length && !customSlots.length)) {
      return;
    }

    result[day.key] = { quickSlots, customSlots };
  });

  return result;
}

function addTournamentCustomSlot(
  availability: Availability = {},
  dayKey: string,
  slot: { from: string; to: string },
  dayOptions: DayOption[] = []
): Availability {
  const next = normalizeTournamentAvailability(availability, dayOptions);
  const currentDay = next[dayKey] || { quickSlots: [], customSlots: [] };
  next[dayKey] = { ...currentDay, customSlots: dedupeCustomSlots([...(currentDay.customSlots || []), slot]) };
  return normalizeTournamentAvailability(next, dayOptions);
}

// Pinta o despinta una hora puntual en la disponibilidad de una pareja,
// partiendo cualquier franja (rapida o personalizada) que la cubra, para no
// perder el resto de esa franja.
export function buildAvailabilityAfterCellToggle(
  registration: { availability?: Availability } = {},
  dayKey: string,
  hourMinutes: number,
  tournamentDayOptions: DayOption[] = []
): Availability {
  const availability = registration?.availability || {};
  const wasAvailable = isSlotAvailable(registration, dayKey, hourMinutes);

  if (!wasAvailable) {
    return addTournamentCustomSlot(
      availability,
      dayKey,
      { from: formatMinutesToTime(hourMinutes), to: formatMinutesToTime(hourMinutes + 60) },
      tournamentDayOptions
    );
  }

  const normalized = normalizeTournamentAvailability(availability, tournamentDayOptions);
  const currentDay = normalized[dayKey] || { quickSlots: [], customSlots: [] };
  const hourEnd = hourMinutes + 60;
  const remainingQuickSlots: string[] = [];
  const splitCustomSlots: { from: string; to: string }[] = [];

  const touchesHour = (fromMinutes: number, toMinutes: number): boolean => {
    let normalizedTo = toMinutes;
    if (normalizedTo <= fromMinutes) normalizedTo += 24 * 60;
    return hourMinutes < normalizedTo && hourEnd > fromMinutes;
  };

  (currentDay.quickSlots || []).forEach((slotKey) => {
    const definition = QUICK_SLOT_DEFINITIONS.find((slot) => slot.key === slotKey);
    if (!definition) return;
    const from = parseTimeToMinutes(definition.from);
    const to = parseTimeToMinutes(definition.to);

    if (!touchesHour(from, to)) {
      remainingQuickSlots.push(slotKey);
      return;
    }

    if (from < hourMinutes) {
      splitCustomSlots.push({ from: definition.from, to: formatMinutesToTime(hourMinutes) });
    }
    if (parseTimeToMinutes(definition.to) > hourEnd || to <= from) {
      splitCustomSlots.push({ from: formatMinutesToTime(hourEnd), to: definition.to });
    }
  });

  const remainingCustomSlots: { from: string; to: string }[] = [];

  (currentDay.customSlots || []).forEach((slot) => {
    const from = parseTimeToMinutes(slot.from);
    const to = parseTimeToMinutes(slot.to);

    if (!touchesHour(from, to)) {
      remainingCustomSlots.push(slot);
      return;
    }

    if (from < hourMinutes) {
      splitCustomSlots.push({ from: slot.from, to: formatMinutesToTime(hourMinutes) });
    }
    if (to > hourEnd || to <= from) {
      splitCustomSlots.push({ from: formatMinutesToTime(hourEnd), to: slot.to });
    }
  });

  normalized[dayKey] = {
    quickSlots: remainingQuickSlots,
    customSlots: [...remainingCustomSlots, ...splitCustomSlots],
  };

  return normalizeTournamentAvailability(normalized, tournamentDayOptions);
}

// Solo web: la app mantiene las categorias hermanas en solo lectura (no
// hace falta distinguir de que categoria es una pareja seleccionada), pero
// en la web ahora se puede armar zona en CUALQUIER categoria del evento
// desde la misma pantalla, asi que el id de una pareja sola no alcanza para
// identificarla (dos categorias distintas podrian, en teoria, tener el
// mismo id si se llegaran a comparar mal). Se usa una clave compuesta.
export function buildPairSelectionKey(tournamentId: string, registrationId: string): string {
  return `${tournamentId}::${registrationId}`;
}

export function parsePairSelectionKey(key: string): { tournamentId: string; registrationId: string } {
  const [tournamentId, registrationId] = key.split("::");
  return { tournamentId: tournamentId || "", registrationId: registrationId || "" };
}
