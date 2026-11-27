// Regresion de punta a punta para "BUG CRITICO - no se pueden asignar
// horarios" (vista previa feature/grilla-disponibilidad-web): un partido sin
// horario asignado, con canchas libres configuradas y SIN ningun otro
// partido agendado, tiene que tener opciones realmente libres en el
// selector. Reproduce el mismo camino que FixtureTab.tsx (scheduleModal):
// buildZoneMatchSchedulingSlots -> buildScheduleOccupancy ->
// buildAvailabilityWarningForParticipants -> validateMatchSlot.

import test from "node:test";
import assert from "node:assert/strict";
import { buildZoneMatchSchedulingSlots, getZoneMatchParticipantIds, buildAvailabilityWarningForParticipants, type ZoneVenueSchedule } from "../tournamentZones.ts";
import { buildScheduleOccupancy, validateMatchSlot, DEFAULT_REST_MINUTES, type ScheduledMatch } from "../scheduleValidation.ts";

function annotateSlots(allSlots: any[], participantIds: string[], registrationsById: Map<string, any>, occupancy: ReturnType<typeof buildScheduleOccupancy>, matchDurationMinutes: number, excludeKey: any) {
  return allSlots.map((slot) => {
    const availabilityWarning = buildAvailabilityWarningForParticipants(participantIds, registrationsById, slot.dayKey, slot.startMinutes);
    const result = validateMatchSlot({
      dayKey: slot.dayKey, startMinutes: slot.startMinutes, venueId: slot.venueId, courtIndex: slot.courtIndex,
      participantIds, excludeKey, occupancy, matchDurationMinutes, restMinutes: DEFAULT_REST_MINUTES,
      dependsOn: [], pairLabelsById: {}, availabilityWarning,
    });
    return { ...slot, ...result };
  });
}

test("regresion: partido sin horario, canchas libres, nadie cargo disponibilidad -> hay opciones libres", () => {
  const venueSchedules: ZoneVenueSchedule[] = [
    { id: "s1", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-06", from: "09:00", to: "23:00", courts: 2, selectedCourtIndices: [1, 2], useForZones: true, useForBracket: false },
  ];
  const matchDurationMinutes = 75;
  const allSlots = buildZoneMatchSchedulingSlots(venueSchedules, matchDurationMinutes);
  assert.ok(allSlots.length > 0, "tiene que generar al menos un horario candidato");

  const zone = { id: "zone-a", label: "Zona A", registrationIds: ["p1", "p2", "p3", "p4"], matchSchedules: {} };
  const participantIds = getZoneMatchParticipantIds(zone as any, "1 vs 2");
  const registrationsById = new Map<string, any>([
    ["p1", { availability: {} }],
    ["p2", { availability: {} }],
    ["p3", { availability: {} }],
    ["p4", { availability: {} }],
  ]);
  // Nada agendado todavia en ningun lado.
  const occupancy = buildScheduleOccupancy([] as ScheduledMatch[], matchDurationMinutes);

  const annotated = annotateSlots(allSlots, participantIds, registrationsById, occupancy, matchDurationMinutes, { tournamentId: "t1", zoneId: zone.id, matchKey: "1 vs 2" });

  const freeOnes = annotated.filter((s) => !s.hasConflict && !s.availabilityWarning);
  assert.equal(freeOnes.length, allSlots.length, "todos los horarios candidatos tienen que quedar libres (sin conflicto, sin advertencia)");
  assert.equal(annotated.filter((s) => s.hasConflict).length, 0);
});

test("regresion: con UN partido ya agendado en una cancha/hora, el resto de los horarios sigue libre (no se marca todo)", () => {
  const venueSchedules: ZoneVenueSchedule[] = [
    { id: "s1", venueId: "v1", venueName: "Club Central", dayKey: "2026-03-06", from: "09:00", to: "23:00", courts: 2, selectedCourtIndices: [1, 2], useForZones: true, useForBracket: false },
  ];
  const matchDurationMinutes = 75;
  const allSlots = buildZoneMatchSchedulingSlots(venueSchedules, matchDurationMinutes);

  const zone = { id: "zone-a", label: "Zona A", registrationIds: ["p1", "p2", "p3", "p4"], matchSchedules: {} };
  const participantIds = getZoneMatchParticipantIds(zone as any, "3 vs 4");
  const registrationsById = new Map<string, any>([
    ["p1", { availability: {} }], ["p2", { availability: {} }], ["p3", { availability: {} }], ["p4", { availability: {} }],
  ]);
  const occupancy = buildScheduleOccupancy([
    { tournamentId: "t1", zoneId: "zone-a", matchKey: "1 vs 2", dayKey: "2026-03-06", startMinutes: 9 * 60, venueId: "v1", courtIndex: 1, participantIds: ["p1", "p2"] },
  ], matchDurationMinutes);

  const annotated = annotateSlots(allSlots, participantIds, registrationsById, occupancy, matchDurationMinutes, { tournamentId: "t1", zoneId: zone.id, matchKey: "3 vs 4" });

  assert.equal(annotated.filter((s) => s.hasConflict).length, 1, "solo el horario que realmente choca con el partido ya agendado (misma cancha, mismo rango) tiene que marcarse");
  assert.ok(annotated.filter((s) => !s.hasConflict && !s.availabilityWarning).length > 1, "el resto de los horarios tiene que quedar libre");
});
