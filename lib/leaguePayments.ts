// Portado desde src/services/leaguesService.js (app movil) para que la web
// calcule exactamente los mismos cobros pendientes/pagados de una liga,
// usando el campo real `roundPayments` (array dentro del documento de la
// liga), no una subcoleccion separada.

export const LEAGUE_REGISTRATION_PAYMENT_ROUND_ID = "__league_registration_fee__";

function normalizeCount(value: any, fallback = 0): number {
  const parsedValue = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

function normalizeMoneyValue(value: any, fallback = 0): number {
  const parsedValue = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  if (Number.isNaN(parsedValue) || parsedValue < 0) return fallback;
  return Math.round(parsedValue * 100) / 100;
}

function uniqueBy<T>(items: T[] = [], keyBuilder: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyBuilder(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePlayerSide(value: any = ""): string {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "drive") return "drive";
  if (normalized === "reves" || normalized === "revés") return "reves";
  return "ambos";
}

export function normalizePlayerEntry(player: any = {}) {
  return {
    id: player.id || player.linkedUserId || `player-${Date.now()}-${Math.random()}`,
    type: player.type || (player.linkedUserId ? "registered" : "guest"),
    linkedUserId: player.linkedUserId || "",
    nombre: player.nombre || "Jugador",
    apellido: player.apellido || player.lastName || "",
    categoria: player.categoria || "",
    sexo: player.sexo || "",
    pairNumber: normalizeCount(player.pairNumber, 0),
  };
}

function normalizeTeam(team: any = {}, fallbackIndex = 0) {
  const players = Array.isArray(team.players) ? team.players.map(normalizePlayerEntry) : [];
  return {
    id: team.id || `team-${fallbackIndex + 1}`,
    label: team.label || players.map((p: any) => p.nombre).join(" / ") || `Pareja ${fallbackIndex + 1}`,
    players,
  };
}

function buildPlayerKey(player: any = {}): string {
  return player.linkedUserId || player.id || player.nombre || "";
}

function formatPlayerShortName(player: any = {}): string {
  const firstName = String(player.nombre || player.name || "").trim();
  const lastName = String(player.apellido || player.lastName || "").trim();
  if (lastName && firstName) return `${lastName} ${firstName.charAt(0).toUpperCase()}.`;
  const nameParts = firstName.split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) {
    const inferredLastName = nameParts[nameParts.length - 1];
    const inferredFirstInitial = nameParts[0].charAt(0).toUpperCase();
    return `${inferredLastName} ${inferredFirstInitial}.`;
  }
  return firstName || "Jugador";
}

function formatTeamShortLabel(players: any[] = [], fallback = "Pareja"): string {
  const label = players.map(formatPlayerShortName).filter(Boolean).join(" / ");
  return label || fallback;
}

function buildTeamPlayersKey(players: any[] = []): string {
  return players.map(buildPlayerKey).filter(Boolean).sort().join("|");
}

function buildTeamKey(team: any = {}): string {
  if (team.id) return team.id;
  const playerKey = buildTeamPlayersKey(team.players || []);
  return playerKey || team.label || "";
}

function getPaymentParticipantId(teamType: string, participant: any): string {
  return teamType === "pair" ? buildTeamKey(participant) : buildPlayerKey(participant);
}

function getPaymentParticipantLabel(teamType: string, participant: any): string {
  if (teamType === "pair") {
    return participant.label || formatTeamShortLabel(participant.players || []);
  }
  return participant.nombre || "Jugador";
}

function teamHasPlayer(team: any = {}, playerKey = ""): boolean {
  if (!playerKey) return false;
  return (team.players || []).some((player: any) => buildPlayerKey(player) === playerKey);
}

function getMatchCompletedAtMillis(match: any = {}, fallbackMillis = 0): number {
  return normalizeCount(match.completedAtMillis, 0) || normalizeCount(fallbackMillis, 0);
}

function getPlayerCompletedAtMillisFromMatches(matches: any[] = [], playerKey = "", fallbackMillis = 0): number {
  const completedValues = matches
    .filter((match) => teamHasPlayer(match.teamA, playerKey) || teamHasPlayer(match.teamB, playerKey))
    .map((match) => getMatchCompletedAtMillis(match, fallbackMillis))
    .filter((value) => value > 0);
  return completedValues.length ? Math.max(...completedValues) : normalizeCount(fallbackMillis, 0);
}

function isMatchAvailableForPayment(match: any = {}): boolean {
  if (!match) return false;
  if (match?.suspensionMode && !match?.result?.winner) return false;
  return Boolean((match?.teamA?.players || []).length || (match?.teamB?.players || []).length);
}

export type RoundPaymentEntry = {
  participantId: string;
  participantType: string;
  participantLabel: string;
  pairId: string;
  pairLabel: string;
  playerIds: string[];
  completedAtMillis: number;
  paymentStatus: string;
  paymentMethod: string;
  mercadoPagoPreferenceId: string;
  mercadoPagoCheckoutUrl: string;
  mercadoPagoPaymentId: string;
  mercadoPagoStatus: string;
  mercadoPagoStatusDetail: string;
  paymentGateway: string;
  proofUrl: string;
  proofFileName: string;
  proofUploadedAtMillis: number;
  proofUploadedBy: string;
  proofUploadedByName: string;
  confirmedAtMillis: number;
  confirmedBy: string;
  confirmedByName: string;
  rejectedAtMillis: number;
  rejectedBy: string;
  rejectedByName: string;
  updatedAtMillis: number;
  updatedBy: string;
  updatedByName: string;
};

export type RoundPayments = { roundId: string; entries: RoundPaymentEntry[] };

export function normalizeRoundPayments(roundPayments: any[] = []): RoundPayments[] {
  if (!Array.isArray(roundPayments)) return [];
  return roundPayments.map((roundPayment) => ({
    roundId: roundPayment?.roundId || "",
    entries: Array.isArray(roundPayment?.entries)
      ? roundPayment.entries.map((entry: any) => ({
          participantId: entry?.participantId || "",
          participantType: entry?.participantType || "player",
          participantLabel: entry?.participantLabel || "Jugador",
          pairId: entry?.pairId || "",
          pairLabel: entry?.pairLabel || "",
          playerIds: Array.isArray(entry?.playerIds) ? entry.playerIds.filter(Boolean) : [],
          paymentStatus: entry?.paymentStatus || "pendiente",
          paymentMethod: entry?.paymentMethod || "",
          mercadoPagoPreferenceId: entry?.mercadoPagoPreferenceId || "",
          mercadoPagoCheckoutUrl: entry?.mercadoPagoCheckoutUrl || "",
          mercadoPagoPaymentId: entry?.mercadoPagoPaymentId || "",
          mercadoPagoStatus: entry?.mercadoPagoStatus || "",
          mercadoPagoStatusDetail: entry?.mercadoPagoStatusDetail || "",
          paymentGateway: entry?.paymentGateway || "",
          proofUrl: entry?.proofUrl || "",
          proofFileName: entry?.proofFileName || "",
          proofUploadedAtMillis: normalizeCount(entry?.proofUploadedAtMillis, 0),
          proofUploadedBy: entry?.proofUploadedBy || "",
          proofUploadedByName: entry?.proofUploadedByName || "",
          confirmedAtMillis: normalizeCount(entry?.confirmedAtMillis, 0),
          confirmedBy: entry?.confirmedBy || "",
          confirmedByName: entry?.confirmedByName || "",
          rejectedAtMillis: normalizeCount(entry?.rejectedAtMillis, 0),
          rejectedBy: entry?.rejectedBy || "",
          rejectedByName: entry?.rejectedByName || "",
          updatedAtMillis: normalizeCount(entry?.updatedAtMillis, 0),
          updatedBy: entry?.updatedBy || "",
          updatedByName: entry?.updatedByName || "",
        }))
      : [],
  }));
}

function resolveRoundPaymentParticipants(league: any = {}, round: any = {}) {
  const matches = Array.isArray(round?.matches) ? round.matches : [];
  const paymentMatches = matches.filter(isMatchAvailableForPayment);
  const completedMatches = paymentMatches.filter((match: any) => match?.result?.winner);
  const fallbackCompletedAtMillis = normalizeCount(round?.completedAtMillis, 0);

  if (league?.teamType === "pair") {
    const teams = paymentMatches.flatMap((match: any) => [match.teamA, match.teamB]).filter(Boolean);
    const uniqueTeams = uniqueBy(
      teams.map((team: any, index: number) => normalizeTeam(team, index)),
      (team: any) => getPaymentParticipantId("pair", team)
    );

    return uniqueTeams.flatMap((team: any) => {
      const pairId = getPaymentParticipantId("pair", team);
      const pairLabel = getPaymentParticipantLabel("pair", team);
      const teamPlayers = Array.isArray(team.players) ? team.players.map(normalizePlayerEntry) : [];

      return teamPlayers.map((player: any) => {
        const playerId = buildPlayerKey(player);
        return {
          id: playerId,
          type: "player",
          label: getPaymentParticipantLabel("individual", player),
          pairId,
          pairLabel,
          playerIds: [playerId].filter(Boolean),
          completedAtMillis: getPlayerCompletedAtMillisFromMatches(completedMatches, playerId, fallbackCompletedAtMillis),
        };
      });
    });
  }

  const players = paymentMatches.flatMap((match: any) => [
    ...(match?.teamA?.players || []),
    ...(match?.teamB?.players || []),
  ]);

  return uniqueBy(
    players.map(normalizePlayerEntry),
    (player: any) => getPaymentParticipantId("individual", player)
  ).map((player: any) => ({
    id: getPaymentParticipantId("individual", player),
    type: "player",
    label: getPaymentParticipantLabel("individual", player),
    pairId: "",
    pairLabel: "",
    playerIds: [buildPlayerKey(player)].filter(Boolean),
    completedAtMillis: getPlayerCompletedAtMillisFromMatches(completedMatches, buildPlayerKey(player), fallbackCompletedAtMillis),
  }));
}

function resolveLeagueRegistrationPaymentParticipants(league: any = {}) {
  const players = Array.isArray(league?.players) ? league.players.map(normalizePlayerEntry) : [];

  if (league?.teamType === "pair") {
    const groupedPairs: Record<string, any[]> = players.reduce((accumulator: any, player: any) => {
      const pairNumber = normalizeCount(player?.pairNumber, 0);
      const key = pairNumber > 0 ? `pair-${pairNumber}` : `single-${buildPlayerKey(player)}`;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(player);
      return accumulator;
    }, {});

    return Object.values(groupedPairs).flatMap((pairPlayers: any) => {
      const pairLabel = formatTeamShortLabel(pairPlayers);
      const pairId = `registration-${pairPlayers.map((p: any) => buildPlayerKey(p)).filter(Boolean).join("-")}`;

      return pairPlayers.map((player: any) => {
        const playerId = buildPlayerKey(player);
        return {
          id: playerId,
          type: "player",
          label: getPaymentParticipantLabel("individual", player),
          pairId,
          pairLabel,
          playerIds: [playerId].filter(Boolean),
          completedAtMillis: normalizeCount(league?.createdAtMillis, 0) || 1,
        };
      });
    });
  }

  return uniqueBy(players, (player: any) => getPaymentParticipantId("individual", player)).map((player: any) => ({
    id: getPaymentParticipantId("individual", player),
    type: "player",
    label: getPaymentParticipantLabel("individual", player),
    pairId: "",
    pairLabel: "",
    playerIds: [buildPlayerKey(player)].filter(Boolean),
    completedAtMillis: normalizeCount(league?.createdAtMillis, 0) || 1,
  }));
}

export type PaymentRound = {
  roundId: string;
  roundNumber: number;
  title: string;
  paymentKind: "registration" | "round";
  amountPerEntry: number;
  entries: RoundPaymentEntry[];
};

// Equivalente a resolveLeaguePaymentRounds en leaguesService.js: combina lo
// que ya quedo guardado en league.roundPayments con la lista completa de
// participantes que deberian figurar (segun el fixture y los jugadores
// cargados), para que las fechas sin ningun pago registrado todavia
// tambien aparezcan como "pendiente".
export function resolveLeaguePaymentRounds(league: any = {}): PaymentRound[] {
  const fixtureRounds = Array.isArray(league?.fixture?.rounds) ? league.fixture.rounds : [];
  const storedRoundPayments = normalizeRoundPayments(league?.roundPayments);
  const paymentRounds: PaymentRound[] = [];
  const registrationFeeEnabled = league?.paymentConfig?.registrationFeeEnabled === true;
  const registrationFeeAmount = normalizeMoneyValue(league?.paymentConfig?.registrationFeeAmount, 0);

  function buildEntry(participant: any, storedRound: RoundPayments) {
    const storedEntry =
      storedRound.entries.find((entry) => entry.participantId === participant.id) ||
      storedRound.entries.find((entry) => participant.pairId && entry.participantId === participant.pairId) ||
      null;

    return {
      participantId: participant.id,
      participantType: participant.type,
      participantLabel: participant.label,
      pairId: participant.pairId || "",
      pairLabel: participant.pairLabel || "",
      playerIds: participant.playerIds,
      completedAtMillis: normalizeCount(participant.completedAtMillis, 0),
      paymentStatus: storedEntry?.paymentStatus || "pendiente",
      paymentMethod: storedEntry?.paymentMethod || "",
      mercadoPagoPreferenceId: storedEntry?.mercadoPagoPreferenceId || "",
      mercadoPagoCheckoutUrl: storedEntry?.mercadoPagoCheckoutUrl || "",
      mercadoPagoPaymentId: storedEntry?.mercadoPagoPaymentId || "",
      mercadoPagoStatus: storedEntry?.mercadoPagoStatus || "",
      mercadoPagoStatusDetail: storedEntry?.mercadoPagoStatusDetail || "",
      paymentGateway: storedEntry?.paymentGateway || "",
      proofUrl: storedEntry?.proofUrl || "",
      proofFileName: storedEntry?.proofFileName || "",
      proofUploadedAtMillis: normalizeCount(storedEntry?.proofUploadedAtMillis, 0),
      proofUploadedBy: storedEntry?.proofUploadedBy || "",
      proofUploadedByName: storedEntry?.proofUploadedByName || "",
      confirmedAtMillis: normalizeCount(storedEntry?.confirmedAtMillis, 0),
      confirmedBy: storedEntry?.confirmedBy || "",
      confirmedByName: storedEntry?.confirmedByName || "",
      rejectedAtMillis: normalizeCount(storedEntry?.rejectedAtMillis, 0),
      rejectedBy: storedEntry?.rejectedBy || "",
      rejectedByName: storedEntry?.rejectedByName || "",
      updatedAtMillis: normalizeCount(storedEntry?.updatedAtMillis, 0),
      updatedBy: storedEntry?.updatedBy || "",
      updatedByName: storedEntry?.updatedByName || "",
    } as RoundPaymentEntry;
  }

  if (registrationFeeEnabled && registrationFeeAmount > 0) {
    const registrationParticipants = resolveLeagueRegistrationPaymentParticipants(league);
    const storedRegistrationRound =
      storedRoundPayments.find((entry) => entry.roundId === LEAGUE_REGISTRATION_PAYMENT_ROUND_ID) || {
        roundId: LEAGUE_REGISTRATION_PAYMENT_ROUND_ID,
        entries: [],
      };

    paymentRounds.push({
      roundId: LEAGUE_REGISTRATION_PAYMENT_ROUND_ID,
      roundNumber: 0,
      title: "Inscripcion",
      paymentKind: "registration",
      amountPerEntry: registrationFeeAmount,
      entries: registrationParticipants.map((participant: any) => buildEntry(participant, storedRegistrationRound)),
    });
  }

  const roundPayments = fixtureRounds.map((round: any, index: number) => {
    const roundParticipants = resolveRoundPaymentParticipants(league, round);
    const storedRound = storedRoundPayments.find((entry) => entry.roundId === round.id) || {
      roundId: round.id,
      entries: [],
    };

    return {
      roundId: round.id,
      roundNumber: round.number || index + 1,
      title: round.title || `Fecha ${index + 1}`,
      paymentKind: "round" as const,
      amountPerEntry: normalizeMoneyValue(league?.paymentConfig?.roundPricePerPlayer, 0),
      entries: roundParticipants.map((participant: any) => buildEntry(participant, storedRound)),
    };
  });

  return [...paymentRounds, ...roundPayments];
}

// Equivalente a serializeRoundPayments en LeaguePaymentsScreen.js: deja el
// draft completo (que incluye placeholders "pendiente" para todos los
// participantes, no solo los que ya tuvieron movimiento) en la forma que se
// guarda en Firestore.
export function serializeRoundPayments(roundPayments: PaymentRound[] = []) {
  return roundPayments.map((round) => ({
    roundId: round.roundId,
    entries: (round.entries || []).map((entry) => ({ ...entry })),
  }));
}

export function patchRoundPaymentEntry(
  roundPayments: PaymentRound[],
  roundId: string,
  participantId: string,
  patch: Partial<RoundPaymentEntry>,
  actor: { id: string; name: string }
): PaymentRound[] {
  return roundPayments.map((round) =>
    round.roundId !== roundId
      ? round
      : {
          ...round,
          entries: round.entries.map((entry) =>
            entry.participantId !== participantId
              ? entry
              : {
                  ...entry,
                  ...patch,
                  updatedAtMillis: Date.now(),
                  updatedBy: actor?.id || "",
                  updatedByName: actor?.name || "",
                }
          ),
        }
  );
}
