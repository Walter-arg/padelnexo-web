import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailabilityWarningForParticipants,
  parseEndTimeToMinutes,
  normalizeZoneVenueSchedules,
  buildZoneMatchSchedulingSlots,
  doScheduleRangesOverlap,
  dateInputToMillis,
  millisToDateInputValue,
} from "../tournamentZones.ts";

test("buildAvailabilityWarningForParticipants: vacio si todas las parejas cargaron esa hora", () => {
  const registrationsById = new Map([
    ["pair-1", { availability: { "2026-03-06": { quickSlots: ["night"], customSlots: [] } } }],
    ["pair-2", { availability: { "2026-03-06": { quickSlots: [], customSlots: [{ from: "19:00", to: "21:00" }] } } }],
  ]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-2"], registrationsById, "2026-03-06", 19 * 60 + 30);
  assert.equal(warning, "");
});

test("buildAvailabilityWarningForParticipants: advierte si alguna pareja no cargo esa hora (caso tipico: organizador agenda fuera de lo que la pareja cargo)", () => {
  const registrationsById = new Map([
    ["pair-1", { availability: { "2026-03-06": { quickSlots: ["morning"], customSlots: [] } } }],
    ["pair-2", { availability: { "2026-03-06": { quickSlots: ["night"], customSlots: [] } } }],
  ]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-2"], registrationsById, "2026-03-06", 19 * 60);
  assert.equal(warning, "Este horario esta fuera de la disponibilidad cargada por alguna de las parejas.");
});

test("buildAvailabilityWarningForParticipants: una pareja sin ficha en el mapa no rompe el chequeo", () => {
  const registrationsById = new Map([["pair-1", { availability: { "2026-03-06": { quickSlots: ["night"], customSlots: [] } } }]]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-missing"], registrationsById, "2026-03-06", 19 * 60);
  assert.equal(warning, "");
});

// ── Regresion: "el selector de horario solo muestra opciones en rojo,
// ninguna libre" (vista previa feature/grilla-disponibilidad-web). La
// causa real: parejas que NUNCA cargaron disponibilidad (muy comun, nada
// las obliga a cargarla) se trataban igual que parejas que SI cargaron
// algo pero no cubre ese horario - as todos los horarios terminaban con
// advertencia, siempre, para cualquier partido donde participe una pareja
// sin disponibilidad cargada.

test("regresion: sin disponibilidad cargada por NINGUNA pareja, ningun horario trae advertencia", () => {
  const registrationsById = new Map([
    ["pair-1", { availability: {} }],
    ["pair-2", { availability: {} }],
  ]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-2"], registrationsById, "2026-03-06", 19 * 60);
  assert.equal(warning, "");
});

test("regresion: una pareja sin disponibilidad cargada para ESE dia (aunque cargo otro dia) no genera advertencia ese dia", () => {
  const registrationsById = new Map([
    ["pair-1", { availability: { "2026-03-07": { quickSlots: ["night"], customSlots: [] } } }], // cargo el sabado, no el viernes
    ["pair-2", { availability: {} }],
  ]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-2"], registrationsById, "2026-03-06", 19 * 60);
  assert.equal(warning, "");
});

test("regresion: si la pareja SI cargo algo para ese dia, la advertencia sigue funcionando igual que antes", () => {
  const registrationsById = new Map([
    ["pair-1", { availability: { "2026-03-06": { quickSlots: ["morning"], customSlots: [] } } }], // solo 08-12
    ["pair-2", { availability: {} }],
  ]);
  const warning = buildAvailabilityWarningForParticipants(["pair-1", "pair-2"], registrationsById, "2026-03-06", 19 * 60);
  assert.equal(warning, "Este horario esta fuera de la disponibilidad cargada por alguna de las parejas.");
});

// ── Regresion: "una franja de cancha que termina a medianoche (00:00)
// desaparece o colapsa a una sola hora". "00:00" como fin de franja
// significa fin del mismo dia (24:00), no el minuto 0.

test("parseEndTimeToMinutes: '00:00' es fin de dia (1440), cualquier otro horario se parsea normal", () => {
  assert.equal(parseEndTimeToMinutes("00:00"), 24 * 60);
  assert.equal(parseEndTimeToMinutes("23:30"), 23 * 60 + 30);
});

test("regresion: normalizeZoneVenueSchedules ya no rechaza una franja que termina a medianoche", () => {
  const result = normalizeZoneVenueSchedules(
    [{ id: "s1", venueId: "v1", dayKey: "2026-03-06", from: "18:00", to: "00:00", courts: 1 }],
    ["2026-03-06"],
    [{ id: "v1", name: "Club Central" }]
  );
  assert.equal(result.length, 1, "la franja 18:00-00:00 tiene que sobrevivir, no quedar rechazada");
  assert.equal(result[0].to, "00:00");
});

test("regresion: buildZoneMatchSchedulingSlots genera horarios para una franja que termina a medianoche", () => {
  const schedule = {
    id: "s1", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-06",
    from: "22:00", to: "00:00", courts: 1, selectedCourtIndices: [1], useForZones: true, useForBracket: false,
  };
  const slots = buildZoneMatchSchedulingSlots([schedule], 75);
  assert.ok(slots.length > 0, "tiene que generar al menos un horario (antes quedaba vacio por el bug de medianoche)");
  assert.equal(slots[0].startMinutes, 22 * 60);
});

// ── Regresion: "en Preferencias solo deja cargar UNA franja por dia y
// sede" (ej. sabado 08-12 Y 16-00). Causa real: handleAddZoneVenueSchedule
// reemplazaba cualquier franja existente de la misma sede+dia en vez de
// agregar al lado. normalizeZoneVenueSchedules nunca dedupeaba por si sola
// (ese filtro vivia solo en el componente), pero se cubre aca para dejar
// constancia de que varias franjas para la misma sede+dia sobreviven la
// normalizacion sin problema.

test("normalizeZoneVenueSchedules: varias franjas para la misma sede y dia sobreviven (no se dedupean)", () => {
  const result = normalizeZoneVenueSchedules(
    [
      { id: "s1", venueId: "v1", dayKey: "2026-03-07", from: "08:00", to: "12:00", courts: 1 },
      { id: "s2", venueId: "v1", dayKey: "2026-03-07", from: "16:00", to: "00:00", courts: 1 },
    ],
    ["2026-03-07"],
    [{ id: "v1", name: "Club Central" }]
  );
  assert.equal(result.length, 2, "las dos franjas del sabado tienen que sobrevivir, no pisarse entre si");
});

test("doScheduleRangesOverlap: dos franjas que se pisan de verdad superponen", () => {
  assert.equal(doScheduleRangesOverlap("08:00", "12:00", "10:00", "14:00"), true);
});

test("doScheduleRangesOverlap: franjas que solo se tocan en la punta (12-16 y 16-20) NO superponen", () => {
  assert.equal(doScheduleRangesOverlap("12:00", "16:00", "16:00", "20:00"), false);
});

test("doScheduleRangesOverlap: una franja que termina a medianoche (00:00) se compara bien, sin falso superposicion con la mañana", () => {
  assert.equal(doScheduleRangesOverlap("16:00", "00:00", "08:00", "12:00"), false);
});

test("doScheduleRangesOverlap: una franja que termina a medianoche SI superpone si de verdad se pisan", () => {
  assert.equal(doScheduleRangesOverlap("16:00", "00:00", "20:00", "22:00"), true);
});

test("buildZoneMatchSchedulingSlots: con dos franjas separadas en el mismo dia (hueco al medio), no se genera ningun horario dentro del hueco", () => {
  const schedules = [
    { id: "s1", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-07", from: "08:00", to: "12:00", courts: 1, selectedCourtIndices: [1], useForZones: true, useForBracket: false },
    { id: "s2", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-07", from: "16:00", to: "00:00", courts: 1, selectedCourtIndices: [1], useForZones: true, useForBracket: false },
  ];
  const slots = buildZoneMatchSchedulingSlots(schedules, 75);
  assert.ok(slots.length > 0, "tiene que generar horarios en ambas franjas");
  const huecoSlots = slots.filter((slot: any) => slot.startMinutes >= 12 * 60 && slot.startMinutes < 16 * 60);
  assert.equal(huecoSlots.length, 0, "no puede haber ningun horario con inicio dentro del hueco (12 a 16)");
});

test("buildZoneMatchSchedulingSlots: un partido no puede empezar dentro de una franja y terminar en el hueco (franja 08-12, duracion 75min, no puede arrancar a las 11:30)", () => {
  const schedules = [
    { id: "s1", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-07", from: "08:00", to: "12:00", courts: 1, selectedCourtIndices: [1], useForZones: true, useForBracket: false },
    { id: "s2", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-07", from: "16:00", to: "00:00", courts: 1, selectedCourtIndices: [1], useForZones: true, useForBracket: false },
  ];
  const slots = buildZoneMatchSchedulingSlots(schedules, 75);
  const crossesIntoGap = slots.some((slot: any) => slot.startMinutes < 12 * 60 && slot.endMinutes > 12 * 60);
  assert.equal(crossesIntoGap, false, "ningun horario generado puede terminar despues de las 12 si empezo antes de las 12 (cruzaria el hueco)");
});

// ── Regresion: "cambio la fecha del torneo a 27/11, guardo, vuelvo a entrar
// y aparece 26/11 (y se corre un dia mas por cada guardado)". Causa real:
// new Date("2026-11-27").setHours(0,0,0,0) interpreta el string como
// medianoche UTC y lo corre un dia al normalizarlo a hora local.

test("regresion: dateInputToMillis + millisToDateInputValue dan ida y vuelta exacta, sin correrse un dia", () => {
  const millis = dateInputToMillis("2026-11-27");
  assert.equal(millisToDateInputValue(millis), "2026-11-27");
});

test("regresion: guardar la misma fecha varias veces seguidas (releer y volver a convertir) no acumula un corrimiento", () => {
  let value = "2026-11-27";
  for (let i = 0; i < 5; i++) {
    const millis = dateInputToMillis(value);
    value = millisToDateInputValue(millis);
  }
  assert.equal(value, "2026-11-27");
});

test("dateInputToMillis: fecha vacia da 0", () => {
  assert.equal(dateInputToMillis(""), 0);
});

test("millisToDateInputValue: 0 o sin valor da string vacio", () => {
  assert.equal(millisToDateInputValue(0), "");
});
