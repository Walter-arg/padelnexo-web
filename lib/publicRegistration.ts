// Inscripcion publica a torneos via link, sin login. Usa las Cloud Functions
// getPublicTournamentInfo / submitPublicTournamentRegistration (una tercera
// via de inscripcion, junto a la del organizador y la del jugador logueado
// desde la app). El esquema de availability es el mismo que usa el resto del
// torneo (lib/tournamentZones.ts), asi que entra directo en el armado de
// zonas sin ningun cambio ahi.

const GET_PUBLIC_TOURNAMENT_INFO_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/getPublicTournamentInfo";
const SUBMIT_PUBLIC_TOURNAMENT_REGISTRATION_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/submitPublicTournamentRegistration";

export type PublicTournamentInfo = {
  id: string;
  name: string;
  startDateMillis: number;
  endDateMillis: number;
  compositionLabel: string;
  entryFee: number;
  maxPairs: number;
  registeredCount: number;
  organizerName: string;
  venueName: string;
  coverImage: string;
  organizerLogoUrl: string;
  rules: string;
  status: string;
  open: boolean;
  reason: string;
};

export type PublicAvailability = Record<
  string,
  { quickSlots: string[]; customSlots: { from: string; to: string }[] }
>;

export function buildPublicDayOptions(
  startDateMillis?: number,
  endDateMillis?: number
): { key: string; label: string }[] {
  if (!startDateMillis || !endDateMillis) return [];

  const days: { key: string; label: string }[] = [];
  const cursor = new Date(startDateMillis);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDateMillis);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end && days.length < 45) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
      cursor.getDate()
    ).padStart(2, "0")}`;
    const raw = cursor.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
    days.push({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export async function fetchPublicTournamentInfo(tournamentId: string): Promise<PublicTournamentInfo> {
  const params = new URLSearchParams({ tournamentId });
  const response = await fetch(`${GET_PUBLIC_TOURNAMENT_INFO_URL}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "No pudimos cargar el torneo.");
  }

  return data as PublicTournamentInfo;
}

export async function submitPublicTournamentRegistration(payload: {
  tournamentId: string;
  player1Name: string;
  player2Name: string;
  contactPhone: string;
  notes: string;
  availability: PublicAvailability;
}): Promise<{ id: string }> {
  const response = await fetch(SUBMIT_PUBLIC_TOURNAMENT_REGISTRATION_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "No pudimos enviar la inscripcion.");
  }

  return data;
}
