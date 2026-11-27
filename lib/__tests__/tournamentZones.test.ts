import test from "node:test";
import assert from "node:assert/strict";
import { buildAvailabilityWarningForParticipants } from "../tournamentZones.ts";

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
