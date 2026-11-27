// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\utils\__tests__\scheduleValidation.test.js
// Mismos casos (a-f) que el test de la app, para que quede claro que ambas
// plataformas validan exactamente igual. Se corre con el test runner nativo
// de Node (node --experimental-strip-types --test), sin instalar nada: Node
// 22.6+ puede ejecutar TypeScript simple (sin enums ni namespaces con valor
// en tiempo de ejecucion, que no es el caso de este modulo) quitandole los
// tipos al vuelo.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  DEFAULT_REST_MINUTES,
  buildScheduleOccupancy,
  formatMinutesToTime,
  validateMatchSlot,
} from "../scheduleValidation.ts";

test("DEFAULT_MATCH_DURATION_MINUTES es 75 y DEFAULT_REST_MINUTES es 0", () => {
  assert.equal(DEFAULT_MATCH_DURATION_MINUTES, 75);
  assert.equal(DEFAULT_REST_MINUTES, 0);
});

test("a) cancha ocupada por categoria hermana con rango superpuesto -> conflicto con el mensaje correcto", () => {
  const occupancy = buildScheduleOccupancy(
    [
      {
        categoryLabel: "5ta",
        courtIndex: 2,
        dayKey: "2026-03-06",
        matchKey: "1 vs 2",
        participantIds: [],
        startMinutes: 19 * 60,
        tournamentId: "sibling-tournament",
        venueId: "venue-1",
        zoneId: "zone-b",
        zoneLabel: "Zona B",
      },
    ],
    75
  );

  const result = validateMatchSlot({
    courtIndex: 2,
    dayKey: "2026-03-06",
    excludeKey: { matchKey: "1 vs 2", tournamentId: "own-tournament", zoneId: "zone-a" },
    occupancy,
    participantIds: [],
    startMinutes: 19 * 60 + 30,
    venueId: "venue-1",
  });

  assert.equal(result.hasConflict, true);
  assert.equal(result.conflictReason, "Cancha 2 ocupada por 5ta · Zona B hasta las 20:15");
  assert.equal(result.availabilityWarning, "");
});

test("b) un partido termina justo cuando empieza el otro (misma cancha) -> sin conflicto", () => {
  const occupancy = buildScheduleOccupancy(
    [
      {
        courtIndex: 2,
        dayKey: "2026-03-06",
        matchKey: "1 vs 2",
        participantIds: [],
        startMinutes: 19 * 60,
        tournamentId: "sibling-tournament",
        venueId: "venue-1",
        zoneId: "zone-b",
      },
    ],
    75
  );

  const result = validateMatchSlot({
    courtIndex: 2,
    dayKey: "2026-03-06",
    occupancy,
    participantIds: [],
    startMinutes: 20 * 60 + 15,
    venueId: "venue-1",
  });

  assert.equal(result.hasConflict, false);
  assert.equal(result.conflictReason, "");
});

test("c) una pareja con dos partidos superpuestos en distintas canchas -> conflicto", () => {
  const occupancy = buildScheduleOccupancy(
    [
      {
        courtIndex: 3,
        dayKey: "2026-03-06",
        matchKey: "1 vs 2",
        participantIds: ["pair-1", "pair-2"],
        startMinutes: 19 * 60,
        tournamentId: "own-tournament",
        venueId: "venue-1",
        zoneId: "zone-a",
      },
    ],
    75
  );

  const result = validateMatchSlot({
    courtIndex: 4,
    dayKey: "2026-03-06",
    excludeKey: { matchKey: "1 vs 3", tournamentId: "own-tournament", zoneId: "zone-a" },
    occupancy,
    participantIds: ["pair-1", "pair-3"],
    pairLabelsById: { "pair-1": "Gomez / Ruiz" },
    startMinutes: 19 * 60 + 30,
    venueId: "venue-1",
  });

  assert.equal(result.hasConflict, true);
  assert.equal(result.conflictReason, "Gomez / Ruiz esta jugando hasta las 20:15");
});

