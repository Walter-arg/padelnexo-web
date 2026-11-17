import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Puntos por la instancia mas lejana que alcanzo la pareja en el torneo.
// "Campeon"/"Finalista" se resuelven solo si la pareja llego a la ronda
// final; el resto se resuelve por distancia a esa ronda, asi no importa
// cuantas rondas tenga el cuadro (6 a 32 parejas) ni si existe o no una
// ronda de 16avos. Mismo criterio que tournamentRankingService.js de la app.
const TIER_POINTS: Record<string, number> = {
  campeon: 100,
  finalista: 70,
  semifinal: 50,
  cuartos: 35,
  octavos: 25,
  dieciseisavos: 15,
  zona: 10,
};

function normalizeKey(value: string = ""): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function resolvePlayerKey(userId: string = "", name: string = ""): string {
  const trimmedId = String(userId || "").trim();
  if (trimmedId) return `uid:${trimmedId}`;
  return `name:${normalizeKey(name)}`;
}

function distanceToTierPoints(distance: number): number {
  if (distance === 1) return TIER_POINTS.semifinal;
  if (distance === 2) return TIER_POINTS.cuartos;
  if (distance === 3) return TIER_POINTS.octavos;
  return TIER_POINTS.dieciseisavos;
}

export type RankingPlayerPoints = { key: string; name: string; points: number };

export type TournamentRankingEntry = {
  organizerId: string;
  tournamentId: string;
  tournamentName: string;
  category: string;
  startDateMillis: number;
  endDateMillis: number;
  computedAtMillis: number;
  players: RankingPlayerPoints[];
};

export function computeTournamentRankingEntry(
  tournament: any,
  registrations: any[]
): TournamentRankingEntry | null {
  const organizerId = tournament?.organizerId || tournament?.createdBy || "";
  if (!organizerId || !tournament?.id) return null;

  const zones = tournament?.fixtureSetup?.zonePlanning?.zones ?? [];
  const roundsRaw = tournament?.fixtureSetup?.bracketPreview?.rounds ?? [];
  const rounds: any[][] = roundsRaw.map((round: any) =>
    Array.isArray(round) ? round : round?.matches ?? []
  );

  const regById = new Map((registrations ?? []).map((r: any) => [r.id, r]));
  const eligibleRegIds = new Set<string>();

  zones.forEach((zone: any) => {
    (zone.registrationIds ?? []).forEach((regId: string) => {
      const registration = regById.get(regId);
      if (!registration) return;
      if (registration.status === "rejected") return;
      if (String(registration.withdrawalStatus ?? "") === "confirmed") return;
      eligibleRegIds.add(regId);
    });
  });

  const pointsByRegId = new Map<string, number>();

  eligibleRegIds.forEach((regId) => {
    let reachedRoundIndex = -1;

    rounds.forEach((matches, roundIndex) => {
      matches.forEach((match: any) => {
        if (match?.teamAId === regId || match?.teamBId === regId) {
          reachedRoundIndex = Math.max(reachedRoundIndex, roundIndex);
        }
      });
    });

    if (reachedRoundIndex === -1) {
      pointsByRegId.set(regId, TIER_POINTS.zona);
      return;
    }

    const isFinalRound = reachedRoundIndex === rounds.length - 1;

    if (isFinalRound) {
      const finalMatch = rounds[reachedRoundIndex].find(
        (match: any) => match?.teamAId === regId || match?.teamBId === regId
      );
      const side = finalMatch?.teamAId === regId ? "teamA" : "teamB";
      const won = finalMatch?.result?.winner === side;
      pointsByRegId.set(regId, won ? TIER_POINTS.campeon : TIER_POINTS.finalista);
      return;
    }

    const distance = rounds.length - 1 - reachedRoundIndex;
    pointsByRegId.set(regId, distanceToTierPoints(distance));
  });

  const playersByKey = new Map<string, RankingPlayerPoints>();

  pointsByRegId.forEach((points, regId) => {
    const registration = regById.get(regId);
    if (!registration) return;

    [
      { userId: registration.player1Id ?? registration.player1UserId, name: registration.player1Name },
      { userId: registration.player2Id ?? registration.player2UserId, name: registration.player2Name },
    ].forEach((player) => {
      const name = String(player.name ?? "").trim();
      if (!name) return;

      const key = resolvePlayerKey(player.userId, name);
      const existing = playersByKey.get(key);
      playersByKey.set(key, { key, name, points: (existing?.points ?? 0) + points });
    });
  });

  return {
    organizerId,
    tournamentId: tournament.id,
    tournamentName: tournament.name ?? tournament.nombre ?? "Torneo",
    category: tournament.compositionConfig?.label ?? tournament.compositionLabel ?? "",
    startDateMillis: Number(tournament.startDateMillis ?? 0),
    endDateMillis: Number(tournament.endDateMillis ?? 0),
    computedAtMillis: Date.now(),
    players: Array.from(playersByKey.values()),
  };
}

