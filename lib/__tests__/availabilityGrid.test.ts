// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\screens\TournamentZonePlanningScreen.js
// No existe un test dedicado del lado de la app para estos helpers (se
// verifican a mano ahi, dentro de la pantalla); si se agrega uno, usar los
// mismos casos que este archivo.

import test from "node:test";
import assert from "node:assert/strict";
import {
  getCategoryColor,
  getHourColumnsForDay,
  getTotalLoadedHours,
  getHoursStatusTag,
  buildZoneLetterMapForZones,
  sortRegistrationsUnassignedFirst,
  isSlotAvailable,
  buildAvailabilityAfterCellToggle,
} from "../availabilityGrid.ts";

const DAY_OPTIONS = [
  { key: "2026-03-06", label: "viernes" },
  { key: "2026-03-07", label: "sabado" },
];

test("getCategoryColor cicla la paleta por indice", () => {
  assert.equal(getCategoryColor(0), "#1B5D92");
  assert.equal(getCategoryColor(6), "#1B5D92");
});

test("getHourColumnsForDay: sin horarios configurados para ese dia -> vacio", () => {
  const columns = getHourColumnsForDay([{ dayKey: "2026-03-06", from: "09:00", to: "13:00" }], "2026-03-07");
  assert.deepEqual(columns, []);
});

test("getHourColumnsForDay: toma el rango mas temprano a mas tardio entre varias franjas", () => {
  const columns = getHourColumnsForDay(
    [
      { dayKey: "2026-03-06", from: "09:00", to: "13:00" },
      { dayKey: "2026-03-06", from: "18:30", to: "23:00" },
    ],
    "2026-03-06"
  );
  assert.equal(columns[0].label, "09:00");
  assert.equal(columns[columns.length - 1].label, "22:00");
  assert.equal(columns.length, 14);
});

test("getTotalLoadedHours suma quickSlots y customSlots de todos los dias", () => {
  const registration = {
    availability: {
      "2026-03-06": { quickSlots: ["morning"], customSlots: [] },
      "2026-03-07": { quickSlots: [], customSlots: [{ from: "20:00", to: "22:30" }] },
    },
  };
  assert.equal(getTotalLoadedHours(registration), 4 + 2.5);
});

test("getHoursStatusTag: sin horario / menos de 4h / 4h o mas", () => {
  assert.deepEqual(getHoursStatusTag(0), { tone: "danger", label: "Sin horario" });
  assert.deepEqual(getHoursStatusTag(2), { tone: "warning", label: "2 h" });
  assert.deepEqual(getHoursStatusTag(4), { tone: "success", label: "4 h" });
});

test("buildZoneLetterMapForZones: letra sacada del label, o por posicion si no hay 'Zona X'", () => {
  const map = buildZoneLetterMapForZones([
    { label: "Zona B", registrationIds: ["p1", "p2"] },
    { label: "Grupo raro", registrationIds: ["p3"] },
  ]);
  assert.equal(map.get("p1"), "B");
  assert.equal(map.get("p2"), "B");
  assert.equal(map.get("p3"), "B");
});

test("sortRegistrationsUnassignedFirst: sin zona primero, luego por letra de zona", () => {
  const regs = [
    { id: "p-zoneB" },
    { id: "p-unassigned" },
    { id: "p-zoneA" },
  ];
  const assignedIds = new Set(["p-zoneB", "p-zoneA"]);
  const zoneLetterMap = new Map([["p-zoneB", "B"], ["p-zoneA", "A"]]);
  const sorted = sortRegistrationsUnassignedFirst(regs, assignedIds, zoneLetterMap);
  assert.deepEqual(sorted.map((r) => r.id), ["p-unassigned", "p-zoneA", "p-zoneB"]);
});

test("isSlotAvailable: detecta quickSlot, customSlot y franja overnight", () => {
  const registration = {
    availability: {
      "2026-03-06": { quickSlots: ["morning"], customSlots: [{ from: "23:00", to: "02:00" }] },
    },
  };
  assert.equal(isSlotAvailable(registration, "2026-03-06", 9 * 60), true);
  assert.equal(isSlotAvailable(registration, "2026-03-06", 13 * 60), false);
  assert.equal(isSlotAvailable(registration, "2026-03-06", 24 * 60 + 60), true);
});

test("buildAvailabilityAfterCellToggle: pintar una hora libre crea una franja custom de 1h", () => {
  const registration = { availability: {} };
  const next = buildAvailabilityAfterCellToggle(registration, "2026-03-06", 20 * 60, DAY_OPTIONS);
  assert.deepEqual(next["2026-03-06"], { quickSlots: [], customSlots: [{ from: "20:00", to: "21:00" }] });
});

test("buildAvailabilityAfterCellToggle: despintar una hora en medio de un quickSlot lo parte en dos custom", () => {
  // "morning" = 08:00-12:00; despintar 10:00 debe dejar 08:00-10:00 y 11:00-12:00
  const registration = { availability: { "2026-03-06": { quickSlots: ["morning"], customSlots: [] } } };
  const next = buildAvailabilityAfterCellToggle(registration, "2026-03-06", 10 * 60, DAY_OPTIONS);
  assert.deepEqual(next["2026-03-06"].quickSlots, []);
  assert.deepEqual(next["2026-03-06"].customSlots, [
    { from: "08:00", to: "10:00" },
    { from: "11:00", to: "12:00" },
  ]);
});

test("buildAvailabilityAfterCellToggle: despintar el extremo de una franja custom la acorta sin partirla", () => {
  const registration = { availability: { "2026-03-06": { quickSlots: [], customSlots: [{ from: "19:00", to: "21:00" }] } } };
  const next = buildAvailabilityAfterCellToggle(registration, "2026-03-06", 20 * 60, DAY_OPTIONS);
  assert.deepEqual(next["2026-03-06"].customSlots, [{ from: "19:00", to: "20:00" }]);
});