test("d) zona de 4: G vs G antes de que terminen los dos de ida -> conflicto; justo al terminar -> sin conflicto", () => {
  const dependsOn = [
    { dayKey: "2026-03-06", endMinutes: 20 * 60 + 15 },
    { dayKey: "2026-03-06", endMinutes: 20 * 60 + 30 },
  ];

  const tooEarly = validateMatchSlot({
    courtIndex: 5,
    dayKey: "2026-03-06",
    dependsOn,
    occupancy: buildScheduleOccupancy([], 75),
    participantIds: [],
    startMinutes: 20 * 60,
    venueId: "venue-1",
  });

  assert.equal(tooEarly.hasConflict, true);
  assert.equal(
    tooEarly.conflictReason,
    "Este cruce depende de los partidos de ida de la zona: no puede empezar antes de las 20:30"
  );

  const rightOnTime = validateMatchSlot({
    courtIndex: 5,
    dayKey: "2026-03-06",
    dependsOn,
    occupancy: buildScheduleOccupancy([], 75),
    participantIds: [],
    startMinutes: 20 * 60 + 30,
    venueId: "venue-1",
  });

  assert.equal(rightOnTime.hasConflict, false);
});

test("e) horario fuera de la disponibilidad cargada -> advertencia, nunca conflicto", () => {
  const result = validateMatchSlot({
    availabilityWarning: "Este horario esta fuera de la disponibilidad cargada por alguna de las parejas.",
    courtIndex: 1,
    dayKey: "2026-03-06",
    occupancy: buildScheduleOccupancy([], 75),
    participantIds: ["pair-1"],
    startMinutes: 19 * 60,
    venueId: "venue-1",
  });

  assert.equal(result.hasConflict, false);
  assert.equal(
    result.availabilityWarning,
    "Este horario esta fuera de la disponibilidad cargada por alguna de las parejas."
  );
});

test("f) la duracion sale de matchDurationMinutes; si no se pasa, usa 75 por defecto", () => {
  const occupancy = buildScheduleOccupancy(
    [
      {
        courtIndex: 1,
        dayKey: "2026-03-06",
        matchKey: "1 vs 2",
        participantIds: [],
        startMinutes: 19 * 60,
        tournamentId: "sibling",
        venueId: "venue-1",
        zoneId: "zone-b",
      },
    ],
    60
  );

  // Con duracion de 60 (configurada), 20:00 ya no se superpone con 19:00-20:00.
  const withConfiguredDuration = validateMatchSlot({
    courtIndex: 1,
    dayKey: "2026-03-06",
    matchDurationMinutes: 60,
    occupancy,
    participantIds: [],
    startMinutes: 20 * 60,
    venueId: "venue-1",
  });

  assert.equal(withConfiguredDuration.hasConflict, false);

  const occupancyWithDefaultDuration = buildScheduleOccupancy(
    [
      {
        courtIndex: 1,
        dayKey: "2026-03-06",
        matchKey: "1 vs 2",
        participantIds: [],
        startMinutes: 19 * 60,
        tournamentId: "sibling",
        venueId: "venue-1",
        zoneId: "zone-b",
      },
    ],
    DEFAULT_MATCH_DURATION_MINUTES
  );

  const withDefaultDuration = validateMatchSlot({
    courtIndex: 1,
    dayKey: "2026-03-06",
    occupancy: occupancyWithDefaultDuration,
    participantIds: [],
    startMinutes: 20 * 60,
    venueId: "venue-1",
  });

  assert.equal(withDefaultDuration.hasConflict, true);
  assert.equal(withDefaultDuration.conflictReason, "Cancha 1 ocupada por otro partido hasta las 20:15");
});

test("formatMinutesToTime da formato HH:MM", () => {
  assert.equal(formatMinutesToTime(19 * 60 + 5), "19:05");
  assert.equal(formatMinutesToTime(0), "00:00");
});
