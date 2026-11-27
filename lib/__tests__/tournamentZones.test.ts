import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailabilityWarningForParticipants,
  parseEndTimeToMinutes,
  normalizeZoneVenueSchedules,
  buildZoneMatchSchedulingSlots,
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
