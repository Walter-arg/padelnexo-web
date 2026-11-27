// Regresion para "el armado automatico nunca debe dejar un partido sin
// horario": antes, cuando no encontraba un horario ideal (cancha y parejas
// libres, dentro de la disponibilidad cargada), simplemente no agendaba ese
// partido (quedaba con recuadro rojo, sin horario). Ahora SIEMPRE asigna
// algo, con 3 niveles de prioridad (ver pickScheduleSlotForMatch en
// tournamentZones.ts): ideal -> libre ignorando disponibilidad -> el de
// menos choques si no hay ningun horario libre.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoMatchSchedules,
  buildAutoMatchSchedulesAcrossZones,
  type ZonePlanningZone,
  type ZoneVenueSchedule,
} from "../tournamentZones.ts";

function makeZone(id: string, label: string, registrationIds: string[]): ZonePlanningZone {
  return { id, label, registrationIds, matchSchedules: {} };
}

function makeVenueSchedule(dayKey: string, from: string, to: string, courts = 1): ZoneVenueSchedule {
  return {
    id: `s-${dayKey}-${from}`, venueId: "v1", venueName: "Club Central", dayKey, from, to,
    courts, selectedCourtIndices: Array.from({ length: courts }, (_, i) => i + 1),
    useForZones: true, useForBracket: false,
  };
}

test("buildAutoMatchSchedules: con disponibilidad amplia, todos los partidos quedan agendados sin advertencias", () => {
  const registrationsById = new Map<string, any>([
    ["p1", { availability: {} }], ["p2", { availability: {} }], ["p3", { availability: {} }], ["p4", { availability: {} }],
  ]);
  const zones = [makeZone("zone-a", "Zona A", ["p1", "p2", "p3", "p4"])];
  const venueSchedules = [makeVenueSchedule("2026-03-06", "09:00", "23:00", 2)];

  const { zones: scheduled, unassignedCount, needsReviewCount } = buildAutoMatchSchedules(zones, registrationsById, venueSchedules, 75);

  assert.equal(unassignedCount, 0);
  assert.equal(needsReviewCount, 0);
  const matchSchedules = scheduled[0].matchSchedules;
  for (const matchKey of ["1 vs 2", "3 vs 4"]) {
    assert.ok(matchSchedules[matchKey]?.dayKey, `${matchKey} deberia tener dayKey`);
    assert.ok(matchSchedules[matchKey]?.startTime, `${matchKey} deberia tener startTime`);
    assert.ok(matchSchedules[matchKey]?.venueId, `${matchKey} deberia tener venueId`);
  }
});

test("buildAutoMatchSchedules: si las dos parejas cargaron disponibilidad que nunca coincide, el partido se agenda igual (nivel 2) y queda contado como needsReview", () => {
  const registrationsById = new Map<string, any>([
    // p1 solo de mañana, p2 solo de noche: nunca coinciden en el mismo horario.
    ["p1", { availability: { "2026-03-06": { quickSlots: ["morning"], customSlots: [] } } }],
    ["p2", { availability: { "2026-03-06": { quickSlots: ["night"], customSlots: [] } } }],
  ]);
  const zones = [makeZone("zone-a", "Zona A", ["p1", "p2"])];
  const venueSchedules = [makeVenueSchedule("2026-03-06", "09:00", "23:00", 1)];

  const { zones: scheduled, unassignedCount, needsReviewCount } = buildAutoMatchSchedules(zones, registrationsById, venueSchedules, 75);

  assert.equal(unassignedCount, 0);
  assert.equal(needsReviewCount, 1);
  const match = scheduled[0].matchSchedules["1 vs 2"];
  assert.ok(match?.dayKey && match?.startTime && match?.venueId, "el partido tiene que quedar agendado igual, sin horario vacio");
});

test("buildAutoMatchSchedules: si no queda NINGUN horario con cancha libre, el ultimo partido se agenda igual (nivel 3, menos conflicto)", () => {
  const registrationsById = new Map<string, any>([
    ["p1", { availability: {} }], ["p2", { availability: {} }],
    ["p3", { availability: {} }], ["p4", { availability: {} }],
  ]);
  // Una sola cancha, un solo horario posible (75 min exactos): el primer
  // partido de la zona ocupa el unico slot que existe; el segundo no tiene
  // ningun horario libre para elegir.
  const zones = [makeZone("zone-a", "Zona A", ["p1", "p2", "p3", "p4"])];
  const venueSchedules = [makeVenueSchedule("2026-03-06", "09:00", "10:15", 1)];

  const { zones: scheduled, unassignedCount, needsReviewCount } = buildAutoMatchSchedules(zones, registrationsById, venueSchedules, 75);

  assert.equal(unassignedCount, 0, "unassignedCount siempre tiene que ser 0: ya no se deja ningun partido sin horario");
  assert.ok(needsReviewCount >= 1, "al menos un partido tuvo que caer en el nivel de menos conflicto");
  const matchSchedules = scheduled[0].matchSchedules;
  for (const matchKey of ["1 vs 2", "3 vs 4"]) {
    assert.ok(matchSchedules[matchKey]?.dayKey && matchSchedules[matchKey]?.startTime, `${matchKey} tiene que tener un horario asignado, aunque choque con otro partido`);
  }
});

test("buildAutoMatchSchedulesAcrossZones: tambien agenda siempre, incluso sin disponibilidad compatible entre categorias", () => {
  const registrationsById = new Map<string, any>([
    ["p1", { availability: { "2026-03-06": { quickSlots: ["morning"], customSlots: [] } } }],
    ["p2", { availability: { "2026-03-06": { quickSlots: ["night"], customSlots: [] } } }],
  ]);
  const zones = [{ ...makeZone("zone-a", "Zona A", ["p1", "p2"]), __tournamentId: "cat-a" }];
  const venueSchedules = [makeVenueSchedule("2026-03-06", "09:00", "23:00", 1)];

  const { zones: scheduled, unassignedCount, needsReviewCount } = buildAutoMatchSchedulesAcrossZones(zones, registrationsById, venueSchedules, 75);

  assert.equal(unassignedCount, 0);
  assert.equal(needsReviewCount, 1);
  const match = scheduled[0].matchSchedules["1 vs 2"];
  assert.ok(match?.dayKey && match?.startTime && match?.venueId);
});
