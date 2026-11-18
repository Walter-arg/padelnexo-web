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
  categoryFormat: string;
  sumRule: string;
  sumTarget: number;
  fixedCategoryA: string;
  fixedCategoryB: string;
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

// Mismas categorias y mismo orden que usa la app y el alta de torneos en la
// web (app/dashboard/torneos/nueva), para que un torneo "suma" filtre las
// combinaciones validas igual en los dos lugares.
export const CATEGORY_OPTIONS = [
  { label: "9na", value: "9na", num: 9 },
  { label: "8va", value: "8va", num: 8 },
  { label: "7ma", value: "7ma", num: 7 },
  { label: "6ta", value: "6ta", num: 6 },
  { label: "5ta", value: "5ta", num: 5 },
  { label: "4ta", value: "4ta", num: 4 },
  { label: "3ra", value: "3ra", num: 3 },
  { label: "2da", value: "2da", num: 2 },
  { label: "1era", value: "1era", num: 1 },
];

export function isSumFixedRule(sumRule: string) {
  return sumRule === "fixed" || sumRule === "sum_fixed";
}

export function getValidFirstCategoryOptions(sumTarget: number) {
  if (!sumTarget) return CATEGORY_OPTIONS;
  return CATEGORY_OPTIONS.filter((option) =>
    CATEGORY_OPTIONS.some((candidate) => candidate.num === sumTarget - option.num)
  );
}

export function getValidSecondCategoryOptions(sumTarget: number, firstCategory: string) {
  if (!sumTarget || !firstCategory) return getValidFirstCategoryOptions(sumTarget);
  const first = CATEGORY_OPTIONS.find((option) => option.value === firstCategory);
  if (!first) return getValidFirstCategoryOptions(sumTarget);
  return CATEGORY_OPTIONS.filter((option) => option.num === sumTarget - first.num);
}

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
  player1Category?: string;
  player2Category?: string;
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