export async function upsertTournamentRankingEntry(
  tournament: any,
  registrations: any[]
): Promise<TournamentRankingEntry | null> {
  const entry = computeTournamentRankingEntry(tournament, registrations);
  if (!entry) return null;

  await setDoc(doc(db, "tournamentRankingEntries", entry.tournamentId), entry);
  return entry;
}

export async function listOrganizerTournamentRankingEntries(
  organizerId: string
): Promise<TournamentRankingEntry[]> {
  if (!organizerId) return [];

  const snapshot = await getDocs(
    query(collection(db, "tournamentRankingEntries"), where("organizerId", "==", organizerId))
  );

  return snapshot.docs.map((docSnapshot) => docSnapshot.data() as TournamentRankingEntry);
}

export type OrganizerRankingConfig = { fromMillis: number; toMillis: number };
export type OrganizerRankingRow = RankingPlayerPoints & { rank: number };

export function buildOrganizerRanking(
  entries: TournamentRankingEntry[],
  config: OrganizerRankingConfig
): { categories: string[]; rankingsByCategory: Record<string, OrganizerRankingRow[]> } {
  const fromMillis = Number(config?.fromMillis ?? 0);
  const toMillis = Number(config?.toMillis ?? 0) > 0 ? Number(config.toMillis) : Date.now();

  const filtered = entries.filter((entry) => {
    const entryDate = Number(entry.startDateMillis || entry.endDateMillis || 0);
    return entryDate >= fromMillis && entryDate <= toMillis;
  });

  const bucketsByCategory = new Map<string, Map<string, RankingPlayerPoints>>();

  filtered.forEach((entry) => {
    const category = entry.category || "General";
    const bucket = bucketsByCategory.get(category) ?? new Map<string, RankingPlayerPoints>();

    (entry.players ?? []).forEach((player) => {
      const existing = bucket.get(player.key);
      bucket.set(player.key, { key: player.key, name: player.name, points: (existing?.points ?? 0) + player.points });
    });

    bucketsByCategory.set(category, bucket);
  });

  const categories = Array.from(bucketsByCategory.keys()).sort((a, b) => a.localeCompare(b, "es"));
  const rankingsByCategory: Record<string, OrganizerRankingRow[]> = {};

  categories.forEach((category) => {
    const rows = Array.from(bucketsByCategory.get(category)!.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name, "es");
    });

    let lastPoints: number | null = null;
    let lastRank = 0;

    rankingsByCategory[category] = rows.map((row, index) => {
      if (row.points !== lastPoints) {
        lastRank = index + 1;
        lastPoints = row.points;
      }

      return { ...row, rank: lastRank };
    });
  });

  return { categories, rankingsByCategory };
}

export async function getOrganizerRankingConfig(organizerId: string): Promise<OrganizerRankingConfig> {
  const snapshot = await getDoc(doc(db, "users", organizerId));
  const data = snapshot.exists() ? snapshot.data() ?? {} : {};
  return data.tournamentRankingConfig ?? { fromMillis: 0, toMillis: 0 };
}

export async function updateOrganizerRankingConfig(organizerId: string, config: OrganizerRankingConfig) {
  await updateDoc(doc(db, "users", organizerId), { tournamentRankingConfig: config });
}

export async function resetOrganizerRanking(organizerId: string): Promise<number> {
  const fromMillis = Date.now();
  await updateOrganizerRankingConfig(organizerId, { fromMillis, toMillis: 0 });
  return fromMillis;
}
